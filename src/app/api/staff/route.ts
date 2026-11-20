import { NextResponse } from 'next/server';
import { authLink, inviteEmail } from '@/lib/auth-emails';
import { sendEmail } from '@/lib/email';
import { z } from 'zod';
import { requireStaff, requireAccount, errorResponse, audit } from '@/lib/access';
import { createServiceClient } from '@/lib/supabase/server';
import { hashPin, verifyPin, PIN_PATTERN } from '@/lib/pin';
import { can, isLead, STAFF_ROLES, type StaffRole } from '@/lib/roles';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const { account } = await requireStaff(can.manageStaff);
    const db = createServiceClient();
    const { data } = await db
      .from('staff')
      .select('id, full_name, role, psi_number, is_active, access_expires_at, created_at, pin_hash')
      .eq('pharmacy_id', account.pharmacyId)
      .order('created_at');
    // Superintendents whose own login can open this pharmacy (migration 0020)
    const { data: links } = await db.from('pharmacy_logins').select('staff_id').eq('pharmacy_id', account.pharmacyId);
    const linked = new Set((links ?? []).map((l) => l.staff_id));
    // Never send PIN hashes to the browser.
    return NextResponse.json({ staff: (data ?? []).map(({ pin_hash, ...s }) => ({ ...s, has_pin: !!pin_hash, has_login: linked.has(s.id) })) });
  } catch (err) {
    return errorResponse(err);
  }
}

const Body = z.object({
  id: z.string().uuid().optional(),
  full_name: z.string().trim().min(2).max(120),
  role: z.enum(STAFF_ROLES as [StaffRole, ...StaffRole[]]),
  // Superintendent only: their own login email, so it can open this pharmacy as well as their others
  login_email: z.string().trim().toLowerCase().email().max(200).optional().or(z.literal('')),
  psi_number: z.string().trim().max(20).optional().nullable(),
  pin: z.string().regex(PIN_PATTERN).optional(),
  access_expires_at: z.string().datetime().optional().nullable(),
  is_active: z.boolean().optional(),
});

async function pinTaken(pharmacyId: string, pin: string, exceptId?: string) {
  const db = createServiceClient();
  const { data } = await db.from('staff').select('id, pin_hash').eq('pharmacy_id', pharmacyId).eq('is_active', true).not('pin_hash', 'is', null);
  for (const row of data ?? []) {
    if (row.id !== exceptId && (await verifyPin(pin, row.pin_hash))) return true;
  }
  return false;
}

// Create or update a staff member. The very first staff member (bootstrap) can be
// created by the signed-in account before any PIN exists; after that only the
// supervising pharmacist can manage the team.
export async function POST(req: Request) {
  try {
    const parsed = Body.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return NextResponse.json({ error: 'Check the staff details', issues: parsed.error.flatten() }, { status: 400 });
    const b = parsed.data;

    const account = await requireAccount();
    const db = createServiceClient();
    const { count } = await db.from('staff').select('id', { count: 'exact', head: true }).eq('pharmacy_id', account.pharmacyId);
    const bootstrap = (count ?? 0) === 0;
    let actor: any = null;
    if (bootstrap) {
      if (!isLead(b.role) || !b.pin) {
        return NextResponse.json({ error: 'First set up the supervising (or superintendent) pharmacist with a PIN' }, { status: 400 });
      }
    } else {
      actor = (await requireStaff(can.manageStaff)).staff;
    }

    if (b.pin && (await pinTaken(account.pharmacyId, b.pin, b.id))) {
      return NextResponse.json({ error: 'That PIN is already used by someone in this pharmacy' }, { status: 409 });
    }

    const row: Record<string, unknown> = {
      full_name: b.full_name,
      role: b.role,
      psi_number: b.psi_number || null,
      access_expires_at: b.access_expires_at ?? null,
    };
    if (b.pin) row.pin_hash = await hashPin(b.pin);
    if (b.is_active !== undefined) row.is_active = b.is_active;

    let id = b.id;
    if (id) {
      const { error } = await db.from('staff').update(row).eq('id', id).eq('pharmacy_id', account.pharmacyId);
      if (error) throw error;
    } else {
      const { data, error } = await db.from('staff').insert({ ...row, pharmacy_id: account.pharmacyId }).select('id').single();
      if (error) throw error;
      id = data.id;
    }
    // Superintendent login across pharmacies: give or take away this pharmacy from their login
    let login: { linked: boolean; invited: boolean; error?: string } | null = null;
    if (b.role !== 'superintendent_pharmacist' || b.is_active === false) {
      await db.from('pharmacy_logins').delete().eq('pharmacy_id', account.pharmacyId).eq('staff_id', id!);
    } else if (b.login_email) {
      login = await linkSuperintendentLogin(db, account.pharmacyId, id!, actor?.id ?? null, b.login_email, new URL(req.url).origin);
    }
    const { pin, login_email, ...logged } = b;
    await audit(account.pharmacyId, b.id ? 'staff.updated' : 'staff.created', actor, account.authUserId, { ...logged, pin_changed: !!pin, login_linked: login?.linked ?? undefined }, { table: 'staff', id: id! });
    return NextResponse.json({ id, login });
  } catch (err) {
    return errorResponse(err);
  }
}

/**
 * Lets a superintendent's own login open this pharmacy. An existing login is linked; a new email
 * gets an invite to choose a password (and this pharmacy becomes its home pharmacy).
 */
async function linkSuperintendentLogin(db: ReturnType<typeof createServiceClient>, pharmacyId: string, staffId: string, addedBy: string | null, email: string, origin: string) {
  let userId: string | null = null;
  let invited = false;
  const site = process.env.NEXT_PUBLIC_SITE_URL || origin;
  const inv = await authLink(email, 'invite', site, { welcome: true });
  if (inv.user && inv.link) {
    userId = inv.user.id; invited = true;
    const { data: ph } = await db.from('pharmacies').select('name').eq('id', pharmacyId).maybeSingle();
    const m = inviteEmail(inv.link, ph?.name);
    await sendEmail({ to: email, subject: m.subject, html: m.html, sender: 'welcome' });
  } else if (/already|registered|exists/i.test(inv.error ?? '')) {
    // Existing login: look it up without emailing anything
    const gen = await db.auth.admin.generateLink({ type: 'magiclink', email });
    userId = gen.data?.user?.id ?? null;
  }
  if (!userId) return { linked: false, invited: false, error: 'Could not find or create that login' };
  const { data: home } = await db.from('pharmacy_accounts').select('pharmacy_id').eq('auth_user_id', userId).maybeSingle();
  if (!home) await db.from('pharmacy_accounts').insert({ auth_user_id: userId, pharmacy_id: pharmacyId });
  else if (home.pharmacy_id === pharmacyId) return { linked: true, invited };
  const { error } = await db.from('pharmacy_logins').upsert({ auth_user_id: userId, pharmacy_id: pharmacyId, staff_id: staffId, added_by_staff_id: addedBy }, { onConflict: 'auth_user_id,pharmacy_id' });
  if (error) return { linked: false, invited, error: /pharmacy_logins/.test(error.message) ? 'Run migration 0020 in Supabase first' : error.message };
  return { linked: true, invited };
}
