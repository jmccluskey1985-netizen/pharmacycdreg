// Full sweep of the demo build: every page on desktop and phone, then each main workflow.
//   NEXT_PUBLIC_DEMO_MODE=1 npm run build && npx next start -p 3200 &
//   npm run test:sweep
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';

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
const PAGES = ['/dashboard', '/dashboard/group', '/dashboard/register/r1', '/dashboard/scan?type=prescription', '/dashboard/inbox', '/dashboard/search', '/dashboard/patients',
  '/dashboard/reminders', '/dashboard/destructions', '/dashboard/notes', '/dashboard/audit', '/dashboard/contacts', '/dashboard/team', '/dashboard/integrations',
  '/dashboard/billing', '/dashboard/settings', '/dashboard/help', '/dashboard/feedback', '/dashboard/fallback-sheet'];
const PUBLIC = ['/?home=1', '/security', '/privacy', '/terms', '/start', '/data-safety'];

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
  await page.locator('input[placeholder*="wholesaler"]').fill('Uniphar');
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

await step('different invoice numbers aren’t a duplicate; a flagged one can be recorded with a reason from the main button', async () => {
  // Same amount as the earlier receipt, new invoice number: a second delivery, no warning
  await openNewEntry(); await click('button:has-text("Obtained")');
  await page.fill('input[type=number]', '56');
  await page.locator('input[placeholder*="wholesaler"]').fill('Uniphar');
  await field('Address').fill('Belgard Rd, Dublin 24');
  await field('Invoice / docket no.').fill('Invoice 99002');
  await click('button:has-text("Sign & record")');
  await page.waitForSelector('form', { state: 'detached', timeout: 8000 });
  // Same amount, no number: flagged; reason typed, then the main button records it
  await openNewEntry(); await click('button:has-text("Obtained")');
  await page.fill('input[type=number]', '56');
  await page.locator('input[placeholder*="wholesaler"]').fill('Uniphar');
  await field('Address').fill('Belgard Rd, Dublin 24');
  await click('button:has-text("Sign & record")');
  await see('text=/Possible duplicate/i');
  await click('button:has-text("It’s a separate")');
  await page.locator('input[placeholder*="Second delivery"]').fill('Second delivery, docket to follow');
  await click('button:has-text("Sign & record")');
  await page.waitForSelector('form', { state: 'detached', timeout: 8000 });
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
  await page.goto(B + '/dashboard/settings?tab=security'); await page.waitForTimeout(1000);
  await page.locator('select').first().selectOption('10').catch(async () => { await page.locator('select').nth(1).selectOption('10'); });
  await page.locator('button:has-text("Save")').first().click(); await page.waitForTimeout(800);
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
  const sign = page.locator('button:has-text("Sign & record"), button:has-text("Confirm & record")');
  if (await sign.count()) { await sign.first().click(); await page.waitForTimeout(1500); }
  if (await page.isVisible('text=/Could not|error/i')) throw new Error('recording failed');
  await see('a:has-text("View book")'); // each recorded line links to its book
  for (let k = 0; k < 5 && await page.locator('button:has-text("Check details & record")').count(); k++) {
    await click('button:has-text("Check details & record") >> nth=0'); await page.waitForTimeout(600);
    await click('button:has-text("Confirm & record") >> nth=0'); await page.waitForTimeout(1200);
  }
  await see('[role=status]:has-text("books were updated"), [role=status]:has-text("This book was updated")'); // tick + the books, tap to open
  if (!(await page.locator('[role=status] a[href^="/dashboard/register/"]').count())) throw new Error('updated books not listed');
});

await step('Rx scan: a misspelt name is matched to the existing patient', async () => {
  await page.goto(B + '/dashboard/scan?type=prescription'); await page.waitForTimeout(1200);
  await page.setInputFiles('input[type=file]', { name: 'rx.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64') });
  const read = page.getByRole('button', { name: /Read/ }).first();
  if (await read.isVisible().catch(() => false)) await read.click();
  await see('text=Is this one of your patients?', 15000);
  await see('text=/GMS matches/');
  await page.locator('label:has-text("GMS matches") input[type=radio]').first().check(); // the right Mary Kelly, not another one spelt alike
  const open = page.locator('button:has-text("Check details & record")');
  if (await open.count()) await open.first().click();
  await page.waitForTimeout(600);
  await click('button:has-text("Confirm & record")'); await page.waitForTimeout(1500);
  if (await page.isVisible('text=/Could not|below zero/i')) throw new Error('recording failed');
  await see('text=Recorded');
});

