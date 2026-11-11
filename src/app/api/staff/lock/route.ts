import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { STAFF_COOKIE } from '@/lib/staff-session';

// "Lock" / switch user: clears the active staff member; the pharmacy login stays.
export async function POST() {
  cookies().delete(STAFF_COOKIE);
  return NextResponse.json({ ok: true });
}
