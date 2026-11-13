// Full sweep of the demo build: every page on desktop and phone, then each main workflow.
//   NEXT_PUBLIC_DEMO_MODE=1 npm run build && npx next start -p 3200 &
//   npm run test:sweep
import { chromium } from 'playwright';

const B = process.env.BASE_URL || 'http://localhost:3200';
const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
let failed = 0;
const results = [];
let current = null; // page used by workflow steps; each one starts with no dialog open
const step = async (name, fn) => {
  if (current) { await current.keyboard.press('Escape').catch(() => {}); await current.keyboard.press('Escape').catch(() => {}); }
  try { await fn(); results.push(['ok  ', name]); console.log('ok  ', name); }
  catch (e) { failed++; results.push(['FAIL', name]); if (current && process.env.SHOTS) await current.screenshot({ path: `${process.env.SHOTS}/fail-${results.length}.png` }).catch(() => {}); console.log('FAIL', name, ':', String(e.message).split('\n')[0]); }
};

async function signedInPage(viewport, pin = '1234') {
  const ctx = await browser.newContext({ viewport, acceptDownloads: true });
  const page = await ctx.newPage();
  page.errors = [];
  page.on('pageerror', (e) => page.errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && /Content Security Policy|Refused to|Hydration|did not match/i.test(m.text())) page.errors.push(m.text()); });
  await page.goto(B + '/dashboard'); await page.waitForTimeout(1200);
  for (const d of pin) await page.getByRole('button', { name: d, exact: true }).first().click();
  await page.getByRole('button', { name: 'OK', exact: true }).click().catch(() => {});
  await page.waitForSelector('a[href="/dashboard/register/r1"]', { timeout: 10000 });
  return page;
}
const PAGES = ['/dashboard', '/dashboard/register/r1', '/dashboard/scan?type=prescription', '/dashboard/inbox', '/dashboard/search', '/dashboard/patients',
  '/dashboard/reminders', '/dashboard/destructions', '/dashboard/notes', '/dashboard/audit', '/dashboard/contacts', '/dashboard/team', '/dashboard/integrations',
  '/dashboard/billing', '/dashboard/settings', '/dashboard/help', '/dashboard/feedback', '/dashboard/fallback-sheet'];
const PUBLIC = ['/?home=1', '/security', '/privacy', '/terms'];

// ── 1. Every page, desktop and phone ──
for (const [label, viewport] of [['desktop', { width: 1366, height: 900 }], ['phone', { width: 390, height: 844 }]]) {
  const page = await signedInPage(viewport);
  for (const p of [...PAGES, ...PUBLIC]) {
    await step(`${label} ${p}: loads cleanly`, async () => {
      page.errors.length = 0;
      await page.goto(B + p); await page.waitForTimeout(1300);
      const info = await page.evaluate(() => ({ w: document.documentElement.scrollWidth, text: document.body.innerText }));
      if (/Something went wrong|Application error|couldn’t load/i.test(info.text)) throw new Error('error page shown');
      if (info.text.includes('—')) throw new Error('em dash on page: ' + info.text.slice(info.text.indexOf('—') - 30, info.text.indexOf('—') + 10));
      if (info.w > viewport.width + 2) throw new Error(`page is ${info.w}px wide`);
      if (page.errors.length) throw new Error(page.errors.slice(0, 2).join(' | '));
    });
  }
  await page.context().close();
}

// ── 2. Workflows (supervising pharmacist) ──
const page = await signedInPage({ width: 1366, height: 900 });
current = page;
const see = (sel, timeout = 8000) => page.waitForSelector(sel, { timeout });
const click = (sel) => page.click(sel, { timeout: 8000 });
const balanceOf = async () => Number((await page.locator('text=/current balance/').first().innerText()).match(/current balance\s+([\d.]+)/)[1]);
const field = (label) => page.locator(`xpath=//label[normalize-space(.)="${label}"]/following::input[1]`).first();
const openNewEntry = async () => { await click('button:has-text("New entry") >> nth=-1'); await see('text=Date of transaction'); };

await step('wrong PIN shows an error and keeps the pharmacy signed in', async () => {
  const ctx = await browser.newContext(); const p = await ctx.newPage();
  await p.goto(B + '/dashboard'); await p.waitForTimeout(1200);
  for (const d of '9999') await p.getByRole('button', { name: d, exact: true }).first().click();
  await p.getByRole('button', { name: 'OK', exact: true }).click().catch(() => {});
  await p.waitForSelector('text=/not recognised/i', { timeout: 6000 });
  if (!(await p.isVisible('text=/Enter your PIN/i'))) throw new Error('left the PIN screen');
  await ctx.close();
});

