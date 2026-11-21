import { NextResponse } from 'next/server';
import { requireStaff, errorResponse } from '@/lib/access';
import { createServiceClient, createServerSupabaseClient } from '@/lib/supabase/server';
import { isLead } from '@/lib/roles';
import { getSettings } from '@/lib/settings';

export const dynamic = 'force-dynamic';
const ROLE: Record<string, string> = { superintendent_pharmacist: 'Superintendent pharmacist', supervising_pharmacist: 'Supervising pharmacist' };

/** What the assessment can be filled in with from the pharmacy's own account. */
async function prefill(pharmacyId: string) {
  const db = createServiceClient();
  const [{ data: ph }, { data: leads }, { data: regs }, { count: staffWithPin }, { count: checks }] = await Promise.all([
    db.from('pharmacies').select('name, address, psi_premises_number').eq('id', pharmacyId).maybeSingle(),
    db.from('staff').select('full_name, role, psi_number').eq('pharmacy_id', pharmacyId).eq('is_active', true).in('role', ['superintendent_pharmacist', 'supervising_pharmacist']),
    db.from('cd_registers').select('opened_at').eq('pharmacy_id', pharmacyId).order('opened_at', { ascending: true }).limit(1),
    db.from('staff').select('id', { count: 'exact', head: true }).eq('pharmacy_id', pharmacyId).eq('is_active', true).not('pin_hash', 'is', null),
    db.from('stock_checks').select('id', { count: 'exact', head: true }).eq('pharmacy_id', pharmacyId),
  ]);
  const settings = await getSettings(db, pharmacyId);
  const { data: f } = await (await createServerSupabaseClient()).auth.mfa.listFactors().catch(() => ({ data: null }));
  const today = new Date().toISOString().slice(0, 10);
  const review = new Date(Date.now() + 365 * 864e5).toISOString().slice(0, 10);
  const sup = (leads ?? []).find((s) => s.role === 'superintendent_pharmacist');
  const supv = (leads ?? []).find((s) => s.role === 'supervising_pharmacist');
  const lead = supv ?? sup;
  return {
    head: {
      pharmacy: ph?.name ?? '', psi: ph?.psi_premises_number ?? '', address: ph?.address ?? '',
      assessor: lead ? `${lead.full_name}, ${ROLE[lead.role]}` : '', date: today,
      golive: regs?.[0]?.opened_at ? String(regs[0].opened_at).slice(0, 10) : today,
      system: 'PharmacyCDReg.ie', review,
    },
    // Ticked from the account where it's known; the rest are ticked by hand
    plan: { pins: (staffWithPin ?? 0) > 1, twofa: !!settings.require_2fa || !!f?.totp?.some((x: any) => x.status === 'verified'), books: (regs?.length ?? 0) > 0, stockcheck: (checks ?? 0) > 0 },
    signers: { sup: sup ? { name: sup.full_name, psi: sup.psi_number } : null, supv: supv ? { name: supv.full_name, psi: supv.psi_number } : null },
  };
}

/** The pharmacy's risk assessment: working draft (if any), latest signed version, and prefill. */
export async function GET() {
  try {
    const { account, staff } = await requireStaff();
    const db = createServiceClient();
    const { data: rows, error } = await db.from('risk_assessments').select('id, data, status, signed_by_name, signed_by_psi, signed_by_role, signed_at, updated_at')
      .eq('pharmacy_id', account.pharmacyId).order('created_at', { ascending: false }).limit(20);
    if (error) return NextResponse.json({ error: 'Needs a one-off database update first (migration 0025).' }, { status: 503 });
    const draft = rows?.find((r) => r.status === 'draft') ?? null;
    const signed = rows?.filter((r) => r.status === 'signed') ?? [];
    return NextResponse.json({ prefill: await prefill(account.pharmacyId), draft, signed: signed[0] ?? null, versions: signed.map((r) => ({ id: r.id, signed_at: r.signed_at, signed_by_name: r.signed_by_name })), can_sign: isLead(staff.role), me: { name: staff.full_name, psi: staff.psi_number, role: ROLE[staff.role] ?? staff.role } });
  } catch (err) {
    return errorResponse(err);
  }
}

/** Save the working draft (superintendent / supervising pharmacist). */
export async function PUT(req: Request) {
  try {
    const { account } = await requireStaff((r) => isLead(r), { write: true });
    const body = await req.json().catch(() => null);
    if (!body?.data || typeof body.data !== 'object' || JSON.stringify(body.data).length > 100_000) return NextResponse.json({ error: 'Nothing to save' }, { status: 400 });
    const db = createServiceClient();
    const { data: draft } = await db.from('risk_assessments').select('id').eq('pharmacy_id', account.pharmacyId).eq('status', 'draft').maybeSingle();
    if (draft) await db.from('risk_assessments').update({ data: body.data, updated_at: new Date().toISOString() }).eq('id', draft.id);
    else await db.from('risk_assessments').insert({ pharmacy_id: account.pharmacyId, data: body.data });
    return NextResponse.json({ ok: true, saved_at: new Date().toISOString() });
  } catch (err) {
    return errorResponse(err);
  }
}