await step('OST methadone form: today\'s supervised + take-away recorded as one supply', async () => {
  await page.goto(B + '/dashboard/scan?type=prescription'); await page.waitForTimeout(1200);
  await page.setInputFiles('input[type=file]', { name: 'ost-form.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64') });
  const read = page.getByRole('button', { name: /Read/ }).first();
  if (await read.isVisible().catch(() => false)) await read.click();
  await see('text=Opioid substitution prescription', 15000);
  await see('text=/Dispensed today: 75 supervised \\+ 300 take-away/');
  await see('text=/Not in the register/');
  const open = page.locator('button:has-text("Check details & record")');
  if (await open.count()) await open.first().click();
  await page.waitForTimeout(600);
  const qty = await page.locator('input[type=number]').first().inputValue();
  if (qty !== '375') throw new Error('today quantity ' + qty);
  await click('button:has-text("Confirm & record") >> nth=0'); await page.waitForTimeout(1500);
  await see('text=Recorded');
});

await step('typed supply: an existing patient is offered before a new record is made', async () => {
  await page.goto(B + '/dashboard/register/r1'); await see('text=CLASS OF DRUG'); await page.waitForTimeout(600);
  await openNewEntry(); await click('button:has-text("Supplied")');
  await page.fill('input[type=number]', '2');
  await page.locator('input[placeholder*="Name, DOB"]').fill('Patrick Hayes');
  await page.locator('h1, h2').first().click().catch(() => {});
  await field('Address').fill('22 Abbey St, Ennis');
  await click('button:has-text("Sign & record")');
  await see('text=Is this one of your patients?');
  await page.getByRole('radio', { name: 'Patrick Hayes' }).first().check();
  await click('button:has-text("Sign & record")'); await page.waitForTimeout(1200);
  if (await page.isVisible('text=Is this one of your patients?')) throw new Error('still asking');
});

await step('OST patients onboarded from bag labels', async () => {
  await page.goto(B + '/dashboard/patients?ost=labels'); await page.waitForTimeout(1000);
  await see('text=OST patients from bag labels');
  await page.setInputFiles('input[type=file][multiple]', { name: 'labels.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64') });
  await see('text=Aisling Moran', 8000);
  await click('button:has-text("Save 2 to the OST list")');
  await see('text=/1 added, 1 updated/');
});

await step('stock check: dispensing report shows missing entries, ticked ones added (late with footnote)', async () => {
  await page.goto(B + '/dashboard/register/r1'); await page.waitForTimeout(1000);
  await click('button:has-text("Stock check")');
  await page.setInputFiles('input[aria-label="Report file"]', { name: 'cd-report.csv', mimeType: 'text/csv', buffer: Buffer.from('date,patient,qty\n') });
  await see('text=Paddy Hehir', 8000);
  await see('text=/Over 24 hours/');
  await see('text=/quantity differs/');
  await see('text=/Date partly cut off/');
  if (!(await page.isDisabled('button:has-text("Sign & add 2 missing entries")'))) throw new Error('should need an address first');
  await page.fill('input[placeholder="Patient address (needed for the register)"]', '21 Bridge Street, Ennis');
  await click('button:has-text("Sign & add 2 missing entries")');
  await page.waitForTimeout(1500);
  if ((await page.locator('text=/Added: register line/').count()) !== 2) throw new Error('both not added');
});

await step('patients: possible duplicates can be merged', async () => {
  await page.goto(B + '/dashboard/patients'); await page.waitForTimeout(800);
  await click('button:has-text("Possible duplicates")');
  await see('text=/Keep Patrick Hayes/');
  page.once('dialog', (d) => d.accept());
  await click('button:has-text("(left)")'); await page.waitForTimeout(800);
  await see('text=/Merged\./');
});

