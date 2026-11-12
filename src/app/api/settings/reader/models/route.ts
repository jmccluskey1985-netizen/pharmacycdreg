import { NextResponse } from 'next/server';
import { requireStaff, errorResponse, HttpError } from '@/lib/access';
import { isSiteAdmin } from '@/lib/admin';

export const dynamic = 'force-dynamic';

// Models on OpenRouter that can read photos and return structured results — for the picker.
export async function GET() {
  try {
    const { account } = await requireStaff();
    if (!isSiteAdmin(account.email)) throw new HttpError(404, 'Not found');
    const r = await fetch('https://openrouter.ai/api/v1/models', { signal: AbortSignal.timeout(15_000), next: { revalidate: 3600 } } as RequestInit);
    if (!r.ok) return NextResponse.json({ models: [], error: 'Couldn’t load the model list from OpenRouter' });
    const d = await r.json();
    const models = (d?.data ?? [])
      .filter((m: any) => (m.architecture?.input_modalities ?? []).includes('image'))
      .filter((m: any) => { const p: string[] = m.supported_parameters ?? []; return p.includes('response_format') || p.includes('structured_outputs'); })
      .map((m: any) => ({ id: m.id as string, name: (m.name as string) ?? m.id, prompt_price: Number(m.pricing?.prompt ?? 0) * 1_000_000 }))
      .sort((a: any, b: any) => a.name.localeCompare(b.name));
    return NextResponse.json({ models });
  } catch (err) {
    return errorResponse(err);
  }
}
