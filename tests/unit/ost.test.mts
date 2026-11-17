// OST (methadone / buprenorphine) instalment forms. Made-up patients and numbers only.
import { decideOst, scheduleText, ostRef, isOstRef } from '../../src/lib/ost';
import { OstSchema, toIsoDate, ostQuantity, ostIsEmpty } from '../../src/lib/scan-extract';

let fail = 0;
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fail++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : `: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`}`);
};
const base = {
  serial_no: '9000001', pharmacy_sequence_no: '5', treatment_card_no: 'PH 1234', date_prescribed: '2026-11-20',
  from_date: '2026-11-20', to_date: '2026-11-26', product: 'methadone' as const, drug_written: 'METHADONE DTF 1MG/ML ORAL SOLUTION',
  daily_dose: 60, dose_unit: null, days_at_dose: 7, total_figures: '420', total_words: 'four hundred and twenty',
  instalment_daily: null, instalment_double_sat: null, instalment_days: [] as any[], supervised: true, supervised_daily: null, supervised_days: ['fri'] as any[],
  dispensings: [] as any[],
};
const T = '2026-11-20';

const a = decideOst({ ...base, dispensings: [{ date: T, quantity: 60, quantity_text: '60 (S)', mode: 'supervised', initialled: true }, { date: T, quantity: 360, quantity_text: '360 (TA)', mode: 'take_away', initialled: true }] }, T);
eq('supervised + take-away today make one supply', [a.today.total, a.today.breakdown], [420, '60 supervised + 360 take-away']);
eq('nothing left after a full week dispensed', [a.dispensedSoFar, a.remaining, a.flags.length], [420, 0, 0]);

const b = decideOst({ ...base, total_figures: '440', dispensings: [{ date: T, quantity: 60, quantity_text: '60 (S)', mode: 'supervised', initialled: true }] }, T);
eq('figures and words disagree: flagged; the smaller total is used', [b.flags.some((f) => f.includes('figures (440) and words (420)')), b.total], [true, 420]);
eq('dose × days vs total checked', b.flags.some((f) => f.includes('60 a day × 7 days = 420, but the total says 440')), true);

const c = decideOst({ ...base, dispensings: [{ date: '2026-11-18', quantity: 60, quantity_text: '60 (S)', mode: 'supervised', initialled: true }] }, T);
eq('earlier rows are history; nothing today is flagged', [c.today.total, c.earlier.length, c.flags.some((f) => f.includes('Nothing on this form is dated today'))], [0, 1, true]);

const d = decideOst({ ...base, dispensings: [{ date: T, quantity: 360, quantity_text: '90 + 270 TA', mode: 'take_away', initialled: true }] }, T);
eq('a written sum is one take-away row', [d.today.total, d.today.breakdown], [360, '360 take-away']);

const e = decideOst({ ...base, dispensings: [{ date: '2026-11-19', quantity: 300, quantity_text: '300', mode: null, initialled: true }, { date: T, quantity: 300, quantity_text: '300', mode: null, initialled: true }] }, T);
eq('more dispensed than prescribed is flagged', e.flags.some((f) => f.includes('more than the prescription total')), true);

const f = decideOst({ ...base, drug_written: 'methadone', dispensings: [{ date: T, quantity: 60, quantity_text: '60', mode: null, initialled: true }] }, T);
eq('"methadone" with no form or strength is flagged', f.flags.some((x) => x.includes('form and strength aren’t stated')), true);

const g = decideOst({ ...base, to_date: '2026-11-19', dispensings: [{ date: T, quantity: 60, quantity_text: '60', mode: null, initialled: true }] }, T);
eq('script past its end date is flagged', g.flags.some((x) => x.includes('ended on 19/11/2026')), true);

const h = decideOst({ ...base, dispensings: [{ date: null, quantity: 60, quantity_text: '6?', mode: null, initialled: true }] }, T);
eq('an unreadable row is flagged, never guessed', [h.today.total, h.flags.some((x) => x.includes('couldn’t be read clearly'))], [0, true]);

eq('schedule: days ticked', scheduleText({ ...base, instalment_days: ['wed', 'sat'] }), 'Collect: Wed, Sat · supervised Fri');
eq('schedule: daily, double on Saturday, not supervised', scheduleText({ ...base, instalment_double_sat: true, supervised: false, supervised_days: [] }), 'Collect: Daily, double on Sat · not supervised');
eq('reference helpers', [ostRef('75 82105'), isOstRef('OST 7582105'), isOstRef('Rx 1')], ['OST 7582105', true, false]);

// Models answer in different formats: the form must still be read (made-up values only)
eq('dates: dd/mm/yy, dd-mm-yyyy, spaced boxes, ISO', [toIsoDate('17/11/26'), toIsoDate('3-1-2026'), toIsoDate('17 11 26'), toIsoDate('2026-11-17')], ['2026-11-17', '2026-01-03', '2026-11-17', '2026-11-17']);
eq('quantities: plain, with (S), with T/A, written as a sum', [ostQuantity('100(S)'), ostQuantity('600 (T/A)'), ostQuantity('90 + 270 TA'), ostQuantity(75)], [100, 600, 360, 75]);
const loose = OstSchema.parse({
  serial_no: 9000031, treatment_card_no: 'PH 7001', drug_code: 46115, product: 'Methadone', from_date: '17/11/26', to_date: '23/11/26',
  daily_dose: '100', days_at_dose: '7', total_figures: 700, total_words: 'Seven hundred', supervised: 'Yes', supervised_days: ['Monday', 'xx'],
  dispensings: [{ date: '17/11/26', quantity: '100(S)' }, { date: '17 11 26', quantity: '600(T/A)', initialled: true }, 'junk'],
});
eq('loosely formatted OST form is still read', [loose.serial_no, loose.product, loose.from_date, loose.supervised, loose.supervised_days, loose.dispensings.slice(0, 2).map((d) => [d.date, d.quantity, d.mode])],
  ['9000031', 'methadone', '2026-11-17', true, ['mon'], [['2026-11-17', 100, 'supervised'], ['2026-11-17', 600, 'take_away']]]);
const dec2 = decideOst(loose as any, '2026-11-17');
eq('…and today\'s supervised + take-away make one supply of 700', [dec2.today.total, dec2.remaining], [700, 0]);
eq('an empty OST block is spotted (so it is read again)', [ostIsEmpty(OstSchema.parse({})), ostIsEmpty(loose)], [true, false]);

console.log(fail ? `\n${fail} FAILED` : '\nAll passed');
process.exit(fail ? 1 : 0);