await step('receipt: balance goes up by the amount', async () => {
  await page.goto(B + '/dashboard/register/r1'); await see('text=CLASS OF DRUG'); await page.waitForTimeout(1000);
  const before = await balanceOf();
  await openNewEntry(); await click('button:has-text("Obtained")');
  await page.fill('input[type=number]', '56');
  await page.locator('input[placeholder*="United"]').fill('Uniphar');
  await field('Address').fill('Belgard Rd, Dublin 24');
  await field('Invoice / docket no.').fill('Invoice 99001');
  await click('button:has-text("Sign & record")'); await page.waitForTimeout(1200);
  const after = await balanceOf();
  if (after !== before + 56) throw new Error(`balance ${before} → ${after}`);
});

await step('supply: balance goes down; more than the balance is refused', async () => {
  const before = await balanceOf();
  await openNewEntry(); await click('button:has-text("Supplied")');
  await page.fill('input[type=number]', String(before + 1000));
  await page.locator('input[placeholder*="Name, DOB"]').fill('Test Patient');
  await field('Address').fill('1 Test St, Ennis');
  await click('button:has-text("Sign & record")');
  await see('text=/below zero/i');
  await page.fill('input[type=number]', '10');
  await click('button:has-text("Sign & record")'); await page.waitForTimeout(1200);
  const after = await balanceOf();
  if (after !== before - 10) throw new Error(`balance ${before} → ${after}`);
});

await step('duplicate supply is caught', async () => {
  await openNewEntry(); await click('button:has-text("Supplied")');
  await page.fill('input[type=number]', '10');
  await page.locator('input[placeholder*="Name, DOB"]').fill('Test Patient');
  await field('Address').fill('1 Test St, Ennis');
  await click('button:has-text("Sign & record")');
  await see('text=/duplicate/i');
  await page.keyboard.press('Escape');
});

await step('correction keeps the original struck through with a footnote', async () => {
  await page.waitForTimeout(500);
  const lines = page.locator('button[aria-label^="Correct line"]');
  await lines.last().click(); await see('text=Correct a register entry');
  await page.fill('input[type=number]', '9');
  await page.fill('textarea', 'Entered 10 in error; 9 supplied');
  await click('button:has-text("Record correction")'); await page.waitForTimeout(1200);
  await see('text=/Entered 10 in error/');
  if (!(await page.locator('td.struck').count())) throw new Error('no struck-through original');
});

await step('repeat for today records selected supplies', async () => {
  const before = await balanceOf();
  await page.locator('tr[title*="Click to select"]').first().click();
  await click('button:has-text("Repeat for today")'); await see('text=New prescription');
  const qty = Number(await page.locator('input[type=number]').first().inputValue());
  await page.fill('input[placeholder*="GMS"]', 'Rx 77001');
  await click('button:has-text("Sign & record")'); await page.waitForTimeout(2000);
  const after = await balanceOf();
  if (after !== before - qty) throw new Error(`balance ${before} → ${after} (qty ${qty})`);
});

await step('set aside expired stock, then record the witnessed destruction', async () => {
  const before = await balanceOf();
  await click('button:has-text("Set aside")'); await page.fill('input[type=number]', '4');
  await click('button:has-text("Set aside for destruction")'); await see('text=still in the balance');
  if ((await balanceOf()) !== before) throw new Error('set-aside stock left the balance');
  await page.goto(B + '/dashboard/destructions'); await see('text=Awaiting destruction');
  await page.check('input[type=checkbox]'); await click('button:has-text("Record witnessed destruction")');
  await page.locator('form input').first().fill('Sgt Ryan'); await page.fill('input[placeholder*="Authorised officer"]', 'Garda');
  await click('button:has-text("Sign & record destruction")'); await see('text=Nothing awaiting destruction');
  await page.goto(B + '/dashboard/register/r1'); await see('text=CLASS OF DRUG'); await page.waitForTimeout(1000);
  if ((await balanceOf()) !== before - 4) throw new Error('destruction did not reduce the balance by 4');
});

await step('patient return goes in the destruction book, not the register', async () => {
  const before = await balanceOf();
  await page.goto(B + '/dashboard/destructions?tab=book&new=return'); await see('text=Patient-returned CD received');
  await page.locator('form input').first().fill('Mary Kelly');
  await page.fill('input[placeholder*="OxyNorm"]', 'OxyNorm 5mg capsules'); await page.fill('form input[type=number]', '7');
  await click('button:has-text("Sign & record")'); await see('text=waiting to be destroyed');
  await page.locator('tbody input[type=checkbox]').first().check(); await click('button:has-text("Record destruction")');
  await click('form button:has-text("Sign & record destruction")'); await page.waitForTimeout(1000);
  if (await page.isVisible('text=waiting to be destroyed')) throw new Error('still waiting');
  await page.goto(B + '/dashboard/register/r1'); await see('text=CLASS OF DRUG'); await page.waitForTimeout(800);
  if ((await balanceOf()) !== before) throw new Error('register balance changed');
});

