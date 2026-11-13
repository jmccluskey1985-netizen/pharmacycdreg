// Unit checks for pure rules (no database): run with `npm run test:unit`.
import { addPeriod, advance } from '../../src/lib/reminders';
import { isLate, irishToday } from '../../src/lib/late-entry';
import { STOCK_EFFECT } from '../../src/lib/entry-schema';

let fail = 0;
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fail++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : ` — got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`}`);
};

// Dispensing reminders
eq('weekly', addPeriod('2026-11-13', 'weekly'), '2026-11-20');
eq('fortnightly', addPeriod('2026-11-13', 'fortnightly'), '2026-11-27');
eq('four-weekly', addPeriod('2026-11-13', 'four_weekly'), '2026-12-11');
eq('monthly clamps to month end', addPeriod('2026-01-31', 'monthly'), '2026-02-28');
eq('custom every 3 days', addPeriod('2026-11-13', 'custom', 3), '2026-11-16');
eq('overdue weekly jumps past today', advance('2026-11-01', 'weekly', null, '2026-11-13'), '2026-11-15');
eq('daily recorded today → tomorrow', advance('2026-11-13', 'daily', null, '2026-11-13'), '2026-11-14');

// Late entries: today and yesterday are on time; older needs a reason
eq('today not late', isLate('2026-11-13', '2026-11-13'), false);
eq('yesterday not late', isLate('2026-11-12', '2026-11-13'), false);
eq('two days ago is late', isLate('2026-11-11', '2026-11-13'), true);
eq('across a month boundary', isLate('2026-02-27', '2026-03-01'), true);
eq('irishToday format', /^\d{4}-\d{2}-\d{2}$/.test(irishToday()), true);

// Stock effect of each entry type
eq('receipt adds', STOCK_EFFECT.receipt, 1);
eq('supply removes', STOCK_EFFECT.supply, -1);
eq('destruction removes', STOCK_EFFECT.destruction, -1);
eq('adjustment in adds', STOCK_EFFECT.adjustment_in, 1);
eq('adjustment out removes', STOCK_EFFECT.adjustment_out, -1);
eq('patient return is not stock', STOCK_EFFECT.patient_return, 0);

console.log(fail ? `\n${fail} FAILED` : '\nAll passed');
process.exit(fail ? 1 : 0);
