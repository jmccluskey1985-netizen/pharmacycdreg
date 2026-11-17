// Roles & permissions: defaults, a pharmacy's own choices, and the fixed rules.
import { permits, cleanOverrides, isConfigurable } from '../../src/lib/permissions';

let fail = 0;
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fail++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : `: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`}`);
};

eq('defaults: technicians draft, scan, check stock, manage patients; not open books or see audit',
  ['draftEntries', 'scan', 'stockCheck', 'patients', 'openRegister', 'viewAudit'].map((p) => permits('technician', p as any)), [true, true, true, true, false, false]);
eq('pharmacists sign directly, so never "draft"', [permits('pharmacist', 'draftEntries'), permits('locum_pharmacist', 'draftEntries')], [false, false]);
eq('leads can always do everything, whatever is saved', permits('supervising_pharmacist', 'openRegister', { supervising_pharmacist: { openRegister: false } } as any), true);
eq('read-only can only view', [permits('read_only', 'scan'), permits('read_only', 'viewAudit')], [false, true]);
eq('a pharmacy can switch drafting off for technicians', permits('technician', 'draftEntries', { technician: { draftEntries: false } }), false);
eq('…and let locums open books', permits('locum_pharmacist', 'openRegister', { locum_pharmacist: { openRegister: true } }), true);
eq('fixed boxes can’t be changed', [isConfigurable('supervising_pharmacist', 'scan'), isConfigurable('pharmacist', 'draftEntries'), isConfigurable('technician', 'reminders')], [false, false, true]);
eq('saved choices are cleaned: no lead or unknown keys, no fixed boxes',
  cleanOverrides({ superintendent_pharmacist: { scan: false }, technician: { draftEntries: false, bogus: true, viewAudit: 'yes' }, pharmacist: { draftEntries: true, openRegister: false } }),
  { pharmacist: { openRegister: false }, technician: { draftEntries: false } });

console.log(fail ? `\n${fail} FAILED` : '\nAll passed');
if (fail) process.exit(1);
