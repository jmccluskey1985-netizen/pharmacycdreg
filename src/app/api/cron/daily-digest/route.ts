import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { sendEmail } from '@/lib/email';
import { productTitle } from '@/lib/product-name';
import { irishToday } from '@/lib/late-entry';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
const wrap = (site: string, body: string) => `<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#0f172a">
<p style="font-weight:700;font-size:20px;margin:0 0 16px"><span style="color:#184B21">Pharmacy</span><span style="color:#54BD50">CDReg</span><span style="color:#184B21">.ie</span></p>${body}
<p><a href="${site}/dashboard" style="display:inline-block;padding:12px 20px;background:#184B21;color:#fff;text-decoration:none;border-radius:8px;font-weight:600">Open your register</a></p>
<p style="color:#64748b;font-size:12px;margin-top:28px">No patient details are included in these emails.</p></div>`;

/**
 * Every morning (Vercel Cron, CRON_SECRET):
 *  - dispensing reminders due today, counts and reminder names only, no patient details;
 *  - on Mondays, an integrity record: the latest fingerprint of each register and of the audit
 *    trail. Kept in the pharmacy's mailbox (outside this system), it lets anyone later prove the
 *    register hasn't been rewritten since that date.
 */
export async function GET(req: Request) {
  const expected = process.env.CRON_SECRET;
  if (!expected || req.headers.get('authorization') !== `Bearer ${expected}`) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const site = process.env.NEXT_PUBLIC_SITE_URL || 'https://pharmacycdreg.ie';
  const db = createServiceClient();
  const today = irishToday();
  const monday = new Date(`${today}T12:00:00Z`).getUTCDay() === 1;
  const { data: pharmacies } = await db.from('pharmacies').select('id, name, billing_email').not('billing_email', 'is', null);
  let sent = 0;
  for (const ph of pharmacies ?? []) {
    const parts: string[] = [];
    const { data: due } = await db.from('dispense_reminders').select('title, next_due, lines').eq('pharmacy_id', ph.id).eq('active', true).lte('next_due', today);
    if (due?.length) {
      // Reminder names can contain a patient's name: send only how many, never the names.
      const lines = due.reduce((n, r: any) => n + (r.lines?.length ?? 0), 0);
      parts.push(`<p><b>${due.length} dispensing reminder${due.length === 1 ? '' : 's'} due today</b> (${lines} suppl${lines === 1 ? 'y' : 'ies'} to record).</p><p><a href="${site}/dashboard/reminders">Open reminders</a>. One click records them in the registers.</p>`);
    }
    if (monday) {
      const { data: regs } = await db.from('cd_registers').select('id, product:cd_products(*)').eq('pharmacy_id', ph.id).is('closed_at', null);
      const rows: string[] = [];
      for (const r of regs ?? []) {
        const { data } = await db.rpc('verify_register_chain', { reg: r.id });
        const v: any = Array.isArray(data) ? data[0] : data;
        if (v) rows.push(`<tr><td style="padding:2px 8px 2px 0">${esc(productTitle((r as any).product))}</td><td style="font-family:monospace">${v.ok ? (v.head ?? '').slice(0, 16) : '<b style="color:#b91c1c">CHECK FAILED</b>'}</td><td>${v.checked} lines</td></tr>`);
      }
      const { data: a } = await db.rpc('verify_audit_chain', { ph: ph.id });
      const av: any = Array.isArray(a) ? a[0] : a;
      if (rows.length || av) {
        parts.push(`<p><b>Weekly integrity record</b>. Keep this email. These fingerprints seal every line written up to now; if any earlier line were ever altered, they could not be reproduced.</p><table style="font-size:13px;border-collapse:collapse">${rows.join('')}${av ? `<tr><td style="padding:2px 8px 2px 0">Audit trail</td><td style="font-family:monospace">${av.ok ? (av.head ?? '').slice(0, 16) : '<b style="color:#b91c1c">CHECK FAILED</b>'}</td><td>${av.checked} records</td></tr>` : ''}</table>`);
      }
    }
    if (!parts.length) continue;
    try {
      await sendEmail({ to: ph.billing_email!, subject: monday ? `CD register: weekly integrity record${due?.length ? ' and reminders due' : ''}` : 'CD register: dispensing reminders due today', html: wrap(site, parts.join('')) });
      sent++;
    } catch { /* keep going for the other pharmacies */ }
  }
  return NextResponse.json({ ok: true, sent });
}
