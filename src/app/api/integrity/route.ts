import { NextResponse } from 'next/server';
import { requireStaff, errorResponse, audit } from '@/lib/access';
import { createServiceClient } from '@/lib/supabase/server';
import { productTitle } from '@/lib/product-name';

export const dynamic = 'force-dynamic';

export interface ChainResult { ok: boolean; checked: number; broken_seq: number | null; reason: string | null; head: string | null }

/**
 * Re-computes every register line's fingerprint and the audit trail's, and reports the first
 * line that doesn't match (an edit or deletion made outside the app). ?register_id= for one book.
 */
export async function GET(req: Request) {
  try {
    const { account, staff } = await requireStaff();
    const only = new URL(req.url).searchParams.get('register_id');
    const db = createServiceClient();
    let q = db.from('cd_registers').select('id, closed_at, product:cd_products(*)').eq('pharmacy_id', account.pharmacyId);
    if (only) q = q.eq('id', only);
    const { data: regs } = await q;
    const registers: (ChainResult & { id: string; label: string })[] = [];
    for (const r of regs ?? []) {
      const { data, error } = await db.rpc('verify_register_chain', { reg: r.id });
      if (error) {
        if (/function|does not exist/i.test(error.message)) return NextResponse.json({ needs_migration: true });
        throw error;
      }
      registers.push({ id: r.id, label: productTitle((r as any).product), ...(Array.isArray(data) ? data[0] : data) });
    }
    let auditResult: ChainResult | null = null;
    if (!only) {
      const { data, error } = await db.rpc('verify_audit_chain', { ph: account.pharmacyId });
      if (!error) auditResult = Array.isArray(data) ? data[0] : data;
    }
    const ok = registers.every((r) => r.ok) && (auditResult?.ok ?? true);
    await audit(account.pharmacyId, ok ? 'integrity.verified' : 'integrity.failed', staff, account.authUserId, { registers: registers.length, broken: registers.filter((r) => !r.ok).map((r) => ({ id: r.id, seq: r.broken_seq })), audit_ok: auditResult?.ok ?? null });
    return NextResponse.json({ ok, registers, audit: auditResult, checked_at: new Date().toISOString() });
  } catch (err) {
    return errorResponse(err);
  }
}
