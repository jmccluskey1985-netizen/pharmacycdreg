import { NextResponse } from 'next/server';
import { requireStaff, errorResponse, audit } from '@/lib/access';
import { createServiceClient } from '@/lib/supabase/server';
import { extractFromDocument, ScanError } from '@/lib/scan-extract';
import { balancesFor } from '@/lib/registers';
import { liveRegisters, matchRegister } from '@/lib/match';
import { decideQuantity } from '@/lib/quantity';
import { getSettings } from '@/lib/settings';
import { canonicalForm } from '@/data/cd-products';
import { getReaderConfig } from '@/lib/reader-config';
import { identifySupplier, looksLikeOwnPharmacy, checkReference } from '@/lib/invoice-rules';
import { registerExemption } from '@/lib/cd-catalogue';
import { checkRateLimit } from '@/lib/rate-limit';
import { can } from '@/lib/roles';

export const maxDuration = 120;

const ALLOWED = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf'];
const MAX_BYTES = 15 * 1024 * 1024;

// Photo/PDF of an Rx or invoice → extracted CD lines, each matched to a live register,
// with a proposed register entry. Nothing is written to the register here.
export async function POST(req: Request) {
  try {
    const { account, staff } = await requireStaff(can.scan, { write: true });
    const limit = checkRateLimit(`scan:${account.pharmacyId}`, 20, 60_000);
    if (!limit.ok) return NextResponse.json({ error: 'Too many scans — wait a moment' }, { status: 429 });

    const form = await req.formData();
    const files = form.getAll('file').filter((f): f is File => f instanceof File);
    if (!files.length) return NextResponse.json({ error: 'Attach a photo or PDF' }, { status: 400 });
    if (files.length > 10) return NextResponse.json({ error: 'Up to 10 pages per scan' }, { status: 400 });
    for (const f of files) {
      if (!ALLOWED.includes(f.type)) return NextResponse.json({ error: 'Use a JPG, PNG, WEBP or PDF' }, { status: 400 });
    }
    if (files.reduce((n, f) => n + f.size, 0) > MAX_BYTES) return NextResponse.json({ error: 'Files are too large (max 15 MB total)' }, { status: 400 });

    const docs = await Promise.all(files.map(async (f) => ({ base64: Buffer.from(await f.arrayBuffer()).toString('base64'), mediaType: f.type })));
    const hint = form.get('hint') === 'prescription' ? 'prescription' : 'invoice';
    const db = createServiceClient();
    const { extraction, model } = await extractFromDocument(docs, hint, await getReaderConfig(db));
    if (extraction.document_type === 'other') extraction.document_type = hint; // the pharmacist said what it is
    // The form the brand really comes in (a script saying "OxyNorm tablet" means OxyNorm capsules).
    for (const item of extraction.items) {
      const fix = canonicalForm(item.brand, item.form);
      if (fix && fix.form !== item.form) {
        item.notes = `${item.notes ? `${item.notes} ` : ''}Written as “${item.form}”; ${item.brand} comes as ${fix.form}s.`.trim();
        item.form = fix.form;
        if (/tablet|capsule/i.test(item.quantity_unit)) item.quantity_unit = fix.unit;
      }
    }

    const { data: scan, error } = await db
      .from('scans')
      .insert({ pharmacy_id: account.pharmacyId, document_type: extraction.document_type, extracted: extraction, model, scanned_by_staff_id: staff.id })
      .select('id')
      .single();
    if (error) throw error;
    await audit(account.pharmacyId, 'scan.read', staff, account.authUserId, { document_type: extraction.document_type, items: extraction.items.length }, { table: 'scans', id: scan.id });

    const regs = await liveRegisters(account.pharmacyId);
    const balances = await balancesFor(regs.map((r) => r.id));

    const isInvoice = extraction.document_type === 'invoice';

    // Invoice clean-up: right supplier (never our own ship-to block), invoice number check.
    const docFlags: string[] = [];
    if (isInvoice) {
      const st = await getSettings(db, account.pharmacyId);
      const ph = { name: `${st.name} ${st.invoice_names ?? ''}`, address: st.address };
      if (looksLikeOwnPharmacy(extraction.supplier_name, extraction.supplier_address, ph)) {
        extraction.supplier_name = null;
        extraction.supplier_address = null;
      }
      const known = identifySupplier(extraction.supplier_name, extraction.supplier_evidence, ...extraction.items.map((i) => i.notes));
      if (known) {
        extraction.supplier_name = known.name;
        extraction.supplier_address = extraction.supplier_address && identifySupplier(extraction.supplier_address) ? extraction.supplier_address : known.address;
      }
      if (!extraction.supplier_name) docFlags.push('Supplier not found on the page — enter who sent it');
      const refFlag = checkReference(extraction.reference, extraction.reference_label);
      if (refFlag) docFlags.push(refFlag);
    }

    // Same delivery already recorded? (Invoice + CD docket / MDA receipt carry the same goods.)
    const priorFor = async (registerId: string, qty: number | null) => {
      if (!isInvoice) return null;
      if (extraction.reference) {
        const { data } = await db.from('cd_entries').select('seq').eq('register_id', registerId).eq('entry_type', 'receipt').ilike('notes', `%${extraction.reference}%`).limit(1);
        if (data?.length) return { blocking: true, text: `Invoice ${extraction.reference} is already recorded on line ${data[0].seq} of this register — don't add it twice` };
      }
      if (qty && extraction.document_date) {
        const d = new Date(extraction.document_date);
        const from = new Date(d.getTime() - 4 * 864e5).toISOString().slice(0, 10);
        const to = new Date(d.getTime() + 4 * 864e5).toISOString().slice(0, 10);
        const { data } = await db.from('cd_entries').select('seq, notes').eq('register_id', registerId).eq('entry_type', 'receipt').eq('quantity', qty).gte('transaction_date', from).lte('transaction_date', to).limit(1);
        if (data?.length) return { blocking: false, text: `Same amount received within a few days on line ${data[0].seq}${data[0].notes ? ` (${data[0].notes})` : ''} — is this the same delivery?` };
      }
      return null;
    };
    const exempt = extraction.items.filter((i) => i.is_controlled_drug && registerExemption(i.drug_name, i.strength, i.form, i.brand));
    const proposals = await Promise.all(extraction.items.filter((i) => i.is_controlled_drug && !registerExemption(i.drug_name, i.strength, i.form, i.brand)).map(async (item) => {
      const { match, candidates, state } = matchRegister(regs, item.drug_name, item.strength, item.form, item.brand);
      const qty = decideQuantity(item, extraction.document_type);
      qty.flags.push(...docFlags);
      const prior = match ? await priorFor(match.id, qty.quantity) : null;
      if (prior) { qty.flags.unshift(prior.text); if (prior.blocking) qty.blocking = true; }
      return {
        item,
        match_state: state,
        qty,
        register_id: match?.id ?? null,
        register_label: match?.label ?? null,
        current_balance: match ? balances[match.id] ?? 0 : null,
        candidates: candidates.map((r) => ({ id: r.id, label: r.label })),
        draft: {
          entry_type: isInvoice ? 'receipt' : 'supply',
          // A supply is dated the day it's supplied (today), not the prescription date; a delivery by the invoice date.
          transaction_date: isInvoice ? extraction.document_date ?? new Date().toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10),
          quantity: qty.quantity ?? '',
          supplier_name: extraction.supplier_name,
          supplier_address: extraction.supplier_address,
          recipient_name: extraction.patient_name,
          recipient_address: extraction.patient_address,
          patient_dob: extraction.patient_dob ?? null,
          prescriber_name: extraction.prescriber_name,
          prescriber_address: extraction.prescriber_address,
          authority_to_possess: !isInvoice && extraction.prescriber_name ? `Prescription — ${extraction.prescriber_name}${extraction.prescriber_registration ? ` (Reg ${extraction.prescriber_registration})` : ''}${extraction.document_date ? `, dated ${extraction.document_date.split('-').reverse().join('/')}` : ''}` : null,
          prescription_ref: isInvoice ? null : extraction.reference,
          notes: isInvoice && extraction.reference ? `Invoice ${extraction.reference}` : null,
          scan_id: scan.id,
        },
      };
    }));

    const ignored = extraction.items.filter((i) => !i.is_controlled_drug).length;
    const exempt_lines = exempt.map((i) => ({ label: `${i.brand ?? i.drug_name} ${i.strength}`, reason: registerExemption(i.drug_name, i.strength, i.form, i.brand) }));
    return NextResponse.json({ scan_id: scan.id, extraction, proposals, ignored, exempt: exempt_lines });
  } catch (err) {
    if (err instanceof ScanError) return NextResponse.json({ error: err.message }, { status: 422 });
    return errorResponse(err);
  }
}
