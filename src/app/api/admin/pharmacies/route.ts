import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireStaff, errorResponse, audit, HttpError } from '@/lib/access';
import { createServiceClient } from '@/lib/supabase/server';
import { isSiteAdmin } from '@/lib/admin';
import { FREE_TRIAL_DAYS } from '@/config/pricing';
import { authLink, inviteEmail } from '@/lib/auth-emails';
import { sendEmail } from '@/lib/email';

export const dynamic = 'force-dynamic';

const Body = z.object({
  email: z.string().trim().toLowerCase().email().max(200).transform((e) => e.replace(/@googlemail\.com$/, '@gmail.com')),
  pharmacy_name: z.string().trim().min(2).max(120),
  address: z.string().trim().min(3).max(300),
  contact_name: z.string().trim().max(120).optional().or(z.literal('')),
  complimentary: z.boolean().optional(),
});

/**
 * Site owner only: add a pharmacy and invite its login by email. The person chooses their own
 * password from the invite link (nobody else ever sees it), then sets up the supervising
 * pharmacist and PIN on first sign-in. Starts on the free month unless marked complimentary.
 */
export async function POST(req: Request) {
  try {
    const { account, staff } = await requireStaff();
    if (!isSiteAdmin(account.email)) throw new HttpError(404, 'Not found');
    const parsed = Body.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return NextResponse.json({ error: 'Check the email, pharmacy name and address' }, { status: 400 });
    const b = parsed.data;
    const db = createServiceClient();
    const origin = new URL(req.url).origin;

    // Invite: create the login with a one-time link and email it ourselves (from welcome@).
    // If the email can't be sent, the link is returned so the owner can send it themselves.
    const site = process.env.NEXT_PUBLIC_SITE_URL || origin;
    const inv = await authLink(b.email, 'invite', site, { welcome: true, data: { full_name: b.contact_name || null } });
    if (/already|registered|exists/i.test(inv.error ?? '')) return NextResponse.json({ error: 'That email already has a login.' }, { status: 409 });
    if (!inv.user || !inv.link) return NextResponse.json({ error: `Could not create the login: ${inv.error ?? 'unknown error'}` }, { status: 500 });
    const userId: string = inv.user.id;
    const m = inviteEmail(inv.link, b.pharmacy_name);
    const sent = (await sendEmail({ to: b.email, subject: m.subject, html: m.html, sender: 'welcome' })).sent;
    const link: string | null = sent ? null : inv.link;

    const { data: ph, error: phErr } = await db.from('pharmacies').insert({
      name: b.pharmacy_name, address: b.address, contact_name: b.contact_name || null, billing_email: b.email,
      ...(b.complimentary ? { subscription_status: 'complimentary' } : { subscription_status: 'trialing', trial_ends_at: new Date(Date.now() + FREE_TRIAL_DAYS * 864e5).toISOString() }),
    }).select('id').single();
    if (phErr || !ph) { await db.auth.admin.deleteUser(userId).catch(() => {}); throw phErr ?? new Error('Could not create the pharmacy'); }
    const { error: lErr } = await db.from('pharmacy_accounts').insert({ auth_user_id: userId, pharmacy_id: ph.id });
    if (lErr) { await db.auth.admin.deleteUser(userId).catch(() => {}); throw lErr; }

    await audit(account.pharmacyId, 'admin.pharmacy_added', staff, account.authUserId, { pharmacy_id: ph.id, invite_emailed: !link, complimentary: !!b.complimentary });
    await audit(ph.id, 'pharmacy.created', null, null, { by: 'site owner invite' });
    return NextResponse.json({ ok: true, pharmacy_id: ph.id, emailed: !link, link });
  } catch (err) {
    return errorResponse(err);
  }
}
