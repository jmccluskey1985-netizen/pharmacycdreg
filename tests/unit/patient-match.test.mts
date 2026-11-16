// Patient matching (docs/PATIENT_MATCHING.md §10). Made-up people only.
import { matchPatients, preselect, nameKey, extractEircode, editDistance } from '../../src/lib/patient-match';

let fail = 0;
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fail++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : `: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`}`);
};

const P = (id: string, first: string, sur: string, extra: Record<string, unknown> = {}) => ({ id, first_name: first, surname: sur, date_of_birth: null, address: null, ...extra });
const pool = [
  P('obrien', 'Mary', 'OBrien', { date_of_birth: '1950-03-12', address: '3 Church Road, Ennis, V95 X2Y3' }),
  P('murphy', 'Sean', 'Murphy', { gms_number: '7654321C' }),
  P('kelly', 'Mary', 'Kelly', { date_of_birth: '1948-07-01', gms_number: '1234567B', address: '14 Main Street, Ennis' }),
  P('wilson', 'Peter', 'Wilson', { date_of_birth: '1961-11-30' }),
  P('byrne', 'Katherine', 'Byrne', { date_of_birth: '1972-05-20' }),
  P('swap', 'Ann', 'Doyle', { date_of_birth: '1950-04-03' }),
  P('jsmith', 'John', 'Smith', { address: '8 Mill Lane, Kilrush' }),
];
const top = (probe: any, p = pool) => { const c = matchPatients(probe, p); return c[0] ? [c[0].patient.id, c[0].level] : null; };
const find = (probe: any, id: string, p = pool) => matchPatients(probe, p).find((c) => c.patient.id === id);

// Normalisers
eq('O\'Brien / O Brien / OBrien share a key', [nameKey("O'Brien"), nameKey('O Brien'), nameKey('OBrien')], ['obrien', 'obrien', 'obrien']);
eq('Mc Guinness and McGuinness share a key', nameKey('Mc Guinness'), nameKey('McGuinness'));
eq('accents dropped', nameKey('Ní Bhriain'), 'nibhriain');
eq('eircode pulled out of an address', extractEircode('14 Main St, Ennis, v95 x2y3'), 'V95X2Y3');
eq('one-letter misread is distance 1', editDistance('kely', 'kelly'), 1);

// Spec table
eq('O\'BRIEN, MARY, same DOB → certain', top({ full_name: "O'BRIEN, MARY", dob: '1950-03-12' }), ['obrien', 'certain']);
eq('Mary Anne O Brien, same eircode → strong', top({ full_name: 'Mary Anne O Brien', address: 'Church Rd, Ennis V95X2Y3' }), ['obrien', 'strong']);
eq('Seán Murphy vs Sean Murphy, same GMS → certain', top({ full_name: 'Seán Murphy', gms: '7654321 C' }), ['murphy', 'certain']);
eq('Mary Kely, same DOB and GMS → strong', top({ full_name: 'Mary Kely', dob: '1948-07-01', gms: '1234567B' }), ['kelly', 'strong']);
eq('Mary Kely, same DOB only → possible', top({ full_name: 'Mary Kely', dob: '1948-07-01' }), ['kelly', 'possible']);
const diffDob = find({ full_name: 'Mary Kelly', dob: '1960-01-01' }, 'kelly');
eq('Mary Kelly, different DOB → possible with conflict', [diffDob?.level, diffDob?.conflicts.includes('Different DOB')], ['possible', true]);
const family = find({ full_name: 'Mary Kelly', gms: '1234567A' }, 'kelly');
eq('Mary Kelly, GMS letter differs → possible, family member', [family?.level, family?.conflicts[0]], ['possible', 'Same medical card household, different person']);
eq('WILSON PETER (no comma), same DOB → certain', top({ full_name: 'WILSON PETER', dob: '1961-11-30' }), ['wilson', 'certain']);
eq('Kate Byrne vs Katherine, same DOB → strong', top({ full_name: 'Kate Byrne', dob: '1972-05-20' }), ['byrne', 'strong']);
eq('Kate Byrne vs Katherine, nothing else → possible', top({ full_name: 'Kate Byrne' }), ['byrne', 'possible']);
const sw = find({ full_name: 'Ann Doyle', dob: '1950-03-04' }, 'swap');
eq('DOB day/month swapped → possible', [sw?.level, sw?.conflicts.includes('Day and month of DOB swapped')], ['possible', true]);
const twins = [P('k1', 'Mary', 'Kelly', { date_of_birth: '1948-07-01' }), P('k2', 'Mary', 'Kelly', { date_of_birth: '1948-07-01' })];
const t = matchPatients({ full_name: 'Mary Kelly', dob: '1948-07-01' }, twins);
eq('two existing Mary Kellys, same DOB → both listed, none preselected', [t.length, preselect(t).pick, preselect(t).ambiguous], [2, null, true]);
eq('John vs Jane Smith, same address → possible', top({ full_name: 'Jane Smith', address: '8 Mill Lane, Kilrush' }), ['jsmith', 'possible']);
eq('nobody close → no candidates', matchPatients({ full_name: 'Zebedee Quinlan', dob: '1990-01-01' }, pool).length, 0);
eq('single certain match is preselected', preselect(matchPatients({ full_name: 'Peter Wilson', dob: '1961-11-30' }, pool)).pick?.patient.id, 'wilson');

// OST treatment card (methadone patients): issued to one person
const ostPool = [P('ost1', 'Declan', 'Farrell', { treatment_card_no: 'PH 4417', address: '12 Abbey Court, Ennis' }), P('ost2', 'Declan', 'Farrelly', { treatment_card_no: 'PH 5520' })];
eq('treatment card + one-letter misspelling → certain', top({ full_name: 'Declan Farell', card: 'PH4417' }, ostPool), ['ost1', 'certain']);
const otherCard = matchPatients({ full_name: 'Declan Farrell', card: 'PH 9999' }, ostPool).find((c) => c.patient.id === 'ost1');
eq('same name, different treatment card → conflict, not certain', [otherCard?.level, otherCard?.conflicts.includes('Different treatment card')], ['possible', true]);

const pmrPool = [P('f12', 'Declan', 'Farrell', { pmr_code: 'F12' })];
eq('dispensing system code from a bag label + similar name → certain', top({ full_name: 'Declan Farell', pmr: 'f 12' }, pmrPool), ['f12', 'certain']);

// Record-to-record (Possible duplicates): no full_name, first name and surname given separately
const recDup = matchPatients({ first_name: 'Mary', surname: "O'Brien", dob: '1950-03-12' }, pool);
eq('record with split names matches its duplicate', [recDup[0]?.patient.id, recDup[0]?.level], ['obrien', 'certain']);
// splitName keeps Irish surname prefixes together
const { splitName } = await import('../../src/lib/patients');
eq('splitName: Mary Anne O Brien', splitName('Mary Anne O Brien'), { first_name: 'Mary Anne', surname: 'O Brien' });
eq('splitName: KELLY, MARY', splitName('KELLY, MARY'), { first_name: 'MARY', surname: 'KELLY' });
eq('splitName: Sean Mc Guinness', splitName('Sean Mc Guinness'), { first_name: 'Sean', surname: 'Mc Guinness' });

console.log(fail ? `\n${fail} FAILED` : '\nAll passed');
process.exit(fail ? 1 : 0);
