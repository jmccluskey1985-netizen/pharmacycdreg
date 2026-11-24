import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireStaff, errorResponse, audit } from '@/lib/access';
import { createServiceClient } from '@/lib/supabase/server';
import { getVapid, sendToPharmacy } from '@/lib/push';

export const dynamic = 'force-dynamic';

const Sub = z.object({ endpoint: z.string().url().max(1000), keys: z.object({ p256dh: z.string().min(10).max(300), auth: z.string().min(8).max(100) }) });

/** The site's public push key, and whether this device is already signed up (by endpoint). */
export async function GET(req: Request) {
  try {
    const { account } = await requireStaff();
    const db = createServiceClient();
    const keys = await getVapid(db);
    if (!keys) return NextResponse.json({ available: false });
    const endpoint = new URL(req.url).searchParams.get('endpoint');
    let subscribed = false;
    if (endpoint) {
      const { data } = await db.from('push_subscriptions').select('id').eq('pharmacy_id', account.pharmacyId).eq('endpoint', endpoint).maybeSingle();
      subscribed = !!data;
    }
    return NextResponse.json({ available: true, publicKey: keys.publicKey, subscribed });
  } catch (err) {
    return errorResponse(err);
  }
}

/** Turn notifications on for this device, then send a test so the person sees it working. */
export async function POST(req: Request) {
  try {
    const { account, staff } = await requireStaff();
    const parsed = Sub.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return NextResponse.json({ error: 'That device can’t receive notifications' }, { status: 400 });
    const s = parsed.data;
    const db = createServiceClient();
    const { error } = await db.from('push_subscriptions').upsert({
      pharmacy_id: account.pharmacyId, staff_id: staff.id, endpoint: s.endpoint, p256dh: s.keys.p256dh, auth: s.keys.auth,
      user_agent: (req.headers.get('user-agent') ?? '').slice(0, 300), failures: 0,
    }, { onConflict: 'endpoint' });
    if (error) throw error;
    await audit(account.pharmacyId, 'notifications.on', staff, account.authUserId, {});
    await sendToPharmacy(db, account.pharmacyId, { title: 'Notifications are on', body: 'You’ll get a notification here when dispensing reminders are due. No patient details are shown.', url: '/dashboard/reminders', tag: 'cdreg-test' }, { endpoint: s.endpoint });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}

/** Turn them off for this device. */
export async function DELETE(req: Request) {
  try {
    const { account, staff } = await requireStaff();
    const { endpoint } = (await req.json().catch(() => ({}))) as { endpoint?: string };
    if (!endpoint) return NextResponse.json({ error: 'Missing device' }, { status: 400 });
    const db = createServiceClient();
    await db.from('push_subscriptions').delete().eq('pharmacy_id', account.pharmacyId).eq('endpoint', endpoint);
    await audit(account.pharmacyId, 'notifications.off', staff, account.authUserId, {});
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
