// End-to-end click-through of the demo build (in-browser sample data, no database).
//   NEXT_PUBLIC_DEMO_MODE=1 npm run build && npx next start -p 3200 &
//   npm run test:e2e            (BASE_URL to point elsewhere)
import { chromium } from 'playwright';

const B = process.env.BASE_URL || 'http://localhost:3200';
const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error' && /Content Security Policy|Refused to/.test(m.text())) errors.push(m.text()); });
let failed = 0;
const step = async (name, fn) => {
  try { await fn(); console.log('ok  ', name); }
  catch (e) { failed++; console.log('FAIL', name, '-', String(e.message).split('\n')[0]); }
};
const click = (sel) => page.click(sel, { timeout: 10000 });
const see = (sel, timeout = 10000) => page.waitForSelector(sel, { timeout });

await step('PIN sign-in', async () => {
  await page.goto(B + '/dashboard'); await page.waitForTimeout(1200);
  for (const d of '1234') await page.getByRole('button', { name: d, exact: true }).first().click();
  await page.getByRole('button', { name: 'OK', exact: true }).click().catch(() => {});
  await see('a[href="/dashboard/register/r1"]');
});
await step('security headers present', async () => {
  const r = await page.request.get(B + '/');
  for (const h of ['strict-transport-security', 'content-security-policy', 'x-frame-options', 'x-content-type-options']) if (!r.headers()[h]) throw new Error('missing ' + h);
});
await step('health endpoint answers', async () => { const r = await page.request.get(B + '/api/health'); if (![200, 503].includes(r.status())) throw new Error('status ' + r.status()); });
await step('register opens', async () => { await click('a[href="/dashboard/register/r1"]'); await see('text=CLASS OF DRUG'); });
await step('late entry needs a reason', async () => {
  await page.waitForTimeout(800);
  await click('button:has-text("New entry") >> nth=-1'); await see('text=Date of transaction');
  await click('button:has-text("Supplied")');
  await page.fill('input[type=date]', '2026-01-02');
  await see('text=Late entry: this transaction is more than a day old');
  await page.keyboard.press('Escape');
});
await step('stock check → amend balance', async () => {
  await page.waitForTimeout(400);
  await click('button:has-text("Stock check")'); await page.fill('input[type=number]', '3');
  await page.fill('input[placeholder*="Recounted"]', 'Recounted twice');
  await click('button:has-text("Sign & record check")'); await see('text=Amend the register balance');
  await page.fill('textarea', 'Recounted with a second pharmacist and checked recent invoices and prescriptions.');
  await click('button:has-text("Sign & amend balance")'); await see('text=Balance amended');
});
await step('reminder recorded in one click', async () => {
  await page.goto(B + '/dashboard/reminders'); await see('text=Due now');
  await click('button:has-text("now")'); await page.fill('input[placeholder*="GMS"]', 'Rx 1');
  await click('button:has-text("Sign & record")'); await see('text=Coming up');
});
await step('note with link', async () => {
  await page.goto(B + '/dashboard/notes'); await click('button:has-text("New note")');
  await page.fill('input[minlength="2"]', 'E2E note'); await page.fill('textarea', 'See https://example.com');
  await click('button:has-text("Save note")'); await see('text=Take photo');
});
await step('feedback sent', async () => { await page.goto(B + '/dashboard/feedback'); await page.fill('textarea', 'E2E idea'); await click('button:has-text("Send")'); await see('text=Thank you'); });
await step('destructions: two separate books', async () => { await page.goto(B + '/dashboard/destructions'); await see('text=Awaiting destruction'); await click('button:has-text("Destruction Record Book")'); await see('text=Patient-returned CDs'); });
await step('integrity verified', async () => { await page.goto(B + '/dashboard/audit'); await click('button:has-text("Verify integrity")'); await see('text=Intact'); });
await step('help and fallback sheet', async () => { await page.goto(B + '/dashboard/help'); await see('text=If the system or internet is down'); await page.goto(B + '/dashboard/fallback-sheet'); await see('text=paper fallback record'); });
await step('public pages', async () => { for (const p of ['/security', '/privacy', '/terms']) { await page.goto(B + p); await see('h1'); } });
await step('no sideways scrolling on a phone', async () => {
  await page.setViewportSize({ width: 390, height: 844 });
  for (const p of ['/dashboard', '/dashboard/register/r1', '/dashboard/reminders', '/dashboard/notes', '/dashboard/feedback', '/dashboard/destructions', '/dashboard/audit', '/dashboard/help', '/dashboard/settings', '/security']) {
    await page.goto(B + p); await page.waitForTimeout(900);
    const w = await page.evaluate(() => document.documentElement.scrollWidth);
    if (w > 392) throw new Error(`${p} is ${w}px wide`);
  }
});
await step('no page errors', async () => { if (errors.length) throw new Error(errors.slice(0, 3).join(' | ')); });

await browser.close();
console.log(failed ? `\n${failed} FAILED` : '\nAll passed');
process.exit(failed ? 1 : 0);
