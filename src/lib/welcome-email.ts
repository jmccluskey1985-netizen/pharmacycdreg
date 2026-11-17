import { COMPANY } from '@/config/company';

/** Sent to a new pharmacy straight after sign-up. No patient data. Replies go to support. */
export function welcomeEmail({ pharmacy, contact, trialEnds, site }: { pharmacy: string; contact: string; trialEnds: string; site: string }) {
  const first = contact.trim().split(/\s+/)[0] || 'there';
  const ends = new Date(trialEnds).toLocaleDateString('en-IE', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Dublin' });
  const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
  const step = (n: number, title: string, text: string) => `<tr><td style="vertical-align:top;padding:6px 10px 6px 0"><span style="display:inline-block;width:22px;height:22px;border-radius:11px;background:#54BD50;color:#fff;font-weight:700;font-size:12px;text-align:center;line-height:22px">${n}</span></td><td style="padding:6px 0"><b>${title}</b><br><span style="color:#475569">${text}</span></td></tr>`;
  const subject = `Welcome to PharmacyCDReg.ie, ${pharmacy}`;
  const html = `<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#0f172a;line-height:1.5">
<p style="font-weight:700;font-size:20px;margin:0 0 16px"><span style="color:#184B21">Pharmacy</span><span style="color:#54BD50">CDReg</span><span style="color:#184B21">.ie</span></p>
<p>Hi ${esc(first)},</p>
<p>Welcome aboard: <b>${esc(pharmacy)}</b> is set up and your <b>free month</b> has started. It runs until <b>${ends}</b>, no card needed. Subscribe from Billing whenever you’re ready.</p>
<p style="margin-top:20px;font-weight:700">Getting started (about 15 minutes)</p>
<table role="presentation" style="border-collapse:collapse;font-size:14px">
${step(1, 'Set up your supervising pharmacist and PIN', 'The first time you sign in, then add your team (pharmacists, technicians, locums) in Team &amp; PINs.')}
${step(2, 'Open your CD books', 'Pick them from the CD list, or photograph the last page of each paper register: the balance brought forward is read for you.')}
${step(3, 'Record your first entry', 'Scan Rx for a prescription, or photograph a wholesaler invoice or CD docket. Nothing goes in until a pharmacist signs it.')}
${step(4, 'Methadone or buprenorphine patients?', 'Add them once from their bag labels (Patients → From bag labels).')}
${step(5, 'Turn on two-step sign-in', 'Settings → Security: a code from your phone protects the register even if a password leaks.')}
</table>
<p style="margin-top:20px"><a href="${site}/dashboard" style="display:inline-block;padding:12px 20px;background:#184B21;color:#fff;text-decoration:none;border-radius:8px;font-weight:600">Open your register</a></p>
<p style="font-size:14px">Useful: <a href="${site}/dashboard/help" style="color:#184B21">One-minute help guides</a> · <a href="${site}/data-safety" style="color:#184B21">Data safety at a glance</a> (handy for your superintendent).</p>
<p style="font-size:14px">Questions or ideas? Just reply to this email: it comes straight to us at ${COMPANY.email}.</p>
<p style="font-size:14px">The PharmacyCDReg.ie team</p>
<p style="color:#64748b;font-size:12px;margin-top:28px">You’re getting this because ${esc(pharmacy)} signed up at pharmacycdreg.ie. No patient details are ever included in our emails.</p></div>`;
  return { subject, html };
}
