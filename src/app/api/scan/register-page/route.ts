import { NextResponse } from 'next/server';
import { requireStaff, errorResponse, audit } from '@/lib/access';
import { createServiceClient } from '@/lib/supabase/server';
import { readDocument, parseJsonWith, ScanError } from '@/lib/scan-extract';
import { RegisterPageSchema, REGISTER_PAGE_JSON_SCHEMA, REGISTER_PAGE_SYSTEM, registerPagePrompt, decideOpening } from '@/lib/register-page';
import { balancesFor } from '@/lib/registers';
import { liveRegisters, matchRegister } from '@/lib/match';
import { registerExemption } from '@/lib/cd-catalogue';
import { checkRateLimit } from '@/lib/rate-limit';
import { getReaderConfig } from '@/lib/reader-config';
import { can } from '@/lib/roles';

export const maxDuration = 120;
const ALLOWED = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf'];
const MAX_BYTES = 15 * 1024 * 1024;

// Photo of the last page of the paper CD register → proposed register + balance brought
// forward + date. Nothing is written here; the pharmacist confirms in the Open register form.
export async function POST(req: Request) {
  try {
    const { account, staff } = await requireStaff(can.openRegister, { write: true });
    const limit = checkRateLimit(`scan:${account.pharmacyId}`, 20, 60_000);
    if (!limit.ok) return NextResponse.json({ error: 'Too many scans — wait a moment' }, { status: 429 });

    const form = await req.formData();
    const files = form.getAll('file').filter((f): f is File => f instanceof File);
    if (!files.length) return NextResponse.json({ error: 'Attach a photo of the page' }, { status: 400 });
    if (files.length > 4) return NextResponse.json({ error: 'Up to 4 pages' }, { status: 400 });
    if (files.some((f) => !ALLOWED.includes(f.type))) return NextResponse.json({ error: 'Use a JPG, PNG, WEBP or PDF' }, { status: 400 });
    if (files.reduce((n, f) => n + f.size, 0) > MAX_BYTES) return NextResponse.json({ error: 'Files are too large (max 15 MB total)' }, { status: 400 });

    const docs = await Promise.all(files.map(async (f) => ({ base64: Buffer.from(await f.arrayBuffer()).toString('base64'), mediaType: f.type })));
    const db = createServiceClient();
    const { result: page, model } = await readDocument(docs, {
      reader: await getReaderConfig(db, account.pharmacyId),
      system: REGISTER_PAGE_SYSTEM,
      schema: REGISTER_PAGE_JSON_SCHEMA,
      name: 'cd_register_page',
      prompt: registerPagePrompt(docs.length),
      parse: parseJsonWith(RegisterPageSchema),
    });
    const opening = decideOpening(page);

    // Only dates and amounts are kept (no names were read).
    const { data: scan } = await db.from('scans').insert({ pharmacy_id: account.pharmacyId, document_type: 'other', extracted: { kind: 'register_page', page, opening }, model, scanned_by_staff_id: staff.id }).select('id').single();
    await audit(account.pharmacyId, 'scan.register_page', staff, account.authUserId, { product: page.product_written, balance: opening.balance, date: opening.date }, scan ? { table: 'scans', id: scan.id } : undefined);

    const exempt = page.drug_name ? registerExemption(page.drug_name, page.strength ?? '', page.form, page.brand) : null;
    const regs = await liveRegisters(account.pharmacyId);
    const m = page.drug_name ? matchRegister(regs, page.drug_name, page.strength ?? '', page.form ?? undefined, page.brand) : null;
    let existing: { id: string; label: string; balance: number } | null = null;
    if (m?.match) {
      const bal = await balancesFor([m.match.id]);
      existing = { id: m.match.id, label: m.match.label, balance: bal[m.match.id] ?? 0 };
    }
    return NextResponse.json({ page, opening, exempt, existing });
  } catch (err) {
    if (err instanceof ScanError) return NextResponse.json({ error: err.message }, { status: 422 });
    return errorResponse(err);
  }
}
