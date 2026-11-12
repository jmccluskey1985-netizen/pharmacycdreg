import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createServiceClient } from '@/lib/supabase/server';
import { checkRateLimit, clientKey } from '@/lib/rate-limit';
import { sendEmail, adminEmail } from '@/lib/email';

const Body = z.object({
  name: z.string().trim().min(2).max(120),
  pharmacy_name: z.string().trim().min(2).max(160),
  email: z.string().trim().toLowerCase().email().max(200),
  phone: z.string().trim().max(40).optional().or(z.literal('')),
  dispensing_system: z.string().trim().max(80).optional().or(z.literal('')),
  consent_contact: z.literal(true),
  website: z.string().max(0).optional(), // honeypot: real people leave it empty
});

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

export async function POST(req: Request) {
  const limit = checkRateLimit(`waitlist:${clientKey(req)}`, 5, 15 * 60_000);
  if (!limit.ok) return NextResponse.json({ error: 'Too many attempts — try again later.' }, { status: 429 });

  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: 'Please check your details.' }, { status: 400 });
  const b = parsed.data;

  try {
    const db = createServiceClient();
    const { error } = await db.from('waitlist').insert({
      name: b.name, pharmacy_name: b.pharmacy_name, email: b.email, phone: b.phone || null,
      dispensing_system: b.dispensing_system || null, consent_contact: true,
    });
    if (error && error.code !== '23505') {
      console.error('[waitlist]', error.message);
      const missing = /relation .* does not exist|schema cache|Could not find the table/i.test(error.message);
      return NextResponse.json({ error: missing ? 'Waitlist not set up yet (run 0004_waitlist.sql).' : 'Could not save — please try again.' }, { status: 500 });
    }
    if (!error) {
      await sendEmail({
        to: adminEmail(),
        subject: `PharmacyCDReg waitlist: ${b.pharmacy_name}`,
        html: `<p><b>${esc(b.pharmacy_name)}</b></p><p>${esc(b.name)} · ${esc(b.email)}${b.phone ? ` · ${esc(b.phone)}` : ''}${b.dispensing_system ? `<br>Dispensing system: ${esc(b.dispensing_system)}` : ''}</p>`,
      });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[waitlist] failed', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: 'Could not save — please try again.' }, { status: 500 });
  }
}
