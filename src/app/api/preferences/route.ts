import { NextResponse } from 'next/server';
import { requireAccount, errorResponse } from '@/lib/access';
import { createServiceClient } from '@/lib/supabase/server';
import { isTheme } from '@/lib/theme';

export const dynamic = 'force-dynamic';

/** Display preferences saved on the pharmacy login (migration 0017). Before it's run, the browser remembers them. */
export async function GET() {
  try {
    const account = await requireAccount();
    const { data, error } = await createServiceClient().from('pharmacy_accounts').select('theme').eq('auth_user_id', account.authUserId).maybeSingle();
    return NextResponse.json({ theme: error ? null : data?.theme ?? null });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function POST(req: Request) {
  try {
    const account = await requireAccount();
    const body = await req.json().catch(() => ({}));
    if (!isTheme(body.theme)) return NextResponse.json({ error: 'Unknown colour mode' }, { status: 400 });
    const { error } = await createServiceClient().from('pharmacy_accounts').update({ theme: body.theme }).eq('auth_user_id', account.authUserId);
    return NextResponse.json({ ok: !error, saved_to_account: !error });
  } catch (err) {
    return errorResponse(err);
  }
}
