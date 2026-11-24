import webpush from 'web-push';
import type { SupabaseClient } from '@supabase/supabase-js';
import { seal, open } from './secret-box';

/**
 * Web Push for phone notifications. The site's VAPID keys are made the first time they're needed
 * and kept in site_secrets (private key encrypted), so there's nothing to set up by hand.
 * Payloads never contain patient details: they show on lock screens.
 */
export async function getVapid(db: SupabaseClient): Promise<{ publicKey: string; privateKey: string } | null> {
  const read = async () => {
    const { data, error } = await db.from('site_secrets').select('vapid_public, vapid_private_enc').eq('id', 'push').maybeSingle();
    if (error) return { missing: /column|relation|does not exist/i.test(error.message), keys: null };
    const priv = data?.vapid_private_enc ? open(data.vapid_private_enc) : null;
    return { missing: false, keys: data?.vapid_public && priv ? { publicKey: data.vapid_public, privateKey: priv } : null };
  };
  const first = await read();
  if (first.keys || first.missing) return first.keys;
  const k = webpush.generateVAPIDKeys();
  // Two requests at once: the first insert wins and both read the same keys back.
  await db.from('site_secrets').upsert({ id: 'push', vapid_public: k.publicKey, vapid_private_enc: seal(k.privateKey), updated_at: new Date().toISOString() }, { onConflict: 'id', ignoreDuplicates: true });
  return (await read()).keys;
}

export interface PushMessage { title: string; body: string; url: string; tag?: string }

/** Send to every device of a pharmacy that turned notifications on. Gone devices are removed. */
export async function sendToPharmacy(db: SupabaseClient, pharmacyId: string, msg: PushMessage, only?: { endpoint: string }) {
  const keys = await getVapid(db);
  if (!keys) return { sent: 0, failed: 0 };
  const site = process.env.NEXT_PUBLIC_SITE_URL || 'https://pharmacycdreg.ie';
  webpush.setVapidDetails(`mailto:${process.env.EMAIL_FROM || 'support@pharmacycdreg.ie'}`, keys.publicKey, keys.privateKey);
  let q = db.from('push_subscriptions').select('id, endpoint, p256dh, auth, failures').eq('pharmacy_id', pharmacyId);
  if (only) q = q.eq('endpoint', only.endpoint);
  const { data: subs } = await q;
  let sent = 0, failed = 0;
  const payload = JSON.stringify({ ...msg, url: msg.url.startsWith('http') ? msg.url : `${site}${msg.url}` });
  for (const s of subs ?? []) {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 6 * 3600, urgency: 'normal' });
      await db.from('push_subscriptions').update({ last_sent_at: new Date().toISOString(), failures: 0 }).eq('id', s.id);
      sent++;
    } catch (e: any) {
      failed++;
      // 404/410: the phone unsubscribed or the app was removed. Other errors: drop after 5 in a row.
      if (e?.statusCode === 404 || e?.statusCode === 410 || (s.failures ?? 0) >= 4) await db.from('push_subscriptions').delete().eq('id', s.id);
      else await db.from('push_subscriptions').update({ failures: (s.failures ?? 0) + 1 }).eq('id', s.id);
    }
  }
  return { sent, failed };
}
