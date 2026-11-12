import { NextResponse } from 'next/server';
import { requireStaff, errorResponse } from '@/lib/access';
import { createServiceClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

// NFR13/NFR14: search by product, date range, supplier, recipient, prescriber/authority.
export async function GET(req: Request) {
  try {
    const { account } = await requireStaff();
    const url = new URL(req.url);
    const q = (url.searchParams.get('q') || '').trim();
    const from = url.searchParams.get('from');
    const to = url.searchParams.get('to');
    const type = url.searchParams.get('type');
    const sort = url.searchParams.get('sort') === 'asc' ? true : false;
    const db = createServiceClient();

    const { data: regs } = await db
      .from('cd_registers')
      .select('id, product:cd_products(drug_name, strength, form, class_name, unit)')
      .eq('pharmacy_id', account.pharmacyId);
    const regMap = new Map((regs ?? []).map((r: any) => [r.id, r.product]));
    if (!regMap.size) return NextResponse.json({ results: [] });

    let query = db.from('cd_ledger').select('*').in('register_id', Array.from(regMap.keys())).order('transaction_date', { ascending: sort }).order('seq', { ascending: sort }).limit(500);
    if (from) query = query.gte('transaction_date', from);
    if (to) query = query.lte('transaction_date', to);
    // Picked from the drug dropdown: one or more registers (e.g. every strength of OxyContin).
    const ids = (url.searchParams.get('register_ids') || '').split(',').filter((x) => regMap.has(x));
    if (ids.length) query = query.in('register_id', ids);
    if (type) query = query.eq('entry_type', type);
    if (q) {
      const like = `%${q.replace(/[%_,()]/g, ' ')}%`;
      const productIds = (regs ?? []).filter((r: any) => `${r.product.drug_name} ${r.product.strength} ${r.product.class_name}`.toLowerCase().includes(q.toLowerCase())).map((r: any) => r.id);
      const ors = ['supplier_name', 'supplier_address', 'recipient_name', 'recipient_address', 'prescriber_name', 'authority_to_possess', 'prescription_ref', 'witness_name'].map((c) => `${c}.ilike.${like}`);
      if (productIds.length) ors.push(`register_id.in.(${productIds.join(',')})`);
      query = query.or(ors.join(','));
    }
    const { data, error } = await query;
    if (error) throw error;
    return NextResponse.json({ results: (data ?? []).map((r: any) => ({ ...r, product: regMap.get(r.register_id) })) });
  } catch (err) {
    return errorResponse(err);
  }
}
