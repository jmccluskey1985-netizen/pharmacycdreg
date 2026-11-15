import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireStaff, errorResponse, audit, HttpError } from '@/lib/access';
import { createServiceClient } from '@/lib/supabase/server';
import { isSiteAdmin } from '@/lib/admin';
import { FREE_TRIAL_DAYS } from '@/config/pricing';

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
    const redirectTo = `${origin}/reset-password?welcome=1`;

    // Invite by email; if Supabase can't send it, make the link so the owner can send it themselves.
    let userId: string | null = null;
    let link: string | null = null;
    const inv = await db.auth.admin.inviteUserByEmail(b.email, { redirectTo, data: { full_name: b.contact_name || null } });
    if (inv.data?.user) userId = inv.data.user.id;
    else {
      if (/already|registered|exists/i.test(inv.error?.message ?? '')) return NextResponse.json({ error: 'That email already has a login.' }, { status: 409 });
      const gen = await db.auth.admin.generateLink({ type: 'invite', email: b.email, options: { redirectTo } });
      if (gen.error || !gen.data?.user) return NextResponse.json({ error: `Could not create the login: ${gen.error?.message ?? inv.error?.message ?? 'unknown error'}` }, { status: 500 });
      userId = gen.data.user.id;
      link = gen.data.properties?.action_link ?? null;
    }

    const { data: ph, error: phErr } = await db.from('pharmacies').insert({
      name: b.pharmacy_name, address: b.address, contact_name: b.contact_name || null, billing_email: b.email,
      ...(b.complimentary ? { subscription_status: 'complimentary' } : { subscription_status: 'trialing', trial_ends_at: new Date(Date.now() + FREE_TRIAL_DAYS * 864e5).toISOString() }),
    }).select('id').single();
    if (phErr || !ph) { await db.auth.admin.deleteUser(userId!).catch(() => {}); throw phErr ?? new Error('Could not create the pharmacy'); }
    const { error: lErr } = await db.from('pharmacy_accounts').insert({ auth_user_id: userId, pharmacy_id: ph.id });
    if (lErr) { await db.auth.admin.deleteUser(userId!).catch(() => {}); throw lErr; }

    await audit(account.pharmacyId, 'admin.pharmacy_added', staff, account.authUserId, { pharmacy_id: ph.id, invite_emailed: !link, complimentary: !!b.complimentary });
    await audit(ph.id, 'pharmacy.created', null, null, { by: 'site owner invite' });
    return NextResponse.json({ ok: true, pharmacy_id: ph.id, emailed: !link, link });
  } catch (err) {
    return errorResponse(err);
  }
}
