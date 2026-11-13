import { NextResponse } from 'next/server';
import { createServerSupabaseClient, createServiceClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

const back = (origin: string, msg: string) => NextResponse.redirect(`${origin}/?auth_error=${encodeURIComponent(msg)}`);

/**
 * Google sign-in lands here. The Google account must belong to an existing pharmacy login
 * (Supabase links a Google account to the login with the same verified email). Anyone else
 * is signed straight back out: Google never creates a pharmacy.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const origin = url.origin;
  const rawNext = url.searchParams.get('next') || '/dashboard';
  const next = rawNext.startsWith('/') && !rawNext.startsWith('//') ? rawNext : '/dashboard';
  const err = url.searchParams.get('error_description') || url.searchParams.get('error');
  if (err) return back(origin, `Google sign-in didn’t finish: ${err}`);
  const code = url.searchParams.get('code');
  if (!code) return back(origin, 'Google sign-in didn’t finish. Please try again.');

  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error || !data.user) return back(origin, 'Google sign-in didn’t finish. Please try again.');

  const { data: link } = await createServiceClient().from('pharmacy_accounts').select('pharmacy_id').eq('auth_user_id', data.user.id).maybeSingle();
  if (!link) {
    await supabase.auth.signOut();
    return back(origin, `${data.user.email ?? 'That Google account'} isn’t a pharmacy login here. Use the Google account with your pharmacy’s email, or sign in with email and password.`);
  }
  return NextResponse.redirect(`${origin}${next}`);
}