await step('colour mode: choose True Black, kept after reload, then back to Default', async () => {
  await page.goto(B + '/dashboard/settings'); await page.waitForTimeout(900);
  await page.getByRole('radio', { name: /True Black/ }).click(); await page.waitForTimeout(300);
  await page.reload(); await page.waitForTimeout(1200);
  if (!(await page.evaluate(() => document.documentElement.classList.contains('dark')))) throw new Error('not remembered');
  await page.goto(B + '/?home=1'); await page.waitForTimeout(800);
  if (await page.evaluate(() => document.documentElement.classList.contains('dark'))) throw new Error('home page went dark');
  await page.goto(B + '/dashboard/settings'); await page.waitForTimeout(900);
  await page.getByRole('radio', { name: /^Default/ }).click(); await page.waitForTimeout(300);
});

await step('two-step suggestion bar: shown, hidden with X until next sign-in', async () => {
  await page.goto(B + '/dashboard'); await page.waitForTimeout(1000);
  await see('text=Protect your register with two-step sign-in');
  await click('button[aria-label="Hide until next sign-in"]'); await page.waitForTimeout(300);
  await page.reload(); await page.waitForTimeout(1200);
  if (await page.isVisible('text=Protect your register with two-step sign-in')) throw new Error('came back in the same sign-in');
});

await step('full backup downloads, password protected', async () => {
  await page.goto(B + '/dashboard/settings?tab=data'); await page.waitForTimeout(800);
  await click('button:has-text("Full backup")');
  await page.fill('#bk-pw', 'sweep-test-password'); await page.fill('#bk-pw2', 'sweep-test-password');
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 15000 }), page.click('button:has-text("Download protected backup")')]);
  const body = JSON.parse(readFileSync(await dl.path(), 'utf8'));
  if (body.format !== 'pharmacycdreg-backup-encrypted' || JSON.stringify(body).includes('Mary Kelly')) throw new Error('backup not encrypted');
  if (!/backup.*\.json$/.test(dl.suggestedFilename())) throw new Error(dl.suggestedFilename());
});

await step('CSV export of a register downloads', async () => {
  await page.goto(B + '/dashboard/register/r1'); await see('text=CLASS OF DRUG'); await page.waitForTimeout(800);
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 8000 }), page.click('a:has-text("CSV"), a:has-text("Export")')]);
  if (!/\.csv$/.test(dl.suggestedFilename())) throw new Error(dl.suggestedFilename());
});

await step('CD balances list: dated, every open book with its balance and last stock check; Excel', async () => {
  await page.goto(B + '/dashboard/stock-sheet'); await see('text=CD Balances'); await see('text=/Schedule 2/'); await see('th:has-text("Last stock check")');
  await see('text=/Date: \\d{2}\\/\\d{2}\\/\\d{4}/');
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 15000 }), page.click('button:has-text("Excel")')]);
  if (!/^CD-balances-\d{4}-\d{2}-\d{2}\.xlsx$/.test(dl.suggestedFilename())) throw new Error(dl.suggestedFilename());
});

await step('stock count: start date, counts saved with their date, green 0 / red difference, note needed to complete, rows logged in their book, finish', async () => {
  await page.goto(B + '/dashboard/stock-sheet'); await see('text=CD Balances');
  await page.check('text=Stock count (enter counts');
  await click('button:has-text("Start a count")'); await see('text=/Start date: \\d{2}\\/\\d{2}\\/\\d{4}/');
  const inputs = page.locator('input[aria-label^="Stock counted"]');
  // first book: count it as its balance → 0 in green
  const firstBal = Number((await page.locator('tbody tr:nth-child(2) td:nth-child(2)').first().innerText()).match(/\d+/)[0]);
  await inputs.nth(0).fill(String(firstBal)); await inputs.nth(0).press('Enter'); await page.waitForTimeout(700);
  await see('span.bg-green-100:has-text("0")');
  // second book: 2 short → red, completing asks for a note first
  const secondBal = Number((await page.locator('tbody tr:nth-child(3) td:nth-child(2)').first().innerText()).match(/\d+/)[0]);
  await inputs.nth(1).fill(String(secondBal - 2)); await inputs.nth(1).press('Enter'); await page.waitForTimeout(700);
  await see('span.bg-red-100:has-text("-2")');
  await page.locator('input[aria-label^="Complete:"]').nth(1).click(); await see('text=/add a note on what you found/');
  await page.locator('input[aria-label^="Note:"]').fill('2 owed to patient, collecting Friday'); await page.locator('input[aria-label^="Note:"]').press('Enter'); await page.waitForTimeout(700);
  await page.locator('input[aria-label^="Complete:"]').nth(1).click(); await page.waitForTimeout(800);
  await see('text=Logged');
  // saved and modifiable: reload keeps the count; the first book's count can still be changed
  await page.reload(); await page.check('text=Stock count (enter counts'); await page.waitForTimeout(1200);
  if (await page.locator('input[aria-label^="Stock counted"]').nth(0).inputValue() !== String(firstBal)) throw new Error('count not saved');
  page.once('dialog', (d) => d.accept());
  await click('button:has-text("Complete stock count") >> nth=0'); await see('text=/Stock count complete: 2 books logged, 1 with a difference/');
  await see('text=/Started by .* · Finished \\d{2}\\/\\d{2}/');
  await see('text=/Last count finished/');
});

