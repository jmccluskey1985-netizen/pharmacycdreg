import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { sendEmail } from '@/lib/email';
import { PLAN, formatEuro } from '@/config/pricing';

export const dynamic = 'force-dynamic';

// Same cadence idea as PharmacyConsultation.ie, scaled to a 30-day trial.
const BOUNDARIES: Record<number, string> = { 7: 't_minus_7', 3: 't_minus_3', 1: 't_minus_1', 0: 't_minus_0' };
const daysUntil = (iso: string) => Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000);
const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('en-IE', { day: 'numeric', month: 'long', year: 'numeric' });

function reminderHtml(name: string, days: number, endsAt: string, cancelling: boolean, site: string, noCard = false) {
  const when = days === 0 ? 'today' : days === 1 ? 'tomorrow' : `in ${days} days`;
  // Free month started without a card: nudge to subscribe (nothing renews by itself).
  const body = noCard
    ? `<p>Your PharmacyCDReg free month for <b>${name}</b> ends ${when} (${fmtDate(endsAt)}).</p><p>To keep recording after that, subscribe for <b>${formatEuro(PLAN.price)}/month + VAT</b>${PLAN.originalPrice ? ` (launch price, normally ${formatEuro(PLAN.originalPrice)})` : ''}. Subscribe now and you won't be charged until the free month ends.</p><p><a href="${site}/dashboard/billing">Subscribe in Billing</a>. If you don't, your register simply becomes read-only. You can still view, print and export it, and nothing is deleted.</p>`
    : cancelling
    ? `<p>Your PharmacyCDReg free month for <b>${name}</b> ends ${when} (${fmtDate(endsAt)}) and is set not to renew. After that your register becomes <b>read-only</b>. You can still view, print and export it, but not add entries.</p><p>Changed your mind? Keep it running from <a href="${site}/dashboard/billing">Billing</a>.</p>`
    : `<p>Your PharmacyCDReg free month for <b>${name}</b> ends ${when} (${fmtDate(endsAt)}).</p><p>You don't need to do anything to keep going. Your card will be charged <b>${formatEuro(PLAN.price)}/month + VAT</b>${PLAN.originalPrice ? ` (launch price, normally ${formatEuro(PLAN.originalPrice)})` : ''}.</p><p>Not for you? Cancel any time before then from <a href="${site}/dashboard/billing">Billing</a> and you won't be charged. Your register is never deleted.</p>`;
  return `<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#0f172a">
<p style="font-weight:700;font-size:20px;margin:0 0 16px"><span style="color:#184B21">Pharmacy</span><span style="color:#54BD50">CDReg</span><span style="color:#184B21">.ie</span></p>
${body}
<p><a href="${site}/dashboard" style="display:inline-block;padding:12px 20px;background:#184B21;color:#fff;text-decoration:none;border-radius:8px;font-weight:600">Open your register</a></p>
<p style="color:#64748b;font-size:13px;margin-top:32px">Questions? Just reply to this email.</p></div>`;
}

export async function GET(req: Request) {
  const expected = process.env.CRON_SECRET;
  if (!expected || req.headers.get('authorization') !== `Bearer ${expected}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const site = process.env.NEXT_PUBLIC_SITE_URL || 'https://pharmacycdreg.ie';
  const db = createServiceClient();
  const { data, error } = await db
    .from('pharmacies')
    .select('id, name, billing_email, trial_ends_at, cancel_at_period_end, last_reminder_key, subscription_id')
    .eq('subscription_status', 'trialing')
    .not('trial_ends_at', 'is', null)
    .not('billing_email', 'is', null);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const today = new Date().toISOString().slice(0, 10);
  const results: { id: string; kind: string; sent: boolean }[] = [];
  for (const ph of data ?? []) {
    const days = daysUntil(ph.trial_ends_at!);
    const kind = BOUNDARIES[days];
    if (!kind) continue;
    const key = `${kind}:${today}`;
    if (ph.last_reminder_key === key) continue;
    const subject = days === 0 ? 'Your PharmacyCDReg free month ends today' : `Your PharmacyCDReg free month ends in ${days} day${days === 1 ? '' : 's'}`;
    const r = await sendEmail({ to: ph.billing_email!, subject, html: reminderHtml(ph.name, days, ph.trial_ends_at!, ph.cancel_at_period_end, site, !(ph as any).subscription_id) });
    if (r.sent) await db.from('pharmacies').update({ last_reminder_key: key }).eq('id', ph.id);
    results.push({ id: ph.id, kind, sent: r.sent });
  }
  return NextResponse.json({ checked: data?.length ?? 0, results });
}
