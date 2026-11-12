import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createServiceClient } from '@/lib/supabase/server';
import { checkRateLimit, clientKey } from '@/lib/rate-limit';
import { sendEmail, adminEmail } from '@/lib/email';

const Body = z.object({
  pharmacy_name: z.string().trim().min(2).max(120),
  address: z.string().trim().min(5).max(300),
  psi_premises_number: z.string().trim().max(20).optional().or(z.literal('')),
  contact_name: z.string().trim().min(2).max(120),
  contact_phone: z.string().trim().min(6).max(30),
  email: z.string().trim().toLowerCase().email().transform((e) => e.replace(/@googlemail\.com$/, '@gmail.com')),
  password: z.string().min(10).max(200),
  accept_terms: z.literal(true),
});

// Self sign-up: creates the pharmacy + its login. The client then signs in and is
// sent to Stripe Checkout for the free month (card required, like PharmacyConsultation.ie).
export async function POST(req: Request) {
  try {
    return await handle(req);
  } catch (err) {
    // Configuration problems (missing Supabase keys, tables not created) must say so,
    // not fail silently with a blank 500.
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[signup] failed', msg);
    const hint = /SUPABASE_SERVICE_ROLE_KEY|supabaseUrl|supabaseKey|Invalid URL/i.test(msg)
      ? 'Server set-up problem: the Supabase keys are missing in Vercel (NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY). Add them and redeploy.'
      : `Server error: ${msg}`;
    return NextResponse.json({ error: hint }, { status: 500 });
  }
}

async function handle(req: Request) {
  if (process.env.SIGNUPS_OPEN !== '1') {
    return NextResponse.json({ error: 'Sign-ups open soon — please join the waitlist on the home page.' }, { status: 403 });
  }
  const limit = checkRateLimit(`signup:${clientKey(req)}`, 3, 15 * 60_000);
  if (!limit.ok) return NextResponse.json({ error: 'Too many sign-up attempts. Try again later.' }, { status: 429 });

  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: 'Please check the highlighted details', issues: parsed.error.flatten() }, { status: 400 });
  const b = parsed.data;

  const db = createServiceClient();
  const { data: created, error: userErr } = await db.auth.admin.createUser({ email: b.email, password: b.password, email_confirm: true, user_metadata: { full_name: b.contact_name } });
  if (userErr || !created.user) {
    const exists = /already|registered|exists/i.test(userErr?.message ?? '');
    console.error('[signup] createUser', userErr?.message);
    return NextResponse.json({ error: exists ? 'An account with this email already exists — sign in instead.' : `Could not create the login: ${userErr?.message ?? 'unknown error'}` }, { status: exists ? 409 : 500 });
  }

  const { data: ph, error: phErr } = await db
    .from('pharmacies')
    .insert({ name: b.pharmacy_name, address: b.address, psi_premises_number: b.psi_premises_number || null, contact_name: b.contact_name, contact_phone: b.contact_phone, billing_email: b.email })
    .select('id')
    .single();
  if (phErr || !ph) {
    await db.auth.admin.deleteUser(created.user.id);
    console.error('[signup] pharmacy insert', phErr?.message);
    const noTables = /relation .* does not exist|schema cache|Could not find the table/i.test(phErr?.message ?? '');
    return NextResponse.json({ error: noTables ? 'Database not set up yet: run the 3 SQL files from supabase/migrations in the Supabase SQL Editor, then try again.' : `Could not set up the pharmacy: ${phErr?.message}` }, { status: 500 });
  }
  await db.from('pharmacy_accounts').insert({ auth_user_id: created.user.id, pharmacy_id: ph.id });
  await db.from('audit_log').insert({ pharmacy_id: ph.id, action: 'pharmacy.signed_up', auth_user_id: created.user.id, details: { pharmacy_name: b.pharmacy_name, contact_name: b.contact_name } });

  await sendEmail({
    to: adminEmail(),
    subject: `New PharmacyCDReg sign-up: ${b.pharmacy_name}`,
    html: `<p><b>${b.pharmacy_name}</b>, ${b.address}</p><p>${b.contact_name} · ${b.contact_phone} · ${b.email}${b.psi_premises_number ? `<br>PSI premises ${b.psi_premises_number}` : ''}</p><p>Next step for them: Stripe checkout (free month).</p>`,
  });

  return NextResponse.json({ ok: true });
}
