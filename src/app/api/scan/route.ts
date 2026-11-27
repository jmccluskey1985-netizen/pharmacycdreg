import { combineRepeatLines } from '@/lib/combine-lines';
import { NextResponse } from 'next/server';
import { requireStaff, errorResponse, audit } from '@/lib/access';
import { createServiceClient } from '@/lib/supabase/server';
import { extractFromDocument, readOstForm, ostIsEmpty, ScanError } from '@/lib/scan-extract';
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
import { findPatientMatches, candidateView } from '@/lib/patients';
import { decideOst, ostRef } from '@/lib/ost';
import { irishToday } from '@/lib/late-entry';

export const maxDuration = 120;

const ALLOWED = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf'];
const MAX_BYTES = 15 * 1024 * 1024;

// Photo/PDF of an Rx or invoice → extracted CD lines, each matched to a live register,
// with a proposed register entry. Nothing is written to the register here.
export async function POST(req: Request) {
  try {
    const { account, staff } = await requireStaff('scan', { write: true });
    const limit = await checkRateLimit(`scan:${account.pharmacyId}`, 20, 60_000);
    if (!limit.ok) return NextResponse.json({ error: 'Too many scans: wait a moment' }, { status: 429 });

    const form = await req.formData();
    const files = form.getAll('file').filter((f): f is File => f instanceof File);
    if (!files.length) return NextResponse.json({ error: 'Attach a photo or PDF' }, { status: 400 });
    if (files.length > 10) return NextResponse.json({ error: 'Up to 10 pages per scan' }, { status: 400 });
    for (const f of files) {
      if (!ALLOWED.includes(f.type)) return NextResponse.json({ error: 'Use a JPG, PNG, WEBP or PDF' }, { status: 400 });
    }
    if (files.reduce((n, f) => n + f.size, 0) > MAX_BYTES) return NextResponse.json({ error: 'Files are too large (max 15 MB total)' }, { status: 400 });

    const docs = await Promise.all(files.map(async (f) => ({ base64: Buffer.from(await f.arrayBuffer()).toString('base64'), mediaType: f.type })));
    // 'auto' (the default Scan button): the reader decides whether it's a prescription or an invoice
    const h = form.get('hint');
    const hint = h === 'prescription' || h === 'invoice' ? h : 'auto';
    const db = createServiceClient();
    const { extraction, model } = await extractFromDocument(docs, hint, await getReaderConfig(db));
    if (extraction.document_type === 'other') extraction.document_type = hint !== 'auto' ? hint : extraction.patient_name || extraction.prescriber_name ? 'prescription' : 'invoice'; // the pharmacist said what it is, or the details tell us
    // OST form recognised but its grid came back empty, or a methadone / buprenorphine script with no
    // OST block at all: read just the form once more with a smaller, focused request.
    const looksOst = extraction.ost != null || extraction.items.some((it) => /methadone|buprenorph|physeptone|suboxone|subutex|espranor/i.test(`${it.drug_name} ${it.brand ?? ''}`));
    if (extraction.document_type !== 'invoice' && looksOst && ostIsEmpty(extraction.ost)) {
      const again = await readOstForm(docs, await getReaderConfig(db)).catch(() => null);
      if (again && !ostIsEmpty(again)) extraction.ost = again;
    }
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
      if (!extraction.supplier_name) docFlags.push('Supplier not found on the page: enter who sent it');
      const refFlag = checkReference(extraction.reference, extraction.reference_label);
      if (refFlag) docFlags.push(refFlag);
    }

    // Same delivery already recorded? (Invoice + CD docket / MDA receipt carry the same goods.)
    const priorFor = async (registerId: string, qty: number | null) => {
      if (!isInvoice) return null;
      if (extraction.reference) {
        const { data } = await db.from('cd_entries').select('seq').eq('register_id', registerId).eq('entry_type', 'receipt').ilike('notes', `%${extraction.reference}%`).limit(1);
        if (data?.length) return { blocking: true, text: `Invoice ${extraction.reference} is already recorded on line ${data[0].seq} of this register: don't add it twice` };
      }
      if (qty && extraction.document_date) {
        const d = new Date(extraction.document_date);
        const from = new Date(d.getTime() - 4 * 864e5).toISOString().slice(0, 10);
        const to = new Date(d.getTime() + 4 * 864e5).toISOString().slice(0, 10);
        const { data } = await db.from('cd_entries').select('seq, notes').eq('register_id', registerId).eq('entry_type', 'receipt').eq('quantity', qty).gte('transaction_date', from).lte('transaction_date', to).limit(1);
        if (data?.length) return { blocking: false, text: `Same amount received within a few days on line ${data[0].seq}${data[0].notes ? ` (${data[0].notes})` : ''}: is this the same delivery?` };
      }
      return null;
    };
    const exempt = extraction.items.filter((i) => i.is_controlled_drug && registerExemption(i.drug_name, i.strength, i.form, i.brand));
    const proposals = await Promise.all(extraction.items.filter((i) => i.is_controlled_drug && !registerExemption(i.drug_name, i.strength, i.form, i.brand)).map(async (item) => {
      const { match, candidates, state, otherBrands } = matchRegister(regs, item.drug_name, item.strength, item.form, item.brand);
      const qty = decideQuantity(item, extraction.document_type);
      if (otherBrands?.length) qty.flags.unshift(`You have ${otherBrands.map((r) => r.label).join(', ')}: not ${item.brand}. Brands aren’t interchangeable: start a ${item.brand} book or check the brand dispensed.`);
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
          patient_details: isInvoice ? null : {
            first_name: extraction.patient_first_name ?? null, surname: extraction.patient_surname ?? null,
            eircode: extraction.patient_eircode ?? null, gms: extraction.gms_number ?? null, dps: extraction.dps_number ?? null,
            lti: extraction.lti_number ?? null, mrn: extraction.hospital_mrn ?? null,
            card: extraction.ost?.treatment_card_no ?? null, drug_code: extraction.ost?.drug_code ?? null,
          },
          prescriber_name: extraction.prescriber_name,
          prescriber_address: extraction.prescriber_address,
          authority_to_possess: !isInvoice && extraction.prescriber_name ? `Prescription: ${extraction.prescriber_name}${extraction.prescriber_registration ? ` (Reg ${extraction.prescriber_registration})` : ''}${extraction.document_date ? `, dated ${extraction.document_date.split('-').reverse().join('/')}` : ''}` : null,
          prescription_ref: isInvoice ? null : extraction.reference,
          notes: isInvoice && extraction.reference ? `Invoice ${extraction.reference}` : null,
          scan_id: scan.id,
        },
      };
    }));

    // The same product on more than one line of an invoice or docket (e.g. two lines of Durogesic
    // 12mcg/hr, 2 × 5 each) is one delivery into one book: combine them into a single receipt.
    // Recorded separately, the second line would hit the "same docket already received" guard,
    // and with no book yet each line would try to start its own book.
    if (isInvoice) combineRepeatLines(proposals);

    // OST form (methadone / buprenorphine in instalments): today's rows are the supply; the form
    // is held with its schedule; earlier rows not yet in the register are offered as late entries.
    let ost: any = null;
    if (!isInvoice && extraction.ost && proposals.length) {
      const o = extraction.ost;
      const today = irishToday();
      const dec = decideOst(o, today);
      const ref = o.serial_no ? ostRef(o.serial_no) : null;
      const base = proposals[0];
      // The pharmacy section's DRUG CODE says which product was dispensed: once the pharmacy has
      // recorded that code against a register, use it (it beats matching the written drug name).
      const code = o.drug_code?.replace(/\D/g, '') || null;
      if (code) {
        const { data: known } = await db.from('ost_drug_codes').select('register_id').eq('pharmacy_id', account.pharmacyId).eq('drug_code', code).maybeSingle().then((x) => x, () => ({ data: null }));
        const reg = known && regs.find((r) => r.id === known.register_id);
        if (reg && reg.id !== base.register_id) {
          if (!base.candidates.some((c: any) => c.id === reg.id)) base.candidates.unshift({ id: reg.id, label: reg.label });
          base.register_id = reg.id; base.register_label = reg.label; base.current_balance = balances[reg.id] ?? 0; base.match_state = 'your_register';
          base.qty.flags.unshift(`Drug code ${code} → ${reg.label} (as recorded before).`);
        } else if (!known) base.qty.flags.unshift(`Drug code ${code} is new here: check the register. It's remembered once you record it.`);
      }
      base.draft = { ...base.draft, transaction_date: today, quantity: dec.today.total || '', prescription_ref: ref ?? base.draft.prescription_ref, notes: dec.today.breakdown ? `OST instalment: ${dec.today.breakdown}` : 'OST instalment' };
      base.qty = { ...base.qty, quantity: dec.today.total || null, label: dec.today.total ? `Dispensed today: ${dec.today.breakdown ?? dec.today.total}` : 'Nothing dated today on the form', flags: [...dec.flags, ...base.qty.flags.filter((f: string) => !/words and figures|quantity/i.test(f))] };
      (base as any).ost_role = 'today';
      // Which earlier dispensing dates are already in this register?
      const inRegister = new Set<string>();
      if (base.register_id && ref && dec.earlier.length) {
        const { data } = await db.from('cd_entries').select('transaction_date').eq('register_id', base.register_id).eq('prescription_ref', ref).in('transaction_date', Array.from(new Set(dec.earlier.map((e) => e.date))));
        for (const e of data ?? []) inRegister.add(e.transaction_date);
      }
      const byDate = new Map<string, typeof dec.earlier>();
      for (const e of dec.earlier) byDate.set(e.date, [...(byDate.get(e.date) ?? []), e]);
      const missing = Array.from(byDate.entries()).filter(([d]) => !inRegister.has(d));
      for (const [d, rows] of missing) {
        const q = rows.reduce((n, x) => n + x.quantity, 0);
        const parts = rows.map((x) => `${x.quantity} ${x.mode === 'supervised' ? 'supervised' : x.mode === 'take_away' ? 'take-away' : 'dispensed'}`).join(' + ');
        proposals.push({ ...base, ost_role: 'earlier', qty: { ...base.qty, quantity: q, label: `Dispensed ${d.split('-').reverse().join('/')}, not in the register yet`, flags: ['Recorded as a late entry: say why it wasn’t entered on the day.'] }, draft: { ...base.draft, transaction_date: d, quantity: q, notes: `OST instalment: ${parts}` } } as any);
      }
      ost = {
        serial_no: o.serial_no, treatment_card_no: o.treatment_card_no ?? null, drug_code: code, product: o.product, drug_written: o.drug_written ?? null,
        daily_dose: o.daily_dose ?? null, days_at_dose: o.days_at_dose ?? null, from_date: o.from_date ?? null, to_date: o.to_date ?? null,
        total: dec.total, dispensed_so_far: dec.dispensedSoFar, remaining: dec.remaining, schedule: dec.schedule,
        today: dec.today, earlier: dec.earlier.map((e) => ({ ...e, in_register: inRegister.has(e.date) })), flags: dec.flags,
      };
      // Hold the form and its dispensing grid (reference record; the register is still cd_entries)
      if (o.serial_no) {
        try {
          const { data: held } = await db.from('ost_prescriptions').upsert({
            pharmacy_id: account.pharmacyId, serial_no: o.serial_no.replace(/\s+/g, ''), patient_name: extraction.patient_name, treatment_card_no: o.treatment_card_no ?? null, drug_code: code,
            product: o.product, drug_written: o.drug_written ?? null, register_id: base.register_id, daily_dose: o.daily_dose ?? null, days_at_dose: o.days_at_dose ?? null,
            total_qty: dec.total, date_prescribed: o.date_prescribed ?? null, from_date: o.from_date ?? null, to_date: o.to_date ?? null,
            schedule: { instalment_daily: o.instalment_daily, instalment_double_sat: o.instalment_double_sat, instalment_days: o.instalment_days, supervised: o.supervised, supervised_daily: o.supervised_daily, supervised_days: o.supervised_days, text: dec.schedule },
            prescriber_name: extraction.prescriber_name, prescriber_registration: extraction.prescriber_registration, scan_id: scan.id, updated_at: new Date().toISOString(),
          }, { onConflict: 'pharmacy_id,serial_no' }).select('id').single();
          const rows = [...dec.earlier, ...dec.today.rows];
          if (held && rows.length) await db.from('ost_dispensings').upsert(rows.map((x) => ({ prescription_id: held.id, dispensed_on: x.date, quantity: x.quantity, mode: x.mode })), { onConflict: 'prescription_id,dispensed_on,mode,quantity', ignoreDuplicates: true });
        } catch { /* before migration 0022: the scan still works */ }
      }
    }

    const ignored = extraction.items.filter((i) => !i.is_controlled_drug).length;
    const exempt_lines = exempt.map((i) => ({ label: `${i.brand ?? i.drug_name} ${i.strength}`, reason: registerExemption(i.drug_name, i.strength, i.form, i.brand) }));
    // Existing patients who look like the one on the script (docs/PATIENT_MATCHING.md §6)
    let patient_match = null;
    if (!isInvoice && extraction.patient_name && proposals.length) {
      const m = await findPatientMatches(db, account.pharmacyId, {
        full_name: extraction.patient_name, first_name: extraction.patient_first_name, surname: extraction.patient_surname,
        dob: /^\d{4}-\d{2}-\d{2}$/.test(extraction.patient_dob ?? '') ? extraction.patient_dob : null, address: extraction.patient_address,
        eircode: extraction.patient_eircode, gms: extraction.gms_number, dps: extraction.dps_number, lti: extraction.lti_number, mrn: extraction.hospital_mrn, card: extraction.ost?.treatment_card_no,
      }).catch(() => null);
      if (m) patient_match = { candidates: m.candidates.map(candidateView), pick_id: m.pick?.patient.id ?? null, ambiguous: m.ambiguous };
    }
    return NextResponse.json({ scan_id: scan.id, extraction, proposals, ignored, exempt: exempt_lines, patient_match, ost });
  } catch (err) {
    if (err instanceof ScanError) return NextResponse.json({ error: err.message }, { status: 422 });
    return errorResponse(err);
  }
}