await step('completed stock checks show as lines in their register: balance confirmed correct (green) or the difference with its note (red)', async () => {
  await page.goto(B + '/dashboard'); await page.waitForSelector('a[href^="/dashboard/register/"]');
  const hrefs = [...new Set(await page.locator('a[href^="/dashboard/register/"]').evaluateAll((as) => as.map((a) => a.getAttribute('href'))))];
  let ok = 0, diff = 0, noted = false;
  for (const h of hrefs) {
    await page.goto(B + h); await page.waitForSelector('table.register-table');
    ok += await page.locator('tr[data-stock-check="correct"]:has-text("Balance confirmed correct")').count();
    const d = page.locator('tr[data-stock-check="difference"]');
    diff += await d.count();
    if (await d.filter({ hasText: '2 owed to patient' }).count()) noted = true;
  }
  if (ok < 1 || diff < 1 || !noted) throw new Error(`book lines: ${ok} confirmed, ${diff} differences, note ${noted}`);
});



await step('check one report (any file) against every book: missing lines found in their book and added', async () => {
  await page.goto(B + '/dashboard/report-check'); await see('text=Check a dispensing report');
  await page.setInputFiles('input[type=file]', [{ name: 'report.QRP', mimeType: 'application/octet-stream', buffer: Buffer.from('demo') }, { name: 'page2.jpg', mimeType: 'image/jpeg', buffer: Buffer.from([0xff, 0xd8, 0xff]) }]);
  await see('text=report.QRP'); await see('text=page2.jpg');
  await click('button:has-text("against all books")');
  await see('text=/2 missing entries/'); await see('text=XANAX 500MCG TABS'); await see('text=/books? match the report/');
  await see('text=Maura Grehan'); await see('text=Eamon Tobin');
  await click('button:has-text("Sign & add 2 missing")');
  await see('text=/Added: register line/');
});

await step('public guides: index and every guide load, with their animations and schema', async () => {
  for (const path of ['/guides', '/guides/electronic-cd-register-ireland', '/guides/cd-stock-check-touchstore-mps', '/guides/paper-to-electronic-cd-register']) {
    await page.goto(B + path); await see('h1');
    const ld = await page.locator('script[type="application/ld+json"]').first().textContent();
    if (!ld || !JSON.parse(ld)['@context']) throw new Error('no JSON-LD on ' + path);
  }
  await see('text=Step 1.'); await see('text=The last paper balance becomes the first electronic line');
  await page.goto(B + '/dashboard'); await page.waitForTimeout(800);
});

await step('risk assessment: filled in from the pharmacy, saved, signed with one click, printable', async () => {
  await page.goto(B + '/dashboard/risk-assessment'); await see('text=Not signed yet');
  if (await page.inputValue('input >> nth=0') !== 'Quayside Pharmacy (demo)') throw new Error('pharmacy name not filled in');
  await see('text=from your account');
  await page.locator('textarea').first().fill('PINs never shared. Leavers removed on their last day.');
  await page.waitForTimeout(1200);
  await page.check('text=I’ve reviewed this risk assessment');
  await click('button:has-text("Sign as Aoife Byrne")');
  await see('text=/Signed electronically by Aoife Byrne \\(PSI 12345\\)/'); await see('text=/Signed versions \\(1\\)/');
  await see('button:has-text("Review and update")');
  await page.goto(B + '/dashboard/settings?tab=risk'); await see('text=Open risk assessment');
});