await step('patients: add a patient and find them', async () => {
  await page.goto(B + '/dashboard/patients'); await click('button:has-text("New patient")');
  await page.locator('input[autofocus], form input').first().fill('Sweep');
  await page.locator('label:has-text("Surname") ~ input').first().fill('Tester');
  await click('form button.btn-primary'); await page.waitForTimeout(1000);
  await page.goto(B + '/dashboard/patients'); await page.waitForTimeout(1000);
  await see('text=Tester');
});

await step('doctors & suppliers: add a prescriber', async () => {
  await page.goto(B + '/dashboard/contacts'); await page.waitForTimeout(800);
  await click('button:has-text("Add")'); await page.locator('form input').first().fill('Dr Sweep Test');
  await click('form button.btn-primary'); await page.waitForTimeout(1000);
  await see('text=Dr Sweep Test');
});

await step('search finds OxyNorm entries', async () => {
  await page.goto(B + '/dashboard/search'); await page.waitForTimeout(800);
  await page.locator('input').first().fill('OxyNorm'); await page.waitForTimeout(1500);
  await see('text=/OxyNorm/');
});

await step('team: add a staff member with a PIN', async () => {
  await page.goto(B + '/dashboard/team'); await page.waitForTimeout(800);
  await click('button:has-text("Add")');
  await page.locator('label:has-text("Full name") ~ input').fill('Sweep Locum');
  await page.locator('label:has-text("PSI registration") ~ input').fill('99999').catch(() => {});
  await page.locator('input[type=password]').fill('8642');
  await click('form button.btn-primary'); await page.waitForTimeout(1000);
  await see('text=Sweep Locum');
});

await step('settings: change the screen lock and save', async () => {
  await page.goto(B + '/dashboard/settings'); await page.waitForTimeout(1000);
  await page.locator('select').first().selectOption('10').catch(async () => { await page.locator('select').nth(1).selectOption('10'); });
  await page.locator('button:has-text("Save")').nth(1).click(); await page.waitForTimeout(800);
  if (await page.isVisible('text=/Could not save/i')) throw new Error('save failed');
});

await step('To confirm (Halo): post a dispensing to the register', async () => {
  await page.goto(B + '/dashboard/inbox'); await page.waitForTimeout(1200);
  const btn = page.locator('button:has-text("Check & sign")').first();
  if (!(await btn.count())) throw new Error('nothing to confirm');
  await btn.click(); await page.waitForTimeout(800);
  const sign = page.locator('button:has-text("Sign & record")');
  if (await sign.count()) { await sign.first().click(); await page.waitForTimeout(1200); }
});

await step('invoice scan: read, check and record a line', async () => {
  await page.goto(B + '/dashboard/scan?type=invoice'); await page.waitForTimeout(1200);
  await page.setInputFiles('input[type=file]', { name: 'invoice.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64') });
  await page.getByRole('button', { name: /Read/ }).first().click();
  await see('text=Check and record', 15000);
  await click('button:has-text("Check details & record") >> nth=0'); await page.waitForTimeout(800);
  const sign = page.locator('button:has-text("Sign & record")');
  if (await sign.count()) { await sign.first().click(); await page.waitForTimeout(1500); }
  if (await page.isVisible('text=/Could not|error/i')) throw new Error('recording failed');
});

await step('full backup downloads', async () => {
  await page.goto(B + '/dashboard/settings'); await page.waitForTimeout(800);
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 8000 }), page.click('a:has-text("Full backup")')]);
  if (!/backup.*\.json$/.test(dl.suggestedFilename())) throw new Error(dl.suggestedFilename());
});

await step('CSV export of a register downloads', async () => {
  await page.goto(B + '/dashboard/register/r1'); await see('text=CLASS OF DRUG'); await page.waitForTimeout(800);
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 8000 }), page.click('a:has-text("CSV"), a:has-text("Export")')]);
  if (!/\.csv$/.test(dl.suggestedFilename())) throw new Error(dl.suggestedFilename());
});

await step('lock and switch user', async () => {
  await click('button:has-text("Lock / switch user")'); await see('text=/Enter your PIN/i');
  for (const d of '2345') await page.getByRole('button', { name: d, exact: true }).first().click();
  await page.getByRole('button', { name: 'OK', exact: true }).click().catch(() => {});
  await see('text=Ciarán Walsh');
});

await step('technician can draft but not sign register entries', async () => {
  const t = await signedInPage({ width: 1366, height: 900 }, '4567');
  await t.goto(B + '/dashboard/register/r1'); await t.waitForSelector('text=CLASS OF DRUG'); await t.waitForTimeout(800);
  if (await t.locator('button[aria-label^="Correct line"]').count()) throw new Error('technician sees correction buttons');
  if (await t.locator('button:has-text("New entry")').count() > 1) throw new Error('technician sees the register New entry button');
  await t.context().close();
});

await step('no page errors during the workflows', async () => { if (page.errors.length) throw new Error(page.errors.slice(0, 3).join(' | ')); });

await browser.close();
console.log(`\n${results.filter((r) => r[0] === 'ok  ').length} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
