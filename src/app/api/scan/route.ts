import { NextResponse } from 'next/server';
import { requireStaff, errorResponse, audit } from '@/lib/access';
import { createServiceClient } from '@/lib/supabase/server';
import { extractFromDocument, ScanError } from '@/lib/scan-extract';
import { balancesFor } from '@/lib/registers';
import { liveRegisters, matchRegister } from '@/lib/match';
import { decideQuantity } from '@/lib/quantity';
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
    const { extraction, model } = await extractFromDocument(docs, hint);

    const db = createServiceClient();
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
    const proposals = extraction.items.filter((i) => i.is_controlled_drug).map((item) => {
      const { match, candidates, state } = matchRegister(regs, item.drug_name, item.strength, item.form, item.brand);
      const qty = decideQuantity(item, extraction.document_type);
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
          transaction_date: extraction.document_date ?? new Date().toISOString().slice(0, 10),
          quantity: qty.quantity ?? '',
          supplier_name: extraction.supplier_name,
          supplier_address: extraction.supplier_address,
          recipient_name: extraction.patient_name,
          recipient_address: extraction.patient_address,
          prescriber_name: extraction.prescriber_name,
          prescriber_address: extraction.prescriber_address,
          authority_to_possess: !isInvoice && extraction.prescriber_name ? `Prescription — ${extraction.prescriber_name}${extraction.prescriber_registration ? ` (Reg ${extraction.prescriber_registration})` : ''}` : null,
          prescription_ref: extraction.reference,
          notes: isInvoice && extraction.reference ? `Invoice ${extraction.reference}` : null,
          scan_id: scan.id,
        },
      };
    });

    const ignored = extraction.items.filter((i) => !i.is_controlled_drug).length;
    return NextResponse.json({ scan_id: scan.id, extraction, proposals, ignored });
  } catch (err) {
    if (err instanceof ScanError) return NextResponse.json({ error: err.message }, { status: 422 });
    return errorResponse(err);
  }
}
