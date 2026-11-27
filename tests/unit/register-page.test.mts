// Photo of the last paper register page → balance brought forward. Figures from a real page layout,
// no names (the reader never transcribes them).
import { decideOpening, type RegisterPage } from '../../src/lib/register-page';

let fail = 0;
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fail++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : `: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`}`);
};
const page = (balance_transferred: number | null, rows: [string, number | null, number | null, number | null][]): RegisterPage => ({
  is_cd_register_page: true, product_written: 'Oxycodone liquid OxyNorm liquid 1mg/ml', drug_name: 'Oxycodone hydrochloride', brand: 'OxyNorm', strength: '1mg/ml', form: 'oral solution', unit: 'ml', likely_schedule: 2,
  balance_transferred, warnings: [],
  rows: rows.map(([date, obtained, supplied, balance]) => ({ date, date_written: date, obtained, supplied, balance, balance_unclear: false })),
});
const past = (d: number) => new Date(Date.now() - d * 864e5).toISOString().slice(0, 10);

// OxyNorm liquid page: 1603 transferred, supplies down to 1168; the last 30 drifted into the Obtained column
const oxy = page(1603, [
  [past(30), null, 50, 1553], [past(29), null, 50, 1503], [past(28), null, 60, 1443], [past(27), null, 30, 1413],
  [past(26), null, 100, 1313], [past(25), null, 50, 1263], [past(10), null, 45, 1218], [past(4), null, 20, 1198],
  [past(3), 30, null, 1168],
]);
const d = decideOpening(oxy);
eq('takes the bottom line, not the balance transferred', d.balance, 1168);
eq('book and sum agree once the misplaced 30 is read as supplied', d.source, 'written_and_sum_agree');
eq('not blocked', d.blocking, false);
eq('says the 30 was read as supplied', d.flags.some((f) => /30 looks like it’s in the Obtained column/.test(f)), true);
eq('date of the bottom line', d.date, past(3));

// Only the balance transferred was read (sideways photo, no rows): never offered as the answer
const top = decideOpening(page(1603, []));
eq('top figure alone is not the balance', top.balance, null);
eq('top figure alone blocks', top.blocking, true);
eq('explains only the top was read', /Only the balance brought forward at the top of the page \(1603\)/.test(top.label), true);

// A genuine receipt (balance goes up) is left as obtained
const rec = decideOpening(page(100, [[past(2), 500, null, 600], [past(1), null, 50, 550]]));
eq('receipt kept, sum agrees', [rec.balance, rec.source, rec.flags.some((f) => /looks like/.test(f))], [550, 'written_and_sum_agree', false]);

// Book and sum disagree: both offered, pharmacist chooses
const bad = decideOpening(page(100, [[past(2), null, 20, 80], [past(1), null, 10, 75]]));
eq('disagreement offers both', [bad.balance, bad.options, bad.blocking], [null, [75, 70], true]);

if (fail) { console.log(`${fail} failed`); process.exit(1); }
