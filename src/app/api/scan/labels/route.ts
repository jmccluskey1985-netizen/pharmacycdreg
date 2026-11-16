import { NextResponse } from 'next/server';
import { requireStaff, errorResponse, audit } from '@/lib/access';
import { createServiceClient } from '@/lib/supabase/server';
import { readDocument, parseJsonWith, ScanError } from '@/lib/scan-extract';
import { BagLabelsSchema, BAG_LABELS_JSON_SCHEMA, BAG_LABELS_SYSTEM, bagLabelsPrompt } from '@/lib/bag-labels';
import { liveRegisters, matchRegister } from '@/lib/match';
import { findPatientMatches, candidateView, splitName } from '@/lib/patients';
import { getReaderConfig } from '@/lib/reader-config';
import { checkRateLimit } from '@/lib/rate-limit';
import { can } from '@/lib/roles';

export const dynamic = 'force-dynamic';
const ALLOWED = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
const MAX_BYTES = 15 * 1024 * 1024;

/**
 * Photos of dispensing bag labels → proposed OST patients: who they are (matched to existing
 * records where possible), their product (matched to a register) and dose. Nothing is saved here;
 * the photos aren't kept.
 */
export async function POST(req: Request) {
  try {
    const { account, staff } = await requireStaff(can.record);
    const limit = await checkRateLimit(`scan:${account.pharmacyId}`, 20, 60_000);
    if (!limit.ok) return NextResponse.json({ error: 'Too many scans: wait a moment' }, { status: 429 });
    const form = await req.formData();
    const files = form.getAll('file').filter((f): f is File => f instanceof File);
    if (!files.length) return NextResponse.json({ error: 'Attach a photo of the labels' }, { status: 400 });
    if (files.length > 8) return NextResponse.json({ error: 'Up to 8 photos at a time' }, { status: 400 });
    if (files.some((f) => !ALLOWED.includes(f.type))) return NextResponse.json({ error: 'Use a JPG, PNG, WEBP or PDF' }, { status: 400 });
    if (files.reduce((n, f) => n + f.size, 0) > MAX_BYTES) return NextResponse.json({ error: 'Files are too large (max 15 MB total)' }, { status: 400 });
    const docs = await Promise.all(files.map(async (f) => ({ base64: Buffer.from(await f.arrayBuffer()).toString('base64'), mediaType: f.type })));
    const db = createServiceClient();
    const { result } = await readDocument(docs, { reader: await getReaderConfig(db), system: BAG_LABELS_SYSTEM, schema: BAG_LABELS_JSON_SCHEMA, name: 'bag_labels', prompt: bagLabelsPrompt(docs.length), parse: parseJsonWith(BagLabelsSchema) });
    const regs = (await liveRegisters(account.pharmacyId)).filter((r) => /methadone|buprenorphine/i.test(`${r.drug_name} ${r.class_name}`));

    // One proposal per person (several labels for the same patient are merged)
    const seen = new Map<string, any>();
    for (const l of result.labels) {
      if (!l.patient_name) continue;
      const key = l.patient_name.toLowerCase().replace(/[^a-z]/g, '');
      if (seen.has(key)) continue;
      const m = await findPatientMatches(db, account.pharmacyId, { full_name: l.patient_name, address: l.patient_address, card: l.treatment_card_no, pmr: l.pmr_code }).catch(() => null);
      const reg = l.drug_name ? matchRegister(regs, l.drug_name, l.strength ?? '', l.form ?? undefined, l.brand).match : null;
      const name = splitName(l.patient_name);
      seen.set(key, {
        first_name: name.first_name, surname: name.surname, address: l.patient_address, treatment_card_no: l.treatment_card_no, pmr_code: l.pmr_code,
        product: [l.brand || l.drug_name, l.strength, l.form].filter(Boolean).join(' ') || null, daily_dose: l.daily_dose, dose_text: l.dose_text,
        register_id: reg?.id ?? (regs.length === 1 ? regs[0].id : null), candidates: (m?.candidates ?? []).map(candidateView), pick_id: m?.pick?.patient.id ?? null,
      });
    }
    await audit(account.pharmacyId, 'scan.bag_labels', staff, account.authUserId, { labels: result.labels.length, patients: seen.size });
    return NextResponse.json({ patients: Array.from(seen.values()), registers: regs.map((r) => ({ id: r.id, label: r.label })), warnings: result.warnings });
  } catch (err) {
    if (err instanceof ScanError) return NextResponse.json({ error: err.message }, { status: 422 });
    return errorResponse(err);
  }
}
