// The user's OxyNorm 5mg paper page (dates + amounts only), as a reader would return it.
import { decideOpening, type RegisterPage } from '../src/lib/register-page';
const r = (date: string, obtained: number | null, supplied: number | null, balance: number | null, balance_unclear = false) => ({ date, date_written: date.split('-').reverse().join('/'), obtained, supplied, balance, balance_unclear });
const page = (last: number, unclear: boolean): RegisterPage => ({
  is_cd_register_page: true, product_written: 'OXYCODONE OXYNORM 5mg', drug_name: 'Oxycodone hydrochloride', brand: 'OxyNorm', strength: '5mg', form: 'capsule', unit: 'capsules', likely_schedule: 2,
  balance_transferred: 518, warnings: [],
  rows: [
    r('2026-11-09', null, 10, 508), r('2026-11-09', null, 8, 500), r('2026-11-09', 112, null, 612),
    r('2026-11-10', null, 12, 600), r('2026-11-10', null, 12, 588), r('2026-11-10', null, 18, 570),
    r('2026-11-11', null, 20, 550), r('2026-11-11', null, 12, 538), r('2026-11-11', null, 12, 526),
    r('2026-11-11', null, 20, 506), r('2026-11-12', null, 10, 496), r('2026-11-12', null, 18, last, unclear),
  ],
});
for (const [name, p] of [['Last balance read clearly as 478', page(478, false)], ['Last balance misread as 678', page(678, true)]] as const) {
  const d = decideOpening(p);
  console.log(`\n${name}\n  → ${d.label}  | date ${d.date} | blocking ${d.blocking} | options ${d.options}`);
  d.flags.forEach((f) => console.log('  ⚠', f));
}
