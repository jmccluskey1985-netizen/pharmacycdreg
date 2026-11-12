import { NextResponse } from 'next/server';
import { requireStaff, errorResponse } from '@/lib/access';
import { browseGms, GMS_LIST_DATE } from '@/lib/gms';

export const dynamic = 'force-dynamic';

// HSE list of GPs on the GMS scheme (public data), for the Doctors page.
export async function GET(req: Request) {
  try {
    await requireStaff();
    const url = new URL(req.url);
    const q = (url.searchParams.get('q') || '').slice(0, 80);
    const offset = Math.max(0, Number(url.searchParams.get('offset')) || 0);
    const { total, items } = browseGms(q, offset, 50);
    return NextResponse.json({ total, items, list_date: GMS_LIST_DATE });
  } catch (err) {
    return errorResponse(err);
  }
}