await step('lock and switch user', async () => {
  await click('aside button[aria-label="Lock / switch user"]'); await see('text=/Enter your PIN/i');
  for (const d of '2345') await page.getByRole('button', { name: d, exact: true }).first().click();
  await page.getByRole('button', { name: 'OK', exact: true }).click().catch(() => {});
  await see('text=Ciarán Walsh');
});

// Switch who's at the keyboard (same screen, same pharmacy), as staff do with Lock / switch user
const switchTo = async (pin) => {
  await page.goto(B + '/dashboard'); await page.waitForTimeout(800);
  await click('aside button[aria-label="Lock / switch user"]'); await see('text=/Enter your PIN/i');
  for (const d of pin) await page.getByRole('button', { name: d, exact: true }).first().click();
  await page.getByRole('button', { name: 'OK', exact: true }).click().catch(() => {});
  await page.waitForTimeout(1200);
};

await step('technician drafts an entry (no balance change); a pharmacist signs it in To confirm', async () => {
  await switchTo('4567');
  await page.goto(B + '/dashboard/register/r1'); await see('text=CLASS OF DRUG'); await page.waitForTimeout(800);
  if (await page.locator('button[aria-label^="Correct line"]').count()) throw new Error('technician sees correction buttons');
  const before = await balanceOf();
  await click('button:has-text("Draft entry")'); await see('text=Date of transaction');
  await click('button:has-text("Obtained")');
  await page.fill('input[type=number]', '28');
  await page.locator('input[placeholder*="wholesaler"]').fill('Uniphar');
  await field('Address').fill('Belgard Rd, Dublin 24');
  await field('Invoice / docket no.').fill('Invoice 99777');
  await click('button:has-text("Save for a pharmacist to sign")'); await page.waitForTimeout(1200);
  await page.goto(B + '/dashboard/register/r1'); await see('text=CLASS OF DRUG'); await page.waitForTimeout(800);
  if ((await balanceOf()) !== before) throw new Error('a draft changed the balance');
  await switchTo('1234');
  await page.goto(B + '/dashboard/inbox'); await page.waitForTimeout(1200);
  await see('text=Drafted by the team');
  await page.locator('div.card:has-text("Draft") >> button:has-text("Check & sign")').first().click();
  await click('button:has-text("Sign into register")'); await page.waitForTimeout(1200);
  await page.goto(B + '/dashboard/register/r1'); await see('text=CLASS OF DRUG'); await page.waitForTimeout(800);
  if ((await balanceOf()) !== before + 28) throw new Error('signed draft not in the balance');
});

await step('settings: tabs, and Roles & permissions can switch off drafting for technicians', async () => {
  await page.goto(B + '/dashboard/settings?tab=roles'); await page.waitForTimeout(1000);
  await see('text=/Signing register entries is always for pharmacists/');
  const box = page.getByRole('checkbox', { name: 'Draft register entries: Technician' });
  if (!(await box.isChecked())) throw new Error('technicians should draft by default');
  await box.uncheck(); await click('button:has-text("Save permissions")'); await see('text=/Saved\./');
  await switchTo('4567');
  await page.goto(B + '/dashboard/register/r1'); await see('text=CLASS OF DRUG'); await page.waitForTimeout(800);
  if (await page.locator('button:has-text("Draft entry")').count()) throw new Error('drafting still offered after switching it off');
  await switchTo('1234');
  await page.goto(B + '/dashboard/settings?tab=roles'); await page.waitForTimeout(1000);
  await page.getByRole('checkbox', { name: 'Draft register entries: Technician' }).check(); await click('button:has-text("Save permissions")');
});

