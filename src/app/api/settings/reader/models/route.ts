import { NextResponse } from 'next/server';
import { requireStaff, errorResponse, HttpError } from '@/lib/access';
import { isSiteAdmin } from '@/lib/admin';

export const dynamic = 'force-dynamic';

const ids = (x: any): string[] => [x?.model_id, x?.model, x?.id, x?.model_slug, x?.permaslug].filter((v) => typeof v === 'string');

// Models that can read photos, return JSON, and have a ZERO-DATA-RETENTION provider on OpenRouter.
export async function GET() {
  try {
    const { account } = await requireStaff();
    if (!isSiteAdmin(account.email)) throw new HttpError(404, 'Not found');
    const [mr, zr] = await Promise.all([
      fetch('https://openrouter.ai/api/v1/models', { signal: AbortSignal.timeout(15_000), cache: 'no-store' }),
      fetch('https://openrouter.ai/api/v1/endpoints/zdr', { signal: AbortSignal.timeout(15_000), cache: 'no-store' }).catch(() => null),
    ]);
    if (!mr.ok) return NextResponse.json({ models: [], error: 'Couldn’t load the model list from OpenRouter' });
    const all = ((await mr.json())?.data ?? [])
      .filter((m: any) => (m.architecture?.input_modalities ?? []).includes('image'))
      .filter((m: any) => { const p: string[] = m.supported_parameters ?? []; return p.includes('response_format') || p.includes('structured_outputs'); });

    // Zero-data endpoints (if OpenRouter's list is available, only those models are offered).
    let zdr: Set<string> | null = null;
    if (zr && zr.ok) {
      const z = (await zr.json().catch(() => null))?.data;
      if (Array.isArray(z)) zdr = new Set(z.flatMap(ids));
    }
    const withZdr = zdr ? all.filter((m: any) => zdr!.has(m.id) || (m.canonical_slug && zdr!.has(m.canonical_slug))) : [];
    const list = (zdr && withZdr.length ? withZdr : all)
      .map((m: any) => ({ id: m.id as string, name: (m.name as string) ?? m.id, prompt_price: Number(m.pricing?.prompt ?? 0) * 1_000_000 }))
      .sort((a: any, b: any) => a.name.localeCompare(b.name));
    return NextResponse.json({ models: list, zdr_filtered: !!(zdr && withZdr.length) });
  } catch (err) {
    return errorResponse(err);
  }
}
