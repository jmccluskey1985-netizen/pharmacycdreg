import { NextResponse } from 'next/server';
import { requireStaff, errorResponse } from '@/lib/access';
import { createServiceClient, createServerSupabaseClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

/** First-week checklist for the supervising pharmacist. Each step is worked out from real activity. */
export async function GET() {
  try {
    const { account } = await requireStaff();
    const db = createServiceClient();
    const ph = account.pharmacyId;
    const count = async (table: string, f: (q: any) => any) => {
      const { count: n, error } = await f(db.from(table).select('id', { count: 'exact', head: true }));
      return error ? 0 : n ?? 0;
    };
    const [staff, registers, checks, scans, reminders, backups] = await Promise.all([
      count('staff', (q) => q.eq('pharmacy_id', ph).eq('is_active', true)),
      count('cd_registers', (q) => q.eq('pharmacy_id', ph)),
      count('stock_checks', (q) => q.eq('pharmacy_id', ph)),
      count('scans', (q) => q.eq('pharmacy_id', ph)),
      count('dispense_reminders', (q) => q.eq('pharmacy_id', ph)),
      count('audit_log', (q) => q.eq('pharmacy_id', ph).in('action', ['data.backup_downloaded', 'register.exported_all'])),
    ]);
    const riskSigned = await count('risk_assessments', (q) => q.eq('pharmacy_id', ph).eq('status', 'signed'));
    // Opioid substitution: only when the pharmacy keeps a methadone / buprenorphine book
    const { data: ostRegs } = await db.from('cd_registers').select('id, product:cd_products(drug_name)').eq('pharmacy_id', ph).is('closed_at', null);
    const hasOst = (ostRegs ?? []).some((r: any) => /methadone|buprenorphine/i.test(r.product?.drug_name ?? ''));
    const ostPatients = hasOst ? await count('patients', (q) => q.eq('pharmacy_id', ph).eq('is_ost', true)) : 0;
    const { data: f } = await (await createServerSupabaseClient()).auth.mfa.listFactors();
    const steps = [
      { key: 'team', label: 'Add your team, each with their own PIN', done: staff > 1, href: '/dashboard/team' },
      { key: 'registers', label: 'Open a CD book for each product you stock', done: registers > 0, href: '/dashboard?new=register' },
      { key: 'risk', label: 'Review and sign your risk assessment (ready-made from your details)', done: riskSigned > 0, href: '/dashboard/risk-assessment' },
      { key: 'twofa', label: 'Turn on two-step sign-in', done: !!f?.totp?.some((x) => x.status === 'verified'), href: '/dashboard/settings' },
      ...(hasOst ? [{ key: 'ost', label: 'Add your methadone / buprenorphine patients from their bag labels (once)', done: ostPatients > 0, href: '/dashboard/patients?ost=labels' }] : []),
      { key: 'scan', label: 'Try scanning a prescription', done: scans > 0, href: '/dashboard/scan?type=prescription' },
      { key: 'check', label: 'Do your first stock check', done: checks > 0, href: '/dashboard' },
      { key: 'reminder', label: 'Set up a reminder for a regular weekly supply', done: reminders > 0, href: '/dashboard/reminders' },
      { key: 'backup', label: 'Download a full backup and keep it safe', done: backups > 0, href: '/dashboard/settings' },
    ];
    return NextResponse.json({ steps });
  } catch (err) {
    return errorResponse(err);
  }
}