await step('a book opened in error is closed in one click (line corrected to 0, book leaves the shelf)', async () => {
  await page.goto(B + '/dashboard'); await page.waitForTimeout(1000);
  await page.locator('input[placeholder^="Find a register"]').fill('Zzdemo opened in error');
  await click('button:has-text("as a new CD book")'); await page.waitForTimeout(600);
  await field('Drug (generic name)').fill('Zzdemo opened in error');
  await page.locator('#form-pick').selectOption('tablet');
  await field('Strength').fill('5mg');
  await field('Balance brought forward').fill('10');
  await click('button:has-text("Open register")'); await page.waitForTimeout(1200);
  await page.goto(B + '/dashboard'); await page.waitForTimeout(1000);
  const book = page.locator('a[href^="/dashboard/register/"]:has-text("Zzdemo")').first();
  await book.click(); await see('text=CLASS OF DRUG'); await page.waitForTimeout(800);
  page.once('dialog', (d) => d.accept('Book opened in error: duplicate of another register'));
  await click('button:has-text("Close book opened in error")'); await page.waitForTimeout(1500);
  await page.goto(B + '/dashboard'); await page.waitForTimeout(1000);
  if (await page.locator('a[href^="/dashboard/register/"]:has-text("Zzdemo")').count()) throw new Error('book still on the shelf');
});

await step('methadone book: OST patients and used doctors offered on click, typing a new one still works', async () => {
  await page.goto(B + '/dashboard/register/r6'); await see('text=CLASS OF DRUG'); await page.waitForTimeout(800);
  await openNewEntry(); await click('button:has-text("Supplied")');
  await page.locator('input[placeholder^="Name, DOB"]').click(); await page.waitForTimeout(800);
  await see('[role=listbox] >> text=Declan Farrell');
  await page.keyboard.press('Escape');
  await page.locator('input[placeholder^="Name, IMC"]').click(); await page.waitForTimeout(800);
  if (!(await page.locator('[role=listbox] button').count())) throw new Error('no doctors offered');
  await page.locator('input[placeholder^="Name, IMC"]').fill('Dr New Doctor'); // typing a new doctor is allowed
  await page.keyboard.press('Escape');
});

await step('new CD book: "MST" is named MST Continus; picking Sevredol from the morphine varieties sets its own form', async () => {
  await page.goto(B + '/dashboard?new=register'); await page.waitForTimeout(1200);
  const dlg = page.getByRole('dialog'), brand = dlg.locator('input[list="all-brands"]');
  await brand.fill('MST'); await brand.blur();
  if ((await brand.inputValue()) !== 'MST Continus') throw new Error(`brand reads ${await brand.inputValue()}`);
  await dlg.getByRole('button', { name: 'Sevredol tablet' }).click();
  if ((await brand.inputValue()) !== 'Sevredol') throw new Error('Sevredol not picked');
  if (!(await dlg.getByRole('button', { name: 'Sevredol tablet' }).getAttribute('aria-pressed'))?.includes('true')) throw new Error('Sevredol not marked');
  await page.keyboard.press('Escape');
});

await step('print menu: whole register, or a date range with the balance brought forward', async () => {
  await page.goto(B + '/dashboard/register/r1'); await page.waitForTimeout(2000);
  await page.evaluate(() => { window.print = () => { window.__printed = (window.__printed || 0) + 1; }; });
  await page.getByRole('button', { name: /^Print/ }).click();
  const inputs = page.locator('input[type=date]');
  const iso = (d) => new Date(Date.now() - d * 864e5).toISOString().slice(0, 10);
  await inputs.nth(0).fill(iso(10)); await inputs.nth(1).fill(iso(3));
  await page.getByRole('button', { name: 'Print range' }).click(); await page.waitForTimeout(300);
  if (!(await page.evaluate(() => window.__printed))) throw new Error('print not started');
  const rows = await page.$$eval('.print-register tbody tr', (t) => t.map((x) => x.textContent));
  if (!/Balance brought forward/.test(rows[0] ?? '')) throw new Error('no balance brought forward line');
});

await step('no page errors during the workflows', async () => { if (page.errors.length) throw new Error(page.errors.slice(0, 3).join(' | ')); });

await step('sign out from the sidebar returns to the home page', async () => {
  const t = await signedInPage({ width: 1366, height: 900 });
  t.once('dialog', (d) => d.accept());
  await t.click('aside button[aria-label="Sign out"]');
  await t.waitForURL((u) => u.pathname === '/', { timeout: 8000 });
  await t.context().close();
});

await browser.close();
console.log(`\n${results.filter((r) => r[0] === 'ok  ').length} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
