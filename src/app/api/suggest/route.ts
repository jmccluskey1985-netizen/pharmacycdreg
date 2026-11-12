import { NextResponse } from 'next/server';
import { requireStaff, errorResponse } from '@/lib/access';
import { createServiceClient } from '@/lib/supabase/server';
import { searchGms, GMS_LIST_DATE } from '@/lib/gms';
import { KNOWN_SUPPLIERS } from '@/lib/invoice-rules';

export const dynamic = 'force-dynamic';

export interface Suggestion {
  name: string;
  address: string | null;
  registration?: string | null;
  gms_number?: string | null;
  role?: string | null;
  source: 'list' | 'register' | 'gms' | 'preset';
  detail?: string;
}

const KINDS = ['patient', 'prescriber', 'supplier', 'witness'] as const;
type Kind = (typeof KINDS)[number];

/**
 * Quick-fill suggestions for the entry form, from (1) the pharmacy's Doctors &
 * suppliers list and (2) its own register history (latest address wins). Only this
 * pharmacy's data; nothing beyond what the register already holds.
 */
export async function GET(req: Request) {
  try {
    const { account } = await requireStaff();
    const url = new URL(req.url);
    const kind = url.searchParams.get('kind') as Kind;
    const q = (url.searchParams.get('q') || '').trim();
    if (!KINDS.includes(kind) || (q.length < 2 && !(kind === 'supplier' && q === ''))) return NextResponse.json({ suggestions: [] });
    const like = `%${q.replace(/[%_,()]/g, ' ')}%`;
    const db = createServiceClient();
    const out: Suggestion[] = [];

    if (kind !== 'patient') {
      const { data } = await db
        .from('contacts')
        .select('name, address, registration, gms_number, role')
        .eq('pharmacy_id', account.pharmacyId)
        .eq('kind', kind)
        .eq('is_active', true)
        .or(`name.ilike.${like},gms_number.ilike.${like},registration.ilike.${like}`)
        .limit(8);
      for (const c of data ?? []) out.push({ ...c, source: 'list' });
    }

    const { data: regs } = await db.from('cd_registers').select('id').eq('pharmacy_id', account.pharmacyId);
    const ids = (regs ?? []).map((r) => r.id);
    if (ids.length) {
      const cols = { patient: ['recipient_name', 'recipient_address'], prescriber: ['prescriber_name', 'prescriber_address'], supplier: ['supplier_name', 'supplier_address'], witness: ['witness_name', 'witness_role'] }[kind];
      const { data } = await db
        .from('cd_entries')
        .select(`${cols[0]}, ${cols[1]}, recorded_at`)
        .in('register_id', ids)
        .ilike(cols[0], like)
        .order('recorded_at', { ascending: false })
        .limit(60);
      const seen = new Set(out.map((s) => s.name.toLowerCase()));
      for (const r of (data ?? []) as any[]) {
        const name = r[cols[0]];
        if (!name || seen.has(name.toLowerCase())) continue; // latest entry per name wins
        seen.add(name.toLowerCase());
        out.push(kind === 'witness' ? { name, address: null, role: r[cols[1]], source: 'register' } : { name, address: r[cols[1]] ?? null, source: 'register' });
        if (out.length >= 10) break;
      }
    }
    // Irish CD wholesalers, after the pharmacy's own saved/used ones.
    if (kind === 'supplier') {
      const seen = new Set(out.map((s) => s.name.toLowerCase()));
      const ql = q.toLowerCase();
      for (const k of KNOWN_SUPPLIERS) {
        if (!k.name.toLowerCase().includes(ql) && !k.match.test(q)) continue;
        if ([...seen].some((n) => k.match.test(n))) continue; // already known under this pharmacy's spelling
        out.push({ name: k.name, address: k.address, source: 'preset', detail: k.address ? undefined : 'Add the address once — it’s remembered' });
      }
    }
    // National fallback for doctors: the HSE GMS GP list.
    if (kind === 'prescriber' && out.length < 10) {
      const seen = new Set(out.map((s) => s.name.toLowerCase()));
      for (const g of searchGms(q, 10 - out.length)) {
        if (seen.has(g.n.toLowerCase())) continue;
        out.push({ name: g.n, address: g.a, gms_number: g.g, source: 'gms', detail: `HSE GMS list (${GMS_LIST_DATE}): ${g.raw}` });
      }
    }
    return NextResponse.json({ suggestions: out.slice(0, 10) });
  } catch (err) {
    return errorResponse(err);
  }
}
