import { haloEnabled } from '@/lib/features';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createServiceClient } from '@/lib/supabase/server';
import { hashKey } from '@/lib/integration-keys';
import { liveRegisters, matchRegister } from '@/lib/match';
import { currentBalance } from '@/lib/registers';
import { canWrite } from '@/lib/stripe';
import { checkRateLimit } from '@/lib/rate-limit';
import { registerExemption } from '@/lib/cd-catalogue';

export const dynamic = 'force-dynamic';

/**
 * Dispensing system (Halo) → PharmacyCDReg.
 * Called when a controlled drug is dispensed ("Add patient" / label printed).
 *
 *   POST /api/integrations/dispensings
 *   Authorization: Bearer cdr_live_…
 *
 * Idempotent on external_id: re-sending the same item returns the original result.
 * Lands in the "To confirm" inbox unless the key has auto-post on AND everything
 * checks out (register matched, pharmacist matched by PSI number, stock OK).
 */
const Body = z.object({
  external_id: z.string().trim().min(1).max(120),
  action: z.enum(['dispense', 'reverse']).default('dispense'),
  dispensed_at: z.string().min(10), // ISO date or datetime
  drug: z.object({ name: z.string().trim().min(2), strength: z.string().trim().min(1), form: z.string().trim().optional(), brand: z.string().trim().optional() }),
  quantity: z.coerce.number().positive().max(1_000_000),
  unit: z.string().trim().optional(),
  patient: z.object({ name: z.string().trim().min(2), address: z.string().trim().min(3) }),
  prescriber: z.object({ name: z.string().trim().optional(), address: z.string().trim().optional(), registration: z.string().trim().optional() }).optional(),
  prescription_ref: z.string().trim().optional(),
  collected_by: z.string().trim().optional(),
  collector_id_checked: z.boolean().optional(),
  pharmacist: z.object({ psi_number: z.string().trim().optional(), name: z.string().trim().optional() }).optional(),
});

