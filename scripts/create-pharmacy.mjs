#!/usr/bin/env node
// Create a pharmacy + its login. There's no public sign-up (this isn't a directory):
// you onboard each pharmacy yourself.
//
//   node --env-file=.env.local scripts/create-pharmacy.mjs \
//     --name "Quayside Pharmacy" --address "1 Quay St, Galway" --psi 1234 \
//     --email owner@quaysidepharmacy.ie --password 'a-long-temporary-password'
//
// They sign in on the landing page, then set up the supervising pharmacist + PIN.
import { createClient } from '@supabase/supabase-js';

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, v, i, a) => (v.startsWith('--') ? [...acc, [v.slice(2), a[i + 1]]] : acc), []));
for (const k of ['name', 'address', 'email', 'password']) {
  if (!args[k]) { console.error(`Missing --${k}`); process.exit(1); }
}
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const { data: user, error: uErr } = await db.auth.admin.createUser({ email: args.email, password: args.password, email_confirm: true });
if (uErr) { console.error(uErr.message); process.exit(1); }
const { data: ph, error: pErr } = await db.from('pharmacies').insert({ name: args.name, address: args.address, psi_premises_number: args.psi ?? null }).select('id').single();
if (pErr) { console.error(pErr.message); process.exit(1); }
const { error: lErr } = await db.from('pharmacy_accounts').insert({ auth_user_id: user.user.id, pharmacy_id: ph.id });
if (lErr) { console.error(lErr.message); process.exit(1); }
console.log(`Created ${args.name} (${ph.id}) with login ${args.email}`);