export async function POST(req: Request) {
  const auth = req.headers.get('authorization') ?? '';
  const key = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  if (!key.startsWith('cdr_live_')) return NextResponse.json({ error: 'Missing or invalid API key' }, { status: 401 });

  const db = createServiceClient();
  const { data: k } = await db.from('integration_keys').select('*').eq('key_hash', hashKey(key)).is('revoked_at', null).maybeSingle();
  if (!k) return NextResponse.json({ error: 'Missing or invalid API key' }, { status: 401 });

  const limit = checkRateLimit(`pmr:${k.id}`, 120, 60_000);
  if (!limit.ok) return NextResponse.json({ error: 'Rate limited' }, { status: 429, headers: { 'Retry-After': String(limit.retryAfter) } });

  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid dispensing', issues: parsed.error.flatten() }, { status: 400 });
  const d = parsed.data;
  if (!(await haloEnabled(db, k.pharmacy_id))) return NextResponse.json({ error: 'Integration not enabled for this pharmacy' }, { status: 403 });
  await db.from('integration_keys').update({ last_used_at: new Date().toISOString() }).eq('id', k.id);

  // Idempotency: same external_id + action → return what happened first time.
  const { data: existing } = await db.from('pmr_inbox').select('id, status, entry_id, problem').eq('pharmacy_id', k.pharmacy_id).eq('source', 'halo').eq('external_id', d.external_id).eq('action', d.action).maybeSingle();
  if (existing) return NextResponse.json({ inbox_id: existing.id, status: existing.status, entry_id: existing.entry_id, problem: existing.problem, duplicate: true });

  const exemptReason = registerExemption(d.drug.name, d.drug.strength, d.drug.form, d.drug.brand);
  if (exemptReason) {
    const { data: ex } = await db.from('pmr_inbox')
      .insert({ pharmacy_id: k.pharmacy_id, integration_key_id: k.id, source: 'halo', external_id: d.external_id, action: d.action, payload: d, status: 'rejected', problem: exemptReason, resolved_at: new Date().toISOString() })
      .select('id').single();
    return NextResponse.json({ inbox_id: ex?.id, status: 'not_required', problem: exemptReason });
  }

  const regs = await liveRegisters(k.pharmacy_id);
  let { match } = matchRegister(regs, d.drug.name, d.drug.strength, d.drug.form);
  if (!match && d.drug.brand) match = matchRegister(regs, d.drug.brand, d.drug.strength, d.drug.form).match;

  let problem: string | null = null;
  // A pack quantity ("1 OP", "2 packs") is not a register quantity. Never auto-post it.
  const PACK_UNIT = /^(op|o\.p\.|original pack|packs?|box(es)?|cartons?|x)\b/i;
  let staffId: string | null = null;
  if (d.action === 'reverse') problem = 'Reversal from Halo — record a correction to the original supply';
  else if (d.unit && PACK_UNIT.test(d.unit.trim())) problem = `Quantity was sent as ${d.quantity} ${d.unit}, not units. Enter the number of tablets/ml/patches`;
  else if (!match) problem = `No open register matches ${d.drug.name} ${d.drug.strength}${d.drug.form ? ` ${d.drug.form}` : ''}`;

  const { data: ph } = await db.from('pharmacies').select('subscription_status').eq('id', k.pharmacy_id).single();
  if (!problem && !canWrite(ph?.subscription_status)) problem = 'Register is read-only (no active subscription)';

  if (!problem && k.auto_post) {
    const psi = d.pharmacist?.psi_number?.replace(/\D/g, '');
    if (!psi) problem = 'No pharmacist PSI number sent — confirm manually';
    else {
      const { data: st } = await db.from('staff').select('id, role, is_active, access_expires_at').eq('pharmacy_id', k.pharmacy_id).eq('psi_number', psi).eq('is_active', true).maybeSingle();
      const expired = st?.access_expires_at && new Date(st.access_expires_at) < new Date();
      if (!st || expired || !['supervising_pharmacist', 'pharmacist', 'locum_pharmacist'].includes(st.role)) problem = `Pharmacist PSI ${psi} isn't an active pharmacist on the Team page`;
      else staffId = st.id;
    }
    if (!problem && match && (await currentBalance(match.id)) - d.quantity < 0) problem = 'Would take the balance below zero — check stock';
  } else if (!problem) {
    problem = null; // auto-post off: plain "to confirm"
  }

  const { data: inbox, error } = await db
    .from('pmr_inbox')
    .insert({ pharmacy_id: k.pharmacy_id, integration_key_id: k.id, source: 'halo', external_id: d.external_id, action: d.action, payload: d, register_id: match?.id ?? null, problem })
    .select('id')
    .single();
  if (error) {
    if (error.code === '23505') return NextResponse.json({ error: 'Duplicate, retry for status' }, { status: 409 });
    console.error('[pmr] inbox insert', error);
    return NextResponse.json({ error: 'Could not store dispensing' }, { status: 500 });
  }

  if (k.auto_post && !problem && staffId && match) {
    const { data: entry, error: eErr } = await db
      .from('cd_entries')
      .insert({
        register_id: match.id,
        entry_type: 'supply',
        transaction_date: d.dispensed_at.slice(0, 10),
        quantity: d.quantity,
        recipient_name: d.patient.name,
        recipient_address: d.patient.address,
        prescriber_name: d.prescriber?.name ?? null,
        prescriber_address: d.prescriber?.address ?? null,
        authority_to_possess: d.prescriber?.name ? `Prescription — ${d.prescriber.name}${d.prescriber.registration ? ` (Reg ${d.prescriber.registration})` : ''}` : null,
        prescription_ref: d.prescription_ref ?? null,
        collected_by: d.collected_by ?? null,
        collector_id_checked: d.collector_id_checked ?? null,
        notes: `Halo ${d.external_id}`,
        source: 'pmr',
        recorded_by_staff_id: staffId,
        recorded_by_auth_user: k.created_by_auth_user,
      })
      .select('id, seq')
      .single();
    if (!eErr && entry) {
      await db.from('pmr_inbox').update({ status: 'posted', entry_id: entry.id, resolved_by_staff_id: staffId, resolved_at: new Date().toISOString() }).eq('id', inbox.id);
      return NextResponse.json({ inbox_id: inbox.id, status: 'posted', entry_id: entry.id, line: entry.seq });
    }
    await db.from('pmr_inbox').update({ problem: 'Auto-post failed — confirm manually' }).eq('id', inbox.id);
  }

  return NextResponse.json({ inbox_id: inbox.id, status: 'pending', problem }, { status: 202 });
}
