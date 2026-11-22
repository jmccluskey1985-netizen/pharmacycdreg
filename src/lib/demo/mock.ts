/**
 * Demo mode (NEXT_PUBLIC_DEMO_MODE=1): a sample pharmacy that runs entirely in the
 * browser. window.fetch for /api/* is answered from in-memory state (kept in
 * sessionStorage), so every screen is clickable with no database. Nothing is saved
 * anywhere else. Same rules as the real system: append-only, corrections as new
 * rows, balance can't go negative, role checks.
 */
'use client';
import { decideQuantity } from '@/lib/quantity';
import { productTitle } from '@/lib/product-name';
import { STOCK_EFFECT } from '@/lib/entry-schema';
import { advance } from '@/lib/reminders';
import { isLate } from '@/lib/late-entry';
import { reconcile, dateOptions, type ReportRow } from '@/lib/report-reconcile';
import { findDuplicate } from '@/lib/duplicates';
import { can as rolesCan, type StaffRole } from '@/lib/roles';
import { permits, cleanOverrides } from '@/lib/permissions';
import { matchPatients as matchP, preselect, patientKeys, type MatchPatient } from '@/lib/patient-match';
const matchPatients = (probe: Parameters<typeof matchP>[0], pool: Json[], limit?: number) => matchP(probe, pool as unknown as (MatchPatient & Json)[], limit);
import { genericKey, sameStrength, registerExemption } from '@/lib/cd-catalogue';

type Json = Record<string, any>;
const today = () => new Date().toISOString().slice(0, 10);
const daysAgo = (n: number) => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10);
const uid = () => (crypto as any).randomUUID?.() ?? Math.random().toString(36).slice(2);

const STAFF = [
  { id: 's1', full_name: 'Aoife Byrne', role: 'supervising_pharmacist', psi_number: '12345', pin: '1234', is_active: true, access_expires_at: null, created_at: daysAgo(40) },
  { id: 's2', full_name: 'Ciarán Walsh', role: 'pharmacist', psi_number: '23456', pin: '2345', is_active: true, access_expires_at: null, created_at: daysAgo(40) },
  { id: 's3', full_name: 'Niamh Doyle', role: 'locum_pharmacist', psi_number: '34567', pin: '3456', is_active: true, access_expires_at: new Date(Date.now() + 14 * 864e5).toISOString(), created_at: daysAgo(5) },
  { id: 's4', full_name: 'Seán Murphy', role: 'technician', psi_number: null, pin: '4567', is_active: true, access_expires_at: null, created_at: daysAgo(30) },
];

const P = (id: string, drug_name: string, class_name: string, form: string, strength: string, unit: string, extra: Json = {}) => ({ id, drug_name, class_name, schedule: 2, schedule_paragraph: 'para 1', form, strength, unit, is_stereoisomer_of: null, parent: null, ...extra });
const PRODUCTS = [
  P('p1', 'Oxycodone hydrochloride', 'Oxycodone', 'capsule', '5mg', 'capsules', { brand: 'OxyNorm' }),
  P('p2', 'Oxycodone hydrochloride', 'Oxycodone', 'prolonged-release tablet', '10mg', 'tablets', { brand: 'OxyContin' }),
  P('p3', 'Morphine sulfate', 'Morphine', 'prolonged-release tablet', '10mg', 'tablets', { brand: 'MST Continus' }),
  P('p4', 'Fentanyl', 'Fentanyl', 'transdermal patch', '25mcg/hr', 'patches', { brand: 'Durogesic' }),
  P('p5', 'Methylphenidate hydrochloride', 'Methylphenidate', 'prolonged-release tablet', '18mg', 'tablets', { brand: 'Concerta XL' }),
  P('p6', 'Methadone hydrochloride', 'Methadone', 'oral solution', '1mg/ml', 'ml', { brand: 'Methadone DTF' }),
];

function seedEntries() {
  const base = { supplier_name: null, supplier_address: null, recipient_name: null, recipient_address: null, prescriber_name: null, prescriber_address: null, authority_to_possess: null, prescription_ref: null, collected_by: null, collector_id_checked: null, witness_name: null, witness_role: null, destruction_method: null, corrects_entry_id: null, correction_reason: null, notes: null, source: 'manual', scan_id: null };
  const out: Json[] = [];
  const add = (register_id: string, entry_type: string, d: number, quantity: number, staff: string, f: Json = {}) => {
    const seq = out.filter((e) => e.register_id === register_id).length + 1;
    out.push({ ...base, id: uid(), register_id, seq, entry_type, transaction_date: daysAgo(d), recorded_at: new Date(Date.now() - d * 864e5 + 3600e3 * 10).toISOString(), quantity: String(quantity), recorded_by_staff_id: staff, recorded_by_auth_user: 'demo', ...f });
    return out[out.length - 1];
  };
  const UD = { supplier_name: 'United Drug', supplier_address: 'Magna Business Park, Citywest, Dublin 24' };
  const UN = { supplier_name: 'Uniphar Wholesale', supplier_address: 'Fourth Avenue, Cookstown, Dublin 24' };
  const BF = (n: string) => ({ supplier_name: 'Balance brought forward', supplier_address: n, notes: 'Opening balance' });
  // Methadone DTF 1mg/ml (OST)
  add('r6', 'receipt', 20, 5000, 's1', BF('Paper register vol. 2, page 3'));
  add('r6', 'supply', 2, 420, 's2', { recipient_name: 'Gerard Lynch', recipient_address: '5 Mill Rd, Ennis', prescriber_name: 'Dr K. Ryan', authority_to_possess: 'Prescription: Dr K. Ryan', prescription_ref: 'OST 9000017', notes: 'OST instalment: 60 supervised + 360 take-away' });
  // Oxycodone 5mg caps
  add('r1', 'receipt', 20, 56, 's1', BF('Paper register vol. 3, page 99'));
  add('r1', 'receipt', 12, 112, 's1', { ...UD, notes: 'Invoice 4471902', source: 'scan' });
  add('r1', 'supply', 11, 28, 's2', { recipient_name: 'Mary Kelly', recipient_address: '14 Main St, Ennis, Co. Clare', prescriber_name: 'Dr A. Walsh', authority_to_possess: 'Prescription: Dr A. Walsh (Reg 012345)', prescription_ref: 'GMS 88213', collected_by: 'Patient', collector_id_checked: true });
  const wrong = add('r1', 'supply', 9, 56, 's2', { recipient_name: 'John Murphy', recipient_address: '3 Church Rd, Ennis, Co. Clare', prescriber_name: 'Dr K. Ryan', authority_to_possess: 'Prescription: Dr K. Ryan', prescription_ref: 'Rx 10233' });
  add('r1', 'correction', 9, 28, 's1', { corrects_entry_id: wrong.id, correction_reason: 'Entered 56 in error; 28 capsules dispensed (2 x 14)', recipient_name: 'John Murphy', recipient_address: '3 Church Rd, Ennis, Co. Clare', prescriber_name: 'Dr K. Ryan', authority_to_possess: 'Prescription: Dr K. Ryan', prescription_ref: 'Rx 10233' });
  add('r1', 'supply', 6, 14, 's1', { recipient_name: 'Patrick Hayes', recipient_address: '22 Abbey St, Ennis, Co. Clare', prescriber_name: 'Dr A. Walsh', authority_to_possess: 'Prescription: Dr A. Walsh (Reg 012345)', prescription_ref: 'GMS 88252', collected_by: 'Representative', collector_id_checked: true });
  add('r1', 'patient_return', 5, 10, 's2', { recipient_name: 'Mary Kelly', recipient_address: '14 Main St, Ennis, Co. Clare' });
  add('r1', 'supply', 2, 28, 's3', { recipient_name: "Seán O'Brien", recipient_address: '7 Quay St, Galway', prescriber_name: 'Dr L. Nolan', authority_to_possess: 'Prescription: Dr L. Nolan', prescription_ref: 'Rx 10261', source: 'pmr', notes: 'Halo HALO-8812-1' });
  // Oxycodone 10mg PR
  add('r2', 'receipt', 20, 140, 's1', BF('Paper register vol. 3, page 101'));
  add('r2', 'supply', 8, 56, 's2', { recipient_name: 'Patrick Hayes', recipient_address: '22 Abbey St, Ennis', prescriber_name: 'Dr A. Walsh', authority_to_possess: 'Prescription: Dr A. Walsh', prescription_ref: 'GMS 88240' });
  // A late entry: supplied 6 days ago during an outage, entered from the paper fallback sheet 2 days later
  add('r2', 'supply', 6, 28, 's2', { recipient_name: 'Bridget Lynch', recipient_address: '9 Mill Rd, Ennis', prescriber_name: 'Dr K. Ryan', authority_to_possess: 'Prescription: Dr K. Ryan', prescription_ref: 'Rx 10249', notes: 'Late entry: internet down on the day; entered from the paper fallback sheet' }).recorded_at = new Date(Date.now() - 4 * 864e5).toISOString();
  // MST Continus 10mg
  add('r3', 'receipt', 20, 60, 's1', BF('Paper register vol. 2, page 40'));
  add('r3', 'receipt', 7, 60, 's1', { ...UN, notes: 'Invoice UW-22918' });
  add('r3', 'supply', 3, 56, 's2', { recipient_name: 'Bridget Lynch', recipient_address: '9 Mill Rd, Ennis', prescriber_name: 'Dr K. Ryan', authority_to_possess: 'Prescription: Dr K. Ryan', prescription_ref: 'Rx 10250' });
  // Fentanyl patches
  add('r4', 'receipt', 20, 15, 's1', BF('Paper register vol. 3, page 120'));
  add('r4', 'supply', 4, 5, 's2', { recipient_name: 'Thomas Burke', recipient_address: 'Ard Na Gréine, Ennis', prescriber_name: 'Dr L. Nolan', authority_to_possess: 'Prescription: Dr L. Nolan', prescription_ref: 'Rx 10255' });
  // Methylphenidate
  add('r5', 'receipt', 20, 60, 's1', BF('Paper register vol. 1, page 12'));
  return out;
}

const DRAFTS = (): Json[] => ((S as any).drafts ||= []);
function seed() {
  return {
    pharmacy: { id: 'demo', name: 'Quayside Pharmacy (demo)', address: '1 Quay St, Ennis, Co. Clare', psi_premises_number: '1234', subscription_status: 'trialing', trial_ends_at: new Date(Date.now() + 21 * 864e5).toISOString(), current_period_end: new Date(Date.now() + 21 * 864e5).toISOString(), cancel_at_period_end: false, halo_enabled: true },
    staff: STAFF,
    products: PRODUCTS,
    registers: PRODUCTS.map((p, i) => ({ id: `r${i + 1}`, product_id: p.id, opened_at: daysAgo(20), closed_at: null })),
    entries: seedEntries() as Json[],
    audit: [] as Json[],
    inbox: [
      { id: 'i1', action: 'dispense', status: 'pending', problem: null, received_at: new Date(Date.now() - 20 * 60e3).toISOString(), register_id: 'r3', payload: { external_id: 'HALO-8840-2', dispensed_at: new Date(Date.now() - 22 * 60e3).toISOString(), drug: { name: 'Morphine sulfate', strength: '10mg', form: 'prolonged-release tablet', brand: 'MST Continus' }, quantity: 28, unit: 'tablets', patient: { name: 'Margaret Cleary', address: '4 Station Rd, Ennis' }, prescriber: { name: 'Dr A. Walsh', registration: '012345' }, prescription_ref: 'GMS 88301', pharmacist: { psi_number: '23456', name: 'Ciarán Walsh' } } },
      { id: 'i2', action: 'dispense', status: 'pending', problem: 'Quantity was sent as 1 OP, not units. Enter the number of tablets/ml/patches', received_at: new Date(Date.now() - 5 * 60e3).toISOString(), register_id: 'r4', payload: { external_id: 'HALO-8842-1', dispensed_at: new Date(Date.now() - 6 * 60e3).toISOString(), drug: { name: 'Fentanyl', strength: '25mcg/hr', form: 'transdermal patch', brand: 'Matrifen' }, quantity: 1, unit: 'OP', patient: { name: 'Thomas Burke', address: 'Ard Na Gréine, Ennis' }, prescriber: { name: 'Dr L. Nolan' }, prescription_ref: 'Rx 10290', pharmacist: { psi_number: '23456', name: 'Ciarán Walsh' } } },
    ],
    keys: [{ id: 'k1', name: 'Halo – dispensary PC', key_prefix: 'cdr_live_Xq3vA9', auto_post: false, created_at: daysAgo(3), last_used_at: new Date(Date.now() - 5 * 60e3).toISOString() as string | null, revoked_at: null as string | null }],
    contacts: [
      { id: 'c1', kind: 'prescriber', name: 'Dr A. Walsh', address: 'Ennis Medical Centre, Ennis, Co. Clare', registration: '012345', gms_number: 'G0001', role: null },
      { id: 'c2', kind: 'prescriber', name: 'Dr K. Ryan', address: 'Abbey Street Surgery, Ennis, Co. Clare', registration: '023456', gms_number: 'G0002', role: null },
      { id: 'c3', kind: 'prescriber', name: 'Dr L. Nolan', address: 'Quay Street Clinic, Galway', registration: '034567', gms_number: null, role: null },
      { id: 'c4', kind: 'supplier', name: 'United Drug', address: 'Magna Business Park, Citywest, Dublin 24', registration: null, gms_number: null, role: null },
      { id: 'c5', kind: 'supplier', name: 'Uniphar Wholesale', address: 'Fourth Avenue, Cookstown, Dublin 24', registration: null, gms_number: null, role: null },
      { id: 'c6', kind: 'witness', name: 'P. Doyle', address: null, registration: null, gms_number: null, role: 'Authorised officer (PSI)' },
    ] as Json[],
    activeStaffId: null as string | null,
  };
}
type State = ReturnType<typeof seed>;

const KEY = 'cdreg-demo-v5';
let S: State;
function load(): State {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return seed();
}
// Training mode keeps everything in memory only (no sessionStorage): a refresh clears it.
let TRAINING = false;
const save = () => { if (TRAINING) return; try { sessionStorage.setItem(KEY, JSON.stringify(S)); } catch {} };
export function resetDemo() { S = seed(); save(); }

const res = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const fail = (status: number, error: string, code?: string) => res({ error, code }, status);
const me = () => S.staff.find((s) => s.id === S.activeStaffId) ?? null;
const can = {
  record: (r: string) => rolesCan.record(r as StaffRole),
  open: (r: string) => rolesCan.openRegister(r as StaffRole),
  manage: (r: string) => rolesCan.manageStaff(r as StaffRole),
  audit: (r: string) => rolesCan.viewAudit(r as StaffRole),
  scan: (r: string) => r !== 'read_only',
};
function audit(action: string, details: Json = {}) {
  const st = me();
  S.audit.unshift({ id: S.audit.length + 1, occurred_at: new Date().toISOString(), action, staff_id: st?.id ?? null, staff_name: st?.full_name ?? null, details });
}
const productOf = (regId: string) => {
  const r = S.registers.find((x) => x.id === regId)!;
  const p: any = S.products.find((x) => x.id === r.product_id)!;
  const parent = p.is_stereoisomer_of ? S.products.find((x) => x.id === p.is_stereoisomer_of) : null;
  return { ...p, parent: parent ? { drug_name: parent.drug_name } : null };
};

/** Same maths as the cd_ledger view: latest correction wins; patient returns don't move stock. */
function ledger(regId: string): Json[] {
  const rows = S.entries.filter((e) => e.register_id === regId).sort((a, b) => a.seq - b.seq);
  let bal = 0;
  return rows.filter((e) => e.entry_type !== 'correction').map((o) => {
    const corrs = rows.filter((c) => c.corrects_entry_id === o.id);
    const c = corrs[corrs.length - 1];
    const eff = c ? { ...o, ...Object.fromEntries(Object.entries(c).filter(([k, v]) => v !== null && !['id', 'seq', 'entry_type', 'recorded_at', 'recorded_by_staff_id', 'corrects_entry_id', 'correction_reason', 'source'].includes(k))) } : o;
    const effect = (STOCK_EFFECT[o.entry_type] ?? 0);
    bal += effect * Number(eff.quantity);
    return { ...eff, correction_count: corrs.length, correction_reason: c?.correction_reason ?? null, running_balance: String(bal) };
  });
}
const balance = (regId: string) => { const l = ledger(regId); return l.length ? Number(l[l.length - 1].running_balance) : 0; };

const demoPatients = (): Json[] => {
  const X: any = S;
  if (!X.patients) {
    X.patients = [];
    const seen = new Set<string>();
    for (const e of [...S.entries].sort((a, b) => b.recorded_at.localeCompare(a.recorded_at))) {
      if (e.entry_type !== 'supply' || !e.recipient_name || seen.has(e.recipient_name.toLowerCase())) continue;
      seen.add(e.recipient_name.toLowerCase());
      const t = e.recipient_name.trim(); const i = t.lastIndexOf(' ');
      X.patients.push({ id: uid(), first_name: i < 0 ? t : t.slice(0, i), surname: i < 0 ? '' : t.slice(i + 1), date_of_birth: null, address: e.recipient_address ?? null, phone: null, gms_number: null, ihi_number: null, gp_name: e.prescriber_name ?? null, gp_address: e.prescriber_address ?? null, notes: null, is_active: true });
    }
    // Made-up identifiers so patient matching has something to show
    const mk = X.patients.find((p: Json) => p.first_name === 'Mary' && p.surname === 'Kelly');
    if (mk) Object.assign(mk, { date_of_birth: '1948-07-01', gms_number: '1234567B' });
    // A duplicate made by a different spelling of the address, for Possible duplicates
    X.patients.push({ id: uid(), first_name: 'Patrick', surname: 'Hayes', date_of_birth: null, address: '22 Abbey Street, Ennis', phone: null, gms_number: null, ihi_number: null, gp_name: null, gp_address: null, notes: null, is_active: true });
    // Opioid substitution patients (made up): one from the register, one only on the OST list
    const gl = X.patients.find((p: Json) => p.first_name === 'Gerard' && p.surname === 'Lynch');
    if (gl) Object.assign(gl, { is_ost: true, treatment_card_no: 'PH5121', ost_register_id: 'r6', ost_daily_dose: 60, ost_schedule: 'Fri · supervised Fri' });
    X.patients.push({ id: uid(), first_name: 'Declan', surname: 'Farrell', date_of_birth: null, address: '12 Abbey Court, Ennis', phone: null, gms_number: null, ihi_number: null, gp_name: 'Dr K. Ryan', gp_address: null, notes: null, is_active: true, is_ost: true, treatment_card_no: 'PH4417', ost_register_id: 'r6', ost_daily_dose: 75, ost_schedule: 'Wed, Sat · supervised Wed' });
    for (const p of X.patients) Object.assign(p, patientKeys(p));
  }
  return X.patients.filter((p: Json) => p.is_active !== false);
};
const patientMatch = (p: Json, q: string) => {
  const t = q.trim().toLowerCase(); if (!t) return true;
  const m = t.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  if (m) return p.date_of_birth === `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  if (/^\d{4,}/.test(t)) return (p.gms_number || '').startsWith(t);
  return t.split(/\s+/).every((w) => `${p.first_name} ${p.surname}`.toLowerCase().includes(w));
};
const Q = (): Json[] => ((S as any).quarantine ||= []);
const NOTES = (): Json[] => ((S as any).notes ||= []);
const FB = (): Json[] => ((S as any).feedback ||= [
  { id: 'fb1', kind: 'idea', message: 'Text the patient when their weekly supply is ready', status: 'planned', reply: 'Planned for spring.', shared: true, shared_title: 'Text patients when a supply is ready', votes: 7, voted: false, created_at: new Date().toISOString(), staff_name: 'Demo' },
  { id: 'fb2', kind: 'idea', message: 'Print a monthly balance summary for all registers', status: 'new', reply: null, shared: true, shared_title: 'Monthly balance summary for all registers', votes: 4, voted: false, created_at: new Date().toISOString(), staff_name: 'Demo' },
]);
// A sample weekly reminder, due today, built from the first patient supply in the demo registers.
const REM = (): Json[] => {
  const X = S as any;
  if (!X.reminders) {
    X.reminders = [];
    const e = [...S.entries].reverse().find((x) => x.entry_type === 'supply' && x.recipient_name);
    if (e) X.reminders.push({ id: 'rem1', title: `${e.recipient_name}: weekly`, frequency: 'weekly', interval_days: null, next_due: today(), notes: null, active: true, last_done_on: null, last_done_by_name: null,
      lines: [{ register_id: e.register_id, quantity: Number(e.quantity), recipient_name: e.recipient_name, recipient_address: e.recipient_address, prescriber_name: e.prescriber_name ?? null, prescriber_address: e.prescriber_address ?? null, authority_to_possess: null, patient_id: null }] });
  }
  return X.reminders;
};
const BOOK = (): Json[] => ((S as any).destructionBook ||= []);
const qFor = (regId: string) => Q().filter((i) => i.register_id === regId && i.status === 'awaiting').reduce((n, i) => n + Number(i.quantity), 0);
const lastCheck = (id: string) => ((((S as any).checks || []) as Json[]).filter((c) => c.register_id === id).map((c) => c.checked_at).sort().pop() ?? null);
const regList = () => S.registers.filter((r) => !r.closed_at).map((r) => ({ id: r.id, opened_at: r.opened_at, closed_at: null, product: productOf(r.id), balance: balance(r.id), quarantined: qFor(r.id), entry_count: S.entries.filter((e) => e.register_id === r.id).length, last_checked_at: lastCheck(r.id) }));
const norm = (s: string) => s.toLowerCase().replace(/hydrochloride|sulfate|sulphate|[^a-z0-9]/g, '');

function csvFile(name: string, rows: (string | number | null)[][]) {
  const esc = (v: unknown) => { const s = v == null ? '' : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const blob = new Blob([rows.map((r) => r.map(esc).join(',')).join('\n')], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
}
function exportRegisters(ids: string[], name: string) {
  const people = new Map(S.staff.map((s) => [s.id, `${s.full_name}${s.psi_number ? ` (PSI ${s.psi_number})` : ''}`]));
  const rows: any[][] = [['Product', 'Line', 'Date', 'Type', 'Name', 'Address', 'Authority', 'Amount', 'Balance', 'Pharmacist']];
  for (const id of ids) {
    const p = productOf(id);
    for (const e of ledger(id)) rows.push([`${p.drug_name} ${p.strength} ${p.form}`, e.seq, e.transaction_date, e.entry_type, e.entry_type === 'receipt' ? e.supplier_name : e.recipient_name, e.entry_type === 'receipt' ? e.supplier_address : e.recipient_address, e.authority_to_possess, e.quantity, e.running_balance, people.get(e.recorded_by_staff_id)]);
  }
  csvFile(name, rows);
}

async function handle(method: string, path: string, url: URL, init?: RequestInit): Promise<Response> {
  const body = typeof init?.body === 'string' ? JSON.parse(init.body || '{}') : {};
  let m: RegExpMatchArray | null;
  const st = me();
  const needStaff = () => (st ? null : fail(423, 'Enter your PIN to continue', 'LOCKED'));

  if (path === '/api/staff/me') {
    return res({ pharmacy: { ...S.pharmacy, has_2fa: false, login_session: ((S as any).loginSession ||= uid()), permissions: (S as any).permissions ?? {} }, staff: st && { id: st.id, full_name: st.full_name, role: st.role, psi_number: st.psi_number }, locked: !st, hasPins: true, inboxCount: S.inbox.filter((i) => i.status === 'pending').length + DRAFTS().filter((d) => d.status === 'pending').length, remindersDue: st ? REM().filter((r) => r.active && r.next_due <= today()).length : 0, feedbackNew: 0 });
  }
  if (path === '/api/staff/unlock' && method === 'POST') {
    const s = S.staff.find((x) => x.is_active && x.pin === String(body.pin));
    if (!s) { audit('staff.pin_failed'); return fail(401, 'PIN not recognised. Demo PINs: 1234 supervising, 2345 pharmacist, 3456 locum, 4567 technician'); }
    S.activeStaffId = s.id; audit('staff.signed_in', { via: 'pin' });
    return res({ staff: { id: s.id, full_name: s.full_name, role: s.role, psi_number: s.psi_number } });
  }
  if (path === '/api/staff/lock') { S.activeStaffId = null; return res({ ok: true }); }
  if (path === '/api/staff') {
    if (needStaff()) return needStaff()!;
    if (!can.manage(st!.role)) return fail(403, 'Your role does not allow this action');
    if (method === 'GET') return res({ staff: S.staff.map(({ pin, ...s }) => ({ ...s, has_pin: !!pin })) });
    if (S.staff.some((x) => x.pin === body.pin && x.id !== body.id)) return fail(409, 'That PIN is already used by someone in this pharmacy');
    if (body.id) Object.assign(S.staff.find((x) => x.id === body.id)!, { ...body, pin: body.pin || S.staff.find((x) => x.id === body.id)!.pin });
    else S.staff.push({ ...body, id: uid(), is_active: true, created_at: new Date().toISOString() });
    audit(body.id ? 'staff.updated' : 'staff.created', { full_name: body.full_name });
    return res({ ok: true });
  }
  if (path === '/api/registers') {
    if (needStaff()) return needStaff()!;
    if (method === 'GET') return res({ registers: regList() });
    if (!can.open(st!.role)) return fail(403, 'Your role does not allow this action');
    let cls = body.class_name, sched = Number(body.schedule), parentId = null;
    if (body.stereoisomer_of_register_id) {
      const pp = productOf(body.stereoisomer_of_register_id);
      cls = pp.class_name; sched = pp.schedule; parentId = pp.id;
    }
    if (regList().some((r) => norm(r.product.drug_name) === norm(body.drug_name) && norm(r.product.strength) === norm(body.strength) && norm(r.product.form) === norm(body.form) && norm(r.product.brand ?? '') === norm(body.brand ?? ''))) return fail(409, 'A live register for this product already exists');
    const pid = uid(), rid = uid();
    S.products.push({ id: pid, drug_name: body.drug_name, brand: body.brand ?? null, class_name: cls, schedule: sched, schedule_paragraph: body.schedule_paragraph || null, form: body.form, strength: body.strength, unit: body.unit, is_stereoisomer_of: parentId, parent: null } as any);
    S.registers.push({ id: rid, product_id: pid, opened_at: today(), closed_at: null });
    if (Number(body.opening_balance) > 0) S.entries.push({ id: uid(), register_id: rid, seq: 1, entry_type: 'receipt', transaction_date: today(), recorded_at: new Date().toISOString(), quantity: String(body.opening_balance), supplier_name: 'Balance brought forward', supplier_address: body.opening_balance_note || 'Transferred from previous register', notes: 'Opening balance', recorded_by_staff_id: st!.id, source: 'manual' } as any);
    audit('register.opened', { drug_name: body.drug_name });
    return res({ id: rid });
  }
  if ((m = path.match(/^\/api\/registers\/([^/]+)$/))) {
    if (needStaff()) return needStaff()!;
    const r = S.registers.find((x) => x.id === m![1]);
    if (!r) return fail(404, 'Register not found');
    if (method === 'DELETE') {
      if (S.entries.some((e) => e.register_id === r.id)) return fail(409, 'This CD book has entries, so it can’t be removed.');
      S.registers = S.registers.filter((x) => x.id !== r.id);
      return res({ ok: true });
    }
    audit('register.viewed');
    const started = new Map((((S as any).countLines || []) as Json[]).map((l) => [l.stock_check_id, ((((S as any).counts || []) as Json[]).find((c) => c.id === l.count_id) ?? {}).started_at ?? null]));
    const checks = (((S as any).checks || []) as Json[]).filter((c) => c.register_id === r.id).map((c): Json => ({ ...c, checked_by_staff_id: c.checked_by_staff_id ?? S.staff.find((p) => p.full_name === c.checked_by_name)?.id ?? null, count_started_at: started.get(c.id) ?? null })).sort((a, b) => a.checked_at.localeCompare(b.checked_at));
    return res({ register: { id: r.id, product: productOf(r.id) }, ledger: ledger(r.id), entries: S.entries.filter((e) => e.register_id === r.id).sort((a, b) => a.seq - b.seq), staff: S.staff, checks });
  }
  if (path === '/api/entries/drafts') {
    if (needStaff()) return needStaff()!;
    const perms = (S as any).permissions ?? {};
    if (method === 'GET') {
      if (!rolesCan.record((st!.role as StaffRole)) && !permits((st!.role as StaffRole), 'draftEntries', perms)) return res({ drafts: [] });
      return res({ drafts: DRAFTS().filter((d) => d.status === 'pending').map((d) => { const r = regList().find((x: Json) => x.id === d.register_id); return { ...d, label: r ? productTitle(r.product) : 'Register', unit: r?.product.unit ?? 'units', mine: d.drafted_by_staff_id === st!.id }; }) });
    }
    if (!permits((st!.role as StaffRole), 'draftEntries', perms)) return fail(403, 'Your role isn’t allowed to do this here.');
    const { register_id, ...payload } = body;
    const d = { id: uid(), register_id, payload, drafted_by_staff_id: st!.id, drafted_by_name: st!.full_name, drafted_at: new Date().toISOString(), status: 'pending' };
    DRAFTS().push(d);
    return res({ draft_id: d.id, drafted: true });
  }
  if (path.startsWith('/api/entries/drafts/') && path.endsWith('/reject') && method === 'POST') {
    if (needStaff()) return needStaff()!;
    const d = DRAFTS().find((x) => x.id === path.split('/')[4]);
    if (!d || d.status !== 'pending') return fail(409, 'This draft was already dealt with');
    if (d.drafted_by_staff_id !== st!.id && !rolesCan.record((st!.role as StaffRole))) return fail(403, 'Only a pharmacist can turn down someone else’s draft');
    d.status = 'rejected';
    return res({ ok: true });
  }
  if (path.startsWith('/api/registers/') && path.endsWith('/close') && method === 'POST') {
    if (needStaff()) return needStaff()!;
    if (!rolesCan.manageStaff(st!.role as StaffRole)) return fail(403, 'Your role does not allow this action');
    const id = path.split('/')[3];
    const r = S.registers.find((x) => x.id === id);
    if (!r) return fail(404, 'Register not found');
    if (r.closed_at) return fail(409, 'Already closed');
    if (balance(id) !== 0) return fail(409, `Balance is ${balance(id)}. A register can only be closed at nil.`);
    if (!body?.reason || String(body.reason).trim().length < 5) return fail(400, 'Say why the book is being closed');
    (r as any).closed_at = new Date().toISOString();
    return res({ ok: true });
  }
  if (path === '/api/settings/permissions') {
    if (needStaff()) return needStaff()!;
    if (!rolesCan.manageStaff((st!.role as StaffRole))) return fail(403, 'Your role does not allow this action');
    if (method === 'PUT') (S as any).permissions = cleanOverrides(body.permissions);
    return res({ permissions: (S as any).permissions ?? {} });
  }
  if (path === '/api/entries' && method === 'POST') {
    if (needStaff()) return needStaff()!;
    if (!can.record(st!.role)) return fail(403, 'Your role does not allow this action');
    const e = body;
    if (e.entry_type !== 'correction' && isLate(e.transaction_date)) {
      if (!e.late_reason || String(e.late_reason).trim().length < 5) return fail(400, 'This transaction is more than a day old, say why it’s being entered late (e.g. system down, entered from the paper fallback sheet).', 'LATE_ENTRY');
      e.notes = `Late entry: ${String(e.late_reason).trim()}${e.notes ? ` · ${e.notes}` : ''}`;
    }
    const requisitionLine = !!e.requisition; const scriptDob = e.patient_dob ?? null;
    delete e.late_reason; delete e.requisition;
    const bal = balance(e.register_id);
    let next = bal;
    if (e.entry_type === 'correction') {
      const orig = ledger(e.register_id).find((x) => x.id === e.corrects_entry_id)!;
      const eff = (STOCK_EFFECT[orig.entry_type] ?? 0);
      next = bal + eff * (Number(e.quantity) - Number(orig.quantity));
      const raw = S.entries.find((x) => x.id === e.corrects_entry_id)!;
      for (const k of Object.keys(raw)) if (e[k] == null || e[k] === '') e[k] = (raw as any)[k];
    } else next = bal + (STOCK_EFFECT[e.entry_type] ?? 0) * Number(e.quantity);
    if (next < 0) return fail(409, `This would take the balance below zero (current ${bal}). Check the quantity or record the missing receipt first.`);
    // Same duplicate guard as the real server, run against the in-browser ledger.
    if (e.entry_type !== 'correction') {
      const rows = ledger(e.register_id);
      const fakeDb: any = { from: () => { let r: Json[] = rows.slice(); const q: any = {
        select: () => q, eq: (k: string, v: any) => ((r = r.filter((x) => x[k] === v)), q),
        gte: (k: string, v: any) => ((r = r.filter((x) => x[k] >= v)), q), lte: (k: string, v: any) => ((r = r.filter((x) => x[k] <= v)), q),
        limit: () => q, then: (res: any) => res({ data: r }) }; return q; } };
      const dup = await findDuplicate(fakeDb, e.register_id, e);
      if (dup && !e.allow_duplicate) return res({ error: dup.message, code: dup.level === 'block' ? 'DUPLICATE' : 'POSSIBLE_DUPLICATE', duplicate_of_seq: dup.seq }, 409);
      if (dup && e.allow_duplicate && (!e.duplicate_reason || String(e.duplicate_reason).length < 5)) return fail(400, 'Say why this isn’t a duplicate', dup.level === 'block' ? 'DUPLICATE' : 'POSSIBLE_DUPLICATE');
    }
    delete e.allow_duplicate; delete e.duplicate_reason;
    // Patient record, as on the server (docs/PATIENT_MATCHING.md §7)
    const isPatientLine = (e.entry_type === 'supply' && !requisitionLine) || e.entry_type === 'patient_return';
    const wantNew = !!e.new_patient, interactive = !!e.interactive, details = e.patient_details ?? {};
    for (const k of ['new_patient', 'interactive', 'update_patient', 'patient_details', 'patient_dob']) delete e[k];
    if (isPatientLine && !e.patient_id) {
      const probe = { full_name: e.recipient_name, first_name: details.first_name, surname: details.surname, address: e.recipient_address, dob: scriptDob, gms: details.gms, eircode: details.eircode };
      const cands = matchPatients(probe, demoPatients());
      const certain = cands.filter((c) => c.level === 'certain');
      if (!wantNew && certain.length === 1 && cands.filter((c) => c.level !== 'possible').length === 1) e.patient_id = certain[0].patient.id;
      else if (!wantNew && interactive && cands.length) {
        return res({ error: 'This looks like a patient you already have. Choose the patient, or New patient.', code: 'PATIENT_CHOICE', pick_id: preselect(cands).pick?.patient.id ?? null,
          candidates: cands.map((c) => ({ id: c.patient.id, first_name: c.patient.first_name, surname: c.patient.surname, date_of_birth: c.patient.date_of_birth, address: c.patient.address, gms_number: c.patient.gms_number, level: c.level, reasons: c.reasons, conflicts: c.conflicts })) }, 409);
      } else {
        const t = String(e.recipient_name).trim(); const i = t.lastIndexOf(' ');
        const np: Json = { id: uid(), first_name: details.first_name || (i < 0 ? t : t.slice(0, i)), surname: details.surname || (i < 0 ? '' : t.slice(i + 1)), date_of_birth: scriptDob, address: e.recipient_address ?? null, gms_number: details.gms ?? null, is_active: true };
        Object.assign(np, patientKeys(np)); (S as any).patients.push(np); e.patient_id = np.id;
        if (wantNew && cands.some((c) => c.level !== 'possible')) audit('patient.created_despite_match', {});
      }
    }
    const seq = S.entries.filter((x) => x.register_id === e.register_id).length + 1;
    const row = { ...e, id: uid(), seq, quantity: String(e.quantity), recorded_at: new Date().toISOString(), recorded_by_staff_id: st!.id, source: e.inbox_id ? 'pmr' : e.scan_id ? 'scan' : 'manual' };
    if (e.entry_type !== 'correction') { delete row.corrects_entry_id; delete row.correction_reason; }
    delete row.inbox_id; delete row.draft_id;
    S.entries.push(row);
    if (e.inbox_id) { const ib = S.inbox.find((i) => i.id === e.inbox_id); if (ib) ib.status = 'posted'; }
    if (e.draft_id) { const dr = DRAFTS().find((d) => d.id === e.draft_id); if (dr) Object.assign(dr, { status: 'signed', entry_id: row.id }); }
    audit(`cd_entry.${e.entry_type}`, { seq, quantity: e.quantity });
    return res({ id: row.id, seq, balance: next, patient_id: row.patient_id ?? null, patient_differs: [] });
  }
  if (path === '/api/search') {
    if (needStaff()) return needStaff()!;
    const q = (url.searchParams.get('q') || '').toLowerCase(), from = url.searchParams.get('from'), to = url.searchParams.get('to'), type = url.searchParams.get('type'), asc = url.searchParams.get('sort') === 'asc';
    let out: Json[] = S.registers.flatMap((r) => ledger(r.id).map((e) => ({ ...e, product: productOf(r.id) })));
    if (from) out = out.filter((e) => e.transaction_date >= from);
    if (to) out = out.filter((e) => e.transaction_date <= to);
    if (type) out = out.filter((e) => e.entry_type === type);
    const ids = (url.searchParams.get('register_ids') || '').split(',').filter(Boolean);
    if (ids.length) out = out.filter((e) => ids.includes(e.register_id));
    if (q) out = out.filter((e) => [e.product.drug_name, e.product.class_name, e.supplier_name, e.supplier_address, e.recipient_name, e.recipient_address, e.prescriber_name, e.authority_to_possess, e.prescription_ref, e.witness_name].some((v) => v && String(v).toLowerCase().includes(q)));
    out.sort((a, b) => (asc ? 1 : -1) * (a.transaction_date.localeCompare(b.transaction_date) || a.seq - b.seq));
    return res({ results: out });
  }
  if (path === '/api/settings') {
    if (needStaff()) return needStaff()!;
    const X = ((S as any).settings ||= { name: 'Quayside Pharmacy (demo)', address: '1 Quay St, Ennis, Co. Clare', psi_premises_number: '1234', invoice_names: null, lock_minutes: 15, locum_default_days: 14, stock_check_frequency: 'monthly', halo_enabled: true, migrated: true });
    if (method === 'PATCH') { const { low_stock, ...f } = body; Object.assign(X, f); for (const l of low_stock ?? []) ((S as any).lowStock ||= {})[l.register_id] = l.level; }
    return res({ settings: X, registers: regList().map((r: Json) => ({ id: r.id, label: productTitle(r.product), unit: r.product.unit, balance: r.balance, low_stock_level: (S as any).lowStock?.[r.id] ?? null })) });
  }
  if (path === '/api/settings/reader/models') return res({ models: [{ id: 'example/vision-model-a', name: 'Example vision model A', prompt_price: 1 }, { id: 'example/vision-model-b', name: 'Example vision model B', prompt_price: 0.5 }] });
  if (path === '/api/settings/reader') {
    const R = ((S as any).reader ||= { needs_migration: false, provider: 'openrouter', has_key: false, hint: null, models: [], updated_at: null, environment_fallback: false, vertex: { has_key: false, client_email: null, project: null, location: 'eu' }, locations: [{ id: 'eu', label: 'EU multi-region (recommended: processing stays in the EU)' }, { id: 'europe-west1', label: 'Belgium (europe-west1)' }] });
    if (method === 'PUT' && body.provider === 'vertex') {
      if (body.service_account_json) { try { const j = JSON.parse(body.service_account_json); R.vertex = { has_key: true, client_email: j.client_email, project: j.project_id, location: body.location }; } catch { return fail(400, 'That isn’t a valid key file: paste the whole JSON file.'); } }
      R.provider = 'vertex'; R.vertex.location = body.location;
    } else if (method === 'PUT') { if (body.api_key) { R.has_key = true; R.hint = `…${String(body.api_key).slice(-4)}`; } R.models = body.models; R.provider = 'openrouter'; }
    if (method === 'DELETE') { if (url.searchParams.get('provider') === 'vertex') { R.vertex = { has_key: false, client_email: null, project: null, location: 'eu' }; R.provider = 'openrouter'; } else { R.has_key = false; R.hint = null; } }
    return res(R);
  }
  if (path === '/api/integrity') {
    if (needStaff()) return needStaff()!;
    const only = url.searchParams.get('register_id');
    const regs = regList().filter((r) => !only || r.id === only);
    const fake = (n: number, salt: string) => Array.from(salt + n).reduce((h, c) => ((h * 31 + c.charCodeAt(0)) >>> 0), 7).toString(16).padStart(8, '0').repeat(8);
    return res({ ok: true, registers: regs.map((r) => ({ id: r.id, label: productTitle(r.product), ok: true, checked: r.entry_count, broken_seq: null, reason: null, head: fake(r.entry_count, r.id) })), audit: only ? null : { ok: true, checked: S.audit.length, broken_seq: null, reason: null, head: fake(S.audit.length, 'audit') }, checked_at: new Date().toISOString() });
  }
  if (path === '/api/inspector-links') {
    if (needStaff()) return needStaff()!;
    const L: Json[] = ((S as any).inspectorLinks ||= []);
    if (method === 'GET') return res({ links: L });
    const l = { id: uid(), label: body.label, expires_at: new Date(Date.now() + body.hours * 3600_000).toISOString(), revoked_at: null, created_by_name: st!.full_name, created_at: new Date().toISOString(), last_used_at: null, use_count: 0 };
    L.unshift(l); return res({ id: l.id, url: `${window.location.origin}/inspect/demo-link-not-available-in-the-demo`, expires_at: l.expires_at });
  }
  if ((m = path.match(/^\/api\/inspector-links\/([^/]+)$/)) && method === 'DELETE') {
    const l = ((S as any).inspectorLinks || []).find((x: Json) => x.id === m![1]); if (l) l.revoked_at = new Date().toISOString();
    return res({ ok: true });
  }
  if (path === '/api/risk-assessment' || path === '/api/risk-assessment/sign') {
    if (needStaff()) return needStaff()!;
    const RA = ((S as any).risk ||= []) as Json[];
    const lead = st!.role === 'supervising_pharmacist' || st!.role === 'superintendent_pharmacist';
    const roleName = (r: string) => (r === 'superintendent_pharmacist' ? 'Superintendent pharmacist' : 'Supervising pharmacist');
    if (method === 'GET') {
      const sup = S.staff.find((x) => x.role === 'supervising_pharmacist');
      const draft = RA.find((r) => r.status === 'draft') ?? null;
      const signed = RA.filter((r) => r.status === 'signed').reverse();
      return res({ prefill: { head: { pharmacy: S.pharmacy.name, psi: S.pharmacy.psi_premises_number, address: S.pharmacy.address, assessor: sup ? `${sup.full_name}, Supervising pharmacist` : '', date: today(), golive: daysAgo(40), system: 'PharmacyCDReg.ie', review: new Date(Date.now() + 365 * 864e5).toISOString().slice(0, 10) }, plan: { pins: true, twofa: false, books: true, stockcheck: !!((S as any).checks || []).length } },
        draft, signed: signed[0] ?? null, versions: signed.map((r) => ({ id: r.id, signed_at: r.signed_at, signed_by_name: r.signed_by_name })), can_sign: lead, me: { name: st!.full_name, psi: st!.psi_number, role: roleName(st!.role) } });
    }
    if (!lead) return fail(403, 'Only the superintendent or supervising pharmacist can do this');
    const draft = RA.find((r) => r.status === 'draft');
    if (method === 'PUT') { if (draft) draft.data = body.data; else RA.push({ id: uid(), status: 'draft', data: body.data }); return res({ ok: true, saved_at: new Date().toISOString() }); }
    if (method === 'POST') {
      if (body.confirm !== true) return fail(400, 'Tick to confirm you have reviewed it');
      const signer = { status: 'signed', data: body.data, signed_by_name: st!.full_name, signed_by_psi: st!.psi_number, signed_by_role: roleName(st!.role), signed_at: new Date().toISOString() };
      if (draft) Object.assign(draft, signer); else RA.push({ id: uid(), ...signer });
      return res({ ok: true });
    }
  }
  if (path === '/api/onboarding') {
    return res({ steps: [
      { key: 'team', label: 'Add your team, each with their own PIN', done: true, href: '/dashboard/team' },
      { key: 'registers', label: 'Open a CD book for each product you stock', done: true, href: '/dashboard?new=register' },
      { key: 'twofa', label: 'Turn on two-step sign-in', done: false, href: '/dashboard/settings' },
      { key: 'scan', label: 'Try scanning a prescription', done: false, href: '/dashboard/scan?type=prescription' },
      { key: 'check', label: 'Do your first stock check', done: !!((S as any).checks || []).length, href: '/dashboard' },
      { key: 'risk', label: 'Review and sign your risk assessment', done: !!(((S as any).risk || []) as Json[]).some((r) => r.status === 'signed'), href: '/dashboard/risk-assessment' },
      { key: 'reminder', label: 'Set up a reminder for a regular weekly supply', done: REM().length > 1, href: '/dashboard/reminders' },
      { key: 'backup', label: 'Download a full backup and keep it safe', done: false, href: '/dashboard/settings' },
    ] });
  }
  if (path === '/api/reminders') {
    if (needStaff()) return needStaff()!;
    if (method === 'GET') return res({ reminders: REM().map((r) => ({ ...r, due: r.active && r.next_due <= today(), lines: r.lines.map((l: Json) => ({ ...l, label: productTitle(productOf(l.register_id)), unit: productOf(l.register_id).unit, balance: balance(l.register_id), closed: false })) })) });
    const r = { ...body, id: uid(), active: true, last_done_on: null, last_done_by_name: null };
    REM().push(r); audit('reminder.created', { title: body.title });
    return res({ reminder: r });
  }
  if ((m = path.match(/^\/api\/reminders\/([^/]+)\/done$/)) && method === 'POST') {
    const r = REM().find((x) => x.id === m![1]); if (!r) return fail(404, 'Reminder not found');
    Object.assign(r, { next_due: advance(r.next_due, r.frequency, r.interval_days, today()), last_done_on: today(), last_done_by_name: st?.full_name });
    audit(`reminder.${body.action}`); return res({ reminder: r });
  }
  if ((m = path.match(/^\/api\/reminders\/([^/]+)$/))) {
    const i = REM().findIndex((x) => x.id === m![1]); if (i < 0) return fail(404, 'Reminder not found');
    if (method === 'DELETE') { REM().splice(i, 1); return res({ ok: true }); }
    Object.assign(REM()[i], body); return res({ reminder: REM()[i] });
  }
  if (path === '/api/notes') {
    if (needStaff()) return needStaff()!;
    if (method === 'GET') {
      const arch = url.searchParams.get('archived') === '1';
      return res({ notes: NOTES().filter((n) => !!n.archived === arch).map((n): Json => ({ ...n, register_label: n.register_id ? productTitle(productOf(n.register_id)) : null })).sort((a: Json, b: Json) => Number(b.pinned) - Number(a.pinned) || b.updated_at.localeCompare(a.updated_at)) });
    }
    const n = { id: uid(), title: body.title, body: body.body ?? '', category: body.category ?? null, pinned: !!body.pinned, archived: false, register_id: body.register_id ?? null, stock_check_id: body.stock_check_id ?? null, created_by_name: st!.full_name, updated_by_name: st!.full_name, created_at: new Date().toISOString(), updated_at: new Date().toISOString(), attachments: [] };
    NOTES().push(n); return res({ note: n });
  }
  if ((m = path.match(/^\/api\/notes\/([^/]+)\/attachments$/)) && method === 'POST') {
    const n = NOTES().find((x) => x.id === m![1]); if (!n) return fail(404, 'Note not found');
    const file = (init?.body as FormData)?.get?.('file') as File | null;
    if (!file) return fail(400, 'Choose a photo or PDF');
    const a = { id: uid(), file_name: file.name || 'photo.jpg', mime_type: file.type || 'image/jpeg', size_bytes: file.size, created_at: new Date().toISOString(), url: URL.createObjectURL(file) };
    n.attachments.push(a); return res({ attachment: a });
  }
  if ((m = path.match(/^\/api\/notes\/attachments\/([^/]+)$/)) && method === 'DELETE') {
    for (const n of NOTES()) n.attachments = n.attachments.filter((a: Json) => a.id !== m![1]);
    return res({ ok: true });
  }
  if ((m = path.match(/^\/api\/notes\/([^/]+)$/)) && method === 'PATCH') {
    const n = NOTES().find((x) => x.id === m![1]); if (!n) return fail(404, 'Note not found');
    Object.assign(n, body, { updated_by_name: st?.full_name, updated_at: new Date().toISOString() }); return res({ note: n });
  }
  if ((m = path.match(/^\/api\/stock-checks\/([^/]+)\/adjust$/)) && method === 'POST') {
    if (needStaff()) return needStaff()!;
    const c = ((S as any).checks || []).find((x: Json) => x.id === m![1]); if (!c) return fail(404, 'Stock check not found');
    const bal = balance(c.register_id);
    if (bal !== Number(c.register_balance)) return fail(409, 'The register has changed since this count. Do a new stock check, then amend from that.');
    if (!body.investigation || body.investigation.trim().length < 10) return fail(400, 'Say what you did to investigate (at least a sentence)');
    const diff = Number(c.counted) - bal;
    const notes = `Stock check ${today().split('-').reverse().join('/')} by ${c.checked_by_name}: counted ${c.counted}, register ${bal} (${diff > 0 ? '+' : ''}${diff}). Investigation: ${body.investigation}`;
    const seq = S.entries.filter((x) => x.register_id === c.register_id).length + 1;
    const e = { id: uid(), register_id: c.register_id, seq, entry_type: diff > 0 ? 'adjustment_in' : 'adjustment_out', transaction_date: today(), recorded_at: new Date().toISOString(), quantity: String(Math.abs(diff)), notes, recorded_by_staff_id: st!.id, source: 'manual' };
    S.entries.push(e as any);
    let note = null;
    if (body.save_note) { const p = productOf(c.register_id); note = { id: uid(), title: `Stock discrepancy: ${p.brand || p.drug_name} ${p.strength} (${diff > 0 ? '+' : ''}${diff})`, body: `${notes}\n\nRegister line ${seq} records the adjustment.`, category: 'Stock discrepancy', pinned: false, archived: false, register_id: c.register_id, stock_check_id: c.id, created_by_name: st!.full_name, updated_by_name: st!.full_name, created_at: new Date().toISOString(), updated_at: new Date().toISOString(), attachments: [] }; NOTES().push(note); }
    audit('stock_check.balance_amended', { diff });
    return res({ entry: { id: e.id, seq }, note, balance: Number(c.counted) });
  }
  if (path === '/api/feedback') {
    if (method === 'GET') {
      // Preview of the site owner's inbox (developer check only): localStorage cdreg-demo-owner = 1
      const owner = (() => { try { return localStorage.getItem('cdreg-demo-owner') === '1'; } catch { return false; } })();
      return res({ mine: FB().filter((f) => !f.shared), ideas: FB().filter((f) => f.shared), all: owner ? FB().map((f) => ({ ...f, pharmacy_name: f.pharmacy_name ?? 'Quayside Pharmacy (demo)' })) : null, is_admin: owner });
    }
    FB().unshift({ ...body, id: uid(), status: 'new', reply: null, shared: false, created_at: new Date().toISOString(), staff_name: st?.full_name });
    return res({ ok: true });
  }
  if ((m = path.match(/^\/api\/feedback\/([^/]+)$/)) && method === 'PATCH') {
    const f = FB().find((x) => x.id === m![1]); if (!f) return fail(404, 'Not found');
    Object.assign(f, body); return res({ feedback: f });
  }
  if ((m = path.match(/^\/api\/feedback\/([^/]+)\/vote$/))) {
    const f = FB().find((x) => x.id === m![1]); if (!f) return fail(404, 'Not found');
    f.voted = !f.voted; f.votes += f.voted ? 1 : -1; return res({ voted: f.voted });
  }
  if (path === '/api/quarantine') {
    if (needStaff()) return needStaff()!;
    const rid = url.searchParams.get('register_id');
    if (method === 'GET') return res({ items: Q().filter((i) => !rid || i.register_id === rid).map((i) => ({ ...i, label: productTitle(productOf(i.register_id)), unit: productOf(i.register_id).unit })).reverse() });
    const avail = balance(body.register_id) - qFor(body.register_id);
    if (!(Number(body.quantity) > 0) || Number(body.quantity) > avail) return fail(400, `Only ${avail} available to set aside`);
    Q().push({ id: uid(), register_id: body.register_id, quantity: Number(body.quantity), reason: body.reason, batch: body.batch, expiry_date: body.expiry_date, notes: body.notes, status: 'awaiting', created_at: new Date().toISOString() });
    audit('quarantine.added', { quantity: body.quantity });
    return res({ ok: true });
  }
  if ((m = path.match(/^\/api\/quarantine\/([^/]+)$/)) && m[1] !== 'destroy' && method === 'PATCH') {
    const it = Q().find((i) => i.id === m![1]); if (!it || it.status !== 'awaiting') return fail(404, 'Not found');
    Object.assign(it, { status: 'released', release_reason: body.reason }); audit('quarantine.released');
    return res({ ok: true });
  }
  if (path === '/api/quarantine/destroy' && method === 'POST') {
    if (needStaff()) return needStaff()!;
    const items = Q().filter((i) => body.ids.includes(i.id) && i.status === 'awaiting');
    const by: Record<string, Json[]> = {};
    for (const i of items) (by[i.register_id] ||= []).push(i);
    for (const [rid, list] of Object.entries(by)) {
      const qty = list.reduce((n, i) => n + Number(i.quantity), 0);
      const seq = S.entries.filter((x) => x.register_id === rid).length + 1;
      const id = uid();
      S.entries.push({ id, register_id: rid, seq, entry_type: 'destruction', transaction_date: body.transaction_date, recorded_at: new Date().toISOString(), quantity: String(qty), witness_name: body.witness_name, witness_role: body.witness_role, destruction_method: body.destruction_method, notes: 'Quarantined stock: ' + list.map((i) => `${i.reason}${i.batch ? ` batch ${i.batch}` : ''}`).join('; '), recorded_by_staff_id: st!.id, source: 'manual' } as any);
      for (const i of list) Object.assign(i, { status: 'destroyed', destroyed_entry_id: id });
    }
    audit('quarantine.destroyed', { count: items.length });
    return res({ ok: true });
  }
  if (path === '/api/destruction-book') {
    if (needStaff()) return needStaff()!;
    if (method === 'GET') return res({ rows: [...BOOK()].reverse() });
    if (body.kind === 'patient_return' && !body.returned_by_name) return fail(400, 'Who returned it?');
    BOOK().push({ ...body, id: uid(), received_by_name: st!.full_name, destroyed_date: null, destroyed_by_name: null, witness_name: null, witness_role: null, destruction_method: null });
    return res({ ok: true });
  }
  if (path === '/api/destruction-book/destroy' && method === 'POST') {
    if (needStaff()) return needStaff()!;
    for (const r of BOOK()) if (body.ids.includes(r.id) && !r.destroyed_date) Object.assign(r, { destroyed_date: body.destroyed_date, destroyed_by_name: st!.full_name, witness_name: body.witness_name || null, witness_role: body.witness_role || null, destruction_method: body.destruction_method || null });
    return res({ ok: true });
  }
  if (path === '/api/stock-counts' || /^\/api\/stock-counts\/[^/]+\/(line|finish)$/.test(path)) {
    if (needStaff()) return needStaff()!;
    const C = ((S as any).counts ||= []) as Json[];
    const L = ((S as any).countLines ||= []) as Json[];
    const checks = ((S as any).checks ||= []) as Json[];
    const logCheck = (l: Json) => { const c = { id: uid(), register_id: l.register_id, counted: l.counted, register_balance: l.balance_at_count, notes: l.note || null, checked_by_name: l.counted_by_name ?? st!.full_name, checked_at: l.counted_at ?? new Date().toISOString() }; checks.push(c); l.stock_check_id = c.id; };
    if (path === '/api/stock-counts') {
      if (method === 'GET') {
        const sorted = [...C].sort((a, b) => b.started_at.localeCompare(a.started_at));
        const id = url.searchParams.get('id');
        const count = id ? sorted.find((c) => c.id === id) ?? null : sorted.find((c) => c.status === 'open') ?? sorted[0] ?? null;
        return res({ count, lines: count ? L.filter((l) => l.count_id === count.id) : [], counts: sorted });
      }
      const open = C.find((c) => c.status === 'open');
      if (open) return res({ count: open });
      const c = { id: uid(), status: 'open', started_at: new Date().toISOString(), finished_at: null, started_by_name: st!.full_name };
      C.push(c); return res({ count: c });
    }
    const cid = path.split('/')[3];
    const count = C.find((c) => c.id === cid);
    if (!count) return fail(404, 'Count not found');
    if (count.status !== 'open') return fail(409, 'This count is finished and can’t be changed');
    if (path.endsWith('/line')) {
      let l = L.find((x) => x.count_id === cid && x.register_id === body.register_id);
      if (l?.stock_check_id) return fail(409, 'This line is complete and logged in its book; it can’t be changed');
      if (!l) { l = { id: uid(), count_id: cid, register_id: body.register_id, counted: null, balance_at_count: null, counted_at: null, note: null, counted_by_name: null, stock_check_id: null }; L.push(l); }
      if (body.note !== undefined) l.note = body.note || null;
      if (body.counted !== undefined) {
        if (body.counted === null) Object.assign(l, { counted: null, balance_at_count: null, counted_at: null, counted_by_name: null });
        else if (l.counted === null || Number(l.counted) !== Number(body.counted)) Object.assign(l, { counted: Number(body.counted), balance_at_count: balance(body.register_id), counted_at: new Date().toISOString(), counted_by_name: st!.full_name });
      }
      if (body.complete) {
        if (l.counted === null) return res({ error: 'Enter the count first', line: l }, 400);
        if (Number(l.counted) !== Number(l.balance_at_count) && !l.note) return res({ error: 'The count doesn’t match the register: add a note on what you found first', line: l }, 400);
        logCheck(l);
      }
      return res({ line: l });
    }
    const counted = L.filter((l) => l.count_id === cid && l.counted !== null);
    if (!counted.length) return fail(400, 'Count at least one book first');
    const noNote = counted.filter((l) => Number(l.counted) !== Number(l.balance_at_count) && !l.note);
    if (noNote.length) return fail(400, `${noNote.length} line${noNote.length === 1 ? '' : 's'} don’t match the register: add a note on what you found first`);
    counted.filter((l) => !l.stock_check_id).forEach(logCheck);
    Object.assign(count, { status: 'finished', finished_at: new Date().toISOString(), finished_by_name: st!.full_name });
    return res({ ok: true, recorded: counted.length, differences: counted.filter((l) => Number(l.counted) !== Number(l.balance_at_count)).length });
  }
  if (path === '/api/stock-checks') {
    if (needStaff()) return needStaff()!;
    const list: Json[] = ((S as any).checks ||= []);
    if (method === 'GET') return res({ checks: list.filter((c) => c.register_id === url.searchParams.get('register_id')).reverse() });
    const bal = regList().find((r: Json) => r.id === body.register_id)?.balance ?? 0;
    const diff = Number(body.counted) - bal;
    if (diff !== 0 && !body.notes) return fail(400, 'The count doesn’t match the register. Add a note on what you found');
    const c = { id: uid(), register_id: body.register_id, counted: Number(body.counted), register_balance: bal, notes: body.notes, checked_by_name: st!.full_name, checked_at: new Date().toISOString() };
    list.push(c);
    return res({ check: c, balance: bal, diff });
  }
  if (path === '/api/audit/event') return res({ ok: true });
  if (path === '/api/group') {
    if (needStaff()) return needStaff()!;
    const regs = regList();
    const mk = (id: string, name: string, address: string, current: boolean, x: Partial<Json> = {}) => ({ id, name, address, current, status: 'trialing', registers: regs.length, entries_7d: 9, late_30d: 0, reminders_due: 0, awaiting_destruction: 0, stock_checks_overdue: 0, stock_check_frequency: 'monthly', last_stock_check: new Date(Date.now() - 6 * 864e5).toISOString(), discrepancies: 0, ...x });
    return res({ pharmacies: [
      mk('demo', S.pharmacy.name, S.pharmacy.address, true, { reminders_due: REM().filter((r) => r.active && r.next_due <= today()).length }),
      mk('demo-2', 'Riverside Pharmacy (demo)', '4 Bridge St, Ennis', false, { awaiting_destruction: 2, stock_checks_overdue: 1, late_30d: 1 }),
      mk('demo-3', 'Market Square Pharmacy (demo)', 'Market Sq, Kilrush', false, { status: 'active', entries_7d: 14 }),
    ] });
  }
  if (path === '/api/backup') return res({ format: 'pharmacycdreg-backup', version: 1, demo: true, exported_at: new Date().toISOString(), ...S });
  if (path === '/api/preferences') return res(method === 'GET' ? { theme: null } : { ok: true, saved_to_account: false });
  if (path === '/api/patients/import') return res({ added: 0 });
  if (path === '/api/patients') {
    if (needStaff()) return needStaff()!;
    if (method === 'GET' && url.searchParams.get('ost') === '1') return res({ patients: demoPatients().filter((p) => p.is_ost).sort((a, b) => (a.surname || '').localeCompare(b.surname || '')) });
    if (method === 'GET') return res({ patients: demoPatients().filter((p) => patientMatch(p, url.searchParams.get('q') || '')).sort((a, b) => (a.surname || '').localeCompare(b.surname || '')) });
    const p = { ...body, id: uid(), is_active: true };
    demoPatients(); (S as any).patients.push(p);
    return res({ patient: p });
  }
  if (path === '/api/patients/duplicates') {
    if (needStaff()) return needStaff()!;
    const all = demoPatients(); const seen = new Set<string>(); const pairs: Json[] = [];
    for (const a of all) for (const c of matchPatients({ first_name: a.first_name, surname: a.surname, dob: a.date_of_birth, address: a.address, gms: a.gms_number }, all.filter((b) => b.id !== a.id), 3)) {
      if (c.level === 'possible') continue; const k = [a.id, c.patient.id].sort().join('|'); if (seen.has(k)) continue; seen.add(k);
      pairs.push({ a, b: c.patient, level: c.level, reasons: c.reasons });
    }
    return res({ pairs });
  }
  if ((m = path.match(/^\/api\/patients\/([^/]+)\/merge$/))) {
    if (needStaff()) return needStaff()!;
    if (!can.record(st!.role)) return fail(403, 'Your role does not allow this action');
    const from = demoPatients().find((x) => x.id === m![1]), into = demoPatients().find((x) => x.id === body.into);
    if (!from || !into || from === into) return fail(404, 'Both patients must be active records of this pharmacy');
    let moved = 0; for (const e of S.entries as Json[]) if (e.patient_id === from.id) { e.patient_id = into.id; moved++; }
    for (const k of ['date_of_birth', 'address', 'gms_number']) if (!into[k] && from[k]) into[k] = from[k];
    from.is_active = false; from.merged_into = into.id;
    audit('patient.merged', { lines_moved: moved });
    return res({ ok: true, lines_moved: moved });
  }
  if (path.startsWith('/api/patients/') && path !== '/api/patients/ost-import') {
    if (needStaff()) return needStaff()!;
    const p = demoPatients().find((x) => x.id === path.split('/')[3]);
    if (!p) return fail(404, 'Patient not found');
    if (method === 'PATCH') { if (body.archive) p.is_active = false; else Object.assign(p, body); }
    return res({ patient: p });
  }
  if (path === '/api/reports/patient') {
    if (needStaff()) return needStaff()!;
    const pid = url.searchParams.get('patient_id');
    const pp = pid ? demoPatients().find((x) => x.id === pid) : null;
    const name = (pp ? `${pp.first_name} ${pp.surname}`.trim() : url.searchParams.get('name') || '').toLowerCase();
    const rows: Json[] = S.registers.flatMap((r) => ledger(r.id).map((e) => ({ ...e, product: productOf(r.id) }) as Json))
      .filter((e) => ['supply', 'patient_return', 'patient_return_destruction'].includes(e.entry_type) && (e.recipient_name || '').toLowerCase() === name)
      .sort((a, b) => a.transaction_date.localeCompare(b.transaction_date));
    const totals: Record<string, Json> = {};
    for (const r of rows) { const t = (totals[r.register_id] ||= { label: productTitle(r.product), unit: r.product.unit, supplied: 0, returned: 0, count: 0 }); if (r.entry_type === 'supply') { t.supplied += Number(r.quantity); t.count++; } else if (r.entry_type === 'patient_return') t.returned += Number(r.quantity); }
    return res({ rows, totals: Object.values(totals) });
  }
  if (path === '/api/audit') {
    if (needStaff()) return needStaff()!;
    if (!can.audit(st!.role)) return fail(403, 'Your role does not allow this action');
    const ev = [...S.audit, ...S.entries.map((e, i) => ({ id: 10000 + i, occurred_at: e.recorded_at, action: `cd_entry.${e.entry_type}`, staff_name: S.staff.find((s) => s.id === e.recorded_by_staff_id)?.full_name, details: { seq: e.seq, quantity: e.quantity, reason: e.correction_reason ?? undefined } }))].sort((a, b) => b.occurred_at.localeCompare(a.occurred_at));
    return res({ events: url.searchParams.get('before') ? [] : ev });
  }
  if (path === '/api/stock-checks/reconcile' && method === 'POST') {
    if (needStaff()) return needStaff()!;
    await new Promise((r) => setTimeout(r, 1200));
    const regId = init?.body instanceof FormData ? String(init.body.get('register_id')) : '';
    const reg = regList().find((r: Json) => r.id === regId);
    if (!reg) return fail(404, 'Register not found');
    // A made-up dispensing report: this register's recent lines, plus two the register is missing and one with a different quantity
    const recent = ledger(regId).filter((e) => (e.entry_type === 'supply' || e.entry_type === 'receipt') && e.supplier_name !== 'Balance brought forward');
    const rows: ReportRow[] = recent.map((e) => ({ date: e.transaction_date, kind: e.entry_type, name: e.entry_type === 'supply' ? e.recipient_name : e.supplier_name, address: null, prescriber: e.prescriber_name ?? null, reference: e.prescription_ref ?? null, quantity: Number(e.quantity), product: null }));
    if (rows.length > 2) rows[rows.length - 1] = { ...rows[rows.length - 1], quantity: rows[rows.length - 1].quantity * 2 };
    rows.push({ date: daysAgo(4), kind: 'supply', name: 'Paddy Hehir', address: null, prescriber: 'Dr K. Ryan', reference: 'Rx 10288', quantity: 14, product: null });
    rows.push({ date: daysAgo(0), kind: 'supply', name: 'Niamh Corcoran', address: '9 Oak Park, Clarecastle, Co. Clare', prescriber: 'Dr A. Walsh', reference: 'Rx 10311', quantity: 14, product: null });
    // A photo with the left edge cut off: only the last digit of the day shows
    const cutIso = daysAgo(3); const [cy, cm, cd] = cutIso.split('-');
    const opts = dateOptions(`?${cd.slice(-1)}/${cm}/${cy}`, today());
    rows.push({ date: opts[0], kind: 'supply', name: 'Dunne* Aoife', address: '7 Clare Rd, Ennis', prescriber: null, reference: null, quantity: 10, product: null, date_options: opts.length > 1 ? opts : undefined });
    const out = reconcile(rows, recent as any);
    const lines = out.map((r, i) => {
      const b = { i, ...r, late: isLate(r.row.date) };
      if (r.status !== 'missing') return b;
      return { ...b, patient: null, draft: { entry_type: r.row.kind, transaction_date: r.row.date, quantity: r.row.quantity, recipient_name: (r.row.name ?? '').replace(/\*/g, '').trim(), recipient_address: r.row.address ?? '', prescriber_name: r.row.prescriber, authority_to_possess: `Prescription: ${r.row.prescriber}`, prescription_ref: r.row.reference } };
    });
    return res({ lines, skipped: 2, period: { from: daysAgo(30), to: today() }, balance: balance(regId), unit: reg.product.unit, warnings: [] });
  }
  if (path === '/api/stock-checks/reconcile-all' && method === 'POST') {
    if (needStaff()) return needStaff()!;
    await new Promise((r) => setTimeout(r, 1200));
    // A made-up report covering several books: two books match, one has two missing supplies
    const books = regList().slice(0, 3).map((reg: Json, k: number) => {
      const recent = ledger(reg.id).filter((e) => (e.entry_type === 'supply' || e.entry_type === 'receipt') && e.supplier_name !== 'Balance brought forward');
      const rows: ReportRow[] = recent.map((e) => ({ date: e.transaction_date, kind: e.entry_type, name: e.entry_type === 'supply' ? e.recipient_name : e.supplier_name, address: null, prescriber: e.prescriber_name ?? null, reference: e.prescription_ref ?? null, quantity: Number(e.quantity), product: null }));
      if (k === 0) {
        rows.push({ date: daysAgo(4), kind: 'supply', name: 'GREHAN, Maura', address: '3 Mill Lane, Ennis', prescriber: 'Brennan, Dr Aoife', reference: 'GM2611/0041', quantity: 14, product: null });
        rows.push({ date: daysAgo(0), kind: 'supply', name: 'TOBIN, Eamon', address: '27 Station Road, Ennis', prescriber: 'Ennis General', reference: 'EM2611/0118', quantity: 10, product: null });
      }
      const out = reconcile(rows, recent as any);
      const lines = out.map((r, i) => {
        const b = { i, ...r, late: isLate(r.row.date) };
        if (r.status !== 'missing') return b;
        const nm = (r.row.name ?? '').replace(/^([^,]+),\s*(.+)$/, '$2 $1').replace(/\b([A-Z])([A-Z]+)\b/g, (_m: string, a: string, z: string) => a + z.toLowerCase());
        return { ...b, patient: null, draft: { entry_type: r.row.kind, transaction_date: r.row.date, quantity: r.row.quantity, recipient_name: nm, recipient_address: r.row.address ?? '', prescriber_name: r.row.prescriber, authority_to_possess: `Prescription: ${r.row.prescriber}`, prescription_ref: r.row.reference } };
      });
      return { register_id: reg.id, label: productTitle(reg.product), unit: reg.product.unit, balance: balance(reg.id), lines, skipped: 0, warnings: [] };
    });
    return res({ books, unmatched: [{ product: 'XANAX 500MCG TABS', date: daysAgo(2), quantity: 7 }], skipped: 0, warnings: [], period: { from: daysAgo(14), to: today() }, exact: true });
  }
  if (path === '/api/scan/labels' && method === 'POST') {
    if (needStaff()) return needStaff()!;
    await new Promise((r) => setTimeout(r, 1200));
    const regs = regList().filter((r: Json) => /methadone/i.test(r.product.drug_name));
    const df = demoPatients().find((p) => p.first_name === 'Declan' && p.surname === 'Farrell');
    return res({ registers: regs.map((r: Json) => ({ id: r.id, label: productTitle(r.product) })), warnings: [], patients: [
      { first_name: 'Declan', surname: 'Farrell', address: '12 Abbey Court, Ennis', treatment_card_no: 'PH 4417', pmr_code: 'F12', product: null, daily_dose: null, dose_text: null, register_id: regs[0]?.id ?? null, pick_id: df?.id ?? null, candidates: df ? [{ id: df.id, first_name: df.first_name, surname: df.surname, address: df.address, level: 'certain', reasons: ['Name matches', 'Treatment card matches'] }] : [] },
      { first_name: 'Aisling', surname: 'Moran', address: '3 Harbour View, Kilrush', treatment_card_no: null, pmr_code: 'M40', product: null, daily_dose: null, dose_text: null, register_id: regs[0]?.id ?? null, pick_id: null, candidates: [] },
    ] });
  }
  if (path === '/api/patients/ost-import' && method === 'POST') {
    if (needStaff()) return needStaff()!;
    let added = 0, updated = 0;
    for (const p of body.patients ?? []) {
      const ex = p.patient_id && demoPatients().find((x) => x.id === p.patient_id);
      const ost = { is_ost: true, ...(p.treatment_card_no ? { treatment_card_no: String(p.treatment_card_no).replace(/\s+/g, '').toUpperCase() } : {}), ...(p.register_id ? { ost_register_id: p.register_id } : {}), ...(p.pmr_code ? { pmr_code: p.pmr_code } : {}), ...(p.daily_dose ? { ost_daily_dose: p.daily_dose } : {}) };
      if (ex) { Object.assign(ex, ost); updated++; } else { (S as any).patients.push({ id: uid(), first_name: p.first_name, surname: p.surname, address: p.address ?? null, date_of_birth: null, gms_number: null, is_active: true, ...ost }); added++; }
    }
    audit('patients.ost_imported', { added, updated });
    return res({ added, updated });
  }
  if (path === '/api/scan/register-page' && method === 'POST') {
    if (needStaff()) return needStaff()!;
    await new Promise((r) => setTimeout(r, 1500));
    const { decideOpening } = await import('@/lib/register-page');
    const page = { is_cd_register_page: true, product_written: 'MORPHINE ZOMORPH 30mg', drug_name: 'Morphine sulfate', brand: 'Zomorph', strength: '30mg', form: 'prolonged-release capsule', unit: 'capsules' as const, likely_schedule: 2, balance_transferred: 120, warnings: [],
      rows: [{ date: '2026-11-03', date_written: '03/11/26', obtained: null, supplied: 28, balance: 92, balance_unclear: false }, { date: '2026-11-08', date_written: '08/11/26', obtained: null, supplied: 14, balance: 78, balance_unclear: false }, { date: '2026-11-10', date_written: '10/11/26', obtained: null, supplied: 28, balance: 50, balance_unclear: false }] };
    return res({ page, opening: decideOpening(page), exempt: null, existing: null });
  }
  if (path === '/api/scan' && method === 'POST') {
    if (needStaff()) return needStaff()!;
    await new Promise((r) => setTimeout(r, 1800));
    const fd = init?.body as FormData;
    const isRx = fd?.get?.('hint') === 'prescription';
    // A file named like "ost…" plays the HSE OST (methadone) form, with made-up details
    const isOst = isRx && /ost/i.test(String((fd?.get?.('file') as File | null)?.name ?? ''));
    const extraction = isRx
      ? { document_type: 'prescription', document_date: today(), reference: 'Rx 10302', supplier_name: null, supplier_address: null, patient_name: 'MARY KELY', patient_first_name: 'Mary', patient_surname: 'Kely', patient_dob: '1948-07-01', gms_number: '1234567B', patient_address: '14 Main Street, Ennis', prescriber_name: 'Dr A. Walsh', prescriber_address: 'Ennis Medical Centre', prescriber_registration: '012345', warnings: [], items: [{ drug_name: 'Oxycodone hydrochloride', strength: '5mg', form: 'capsule', quantity: 28, quantity_unit: 'capsules', pack_description: '28 (twenty-eight)', is_controlled_drug: true, likely_schedule: 2, confidence: 'high', notes: '', brand: 'OxyNorm', packs: null, pack_size: null, quantity_figures: '28', quantity_words: 'twenty-eight', duration_text: null, is_credit: false }] }
      : { document_type: 'invoice', document_date: today(), reference: 'Invoice 4472210', supplier_name: 'United Drug', supplier_address: 'Magna Business Park, Citywest, Dublin 24', patient_name: null, patient_address: null, prescriber_name: null, prescriber_address: null, prescriber_registration: null, warnings: [], items: [
          { drug_name: 'Oxycodone hydrochloride', strength: '5mg', form: 'capsule', quantity: 112, quantity_unit: 'capsules', pack_description: 'OXYNORM CAPS 5MG 56: CD2', is_controlled_drug: true, likely_schedule: 2, confidence: 'high', notes: '', brand: 'OxyNorm', packs: 2, pack_size: 56, quantity_figures: null, quantity_words: null, duration_text: null, is_credit: false },
          { drug_name: 'Morphine sulfate', strength: '10mg', form: 'prolonged-release tablet', quantity: 60, quantity_unit: 'tablets', pack_description: 'MST CONTINUS 10MG PR TABLETS 60', is_controlled_drug: true, likely_schedule: 2, confidence: 'high', notes: '', brand: 'MST Continus', packs: 1, pack_size: 60, quantity_figures: null, quantity_words: null, duration_text: null, is_credit: false },
          { drug_name: 'Morphine sulfate', strength: '10mg/5ml', form: 'oral solution', quantity: 300, quantity_unit: 'ml', pack_description: 'ORAMORPH 10MG/5ML 100ML', is_controlled_drug: true, likely_schedule: 5, confidence: 'high', notes: '', brand: 'Oramorph', packs: 3, pack_size: 100, quantity_figures: null, quantity_words: null, duration_text: null, is_credit: false },
          { drug_name: 'Paracetamol', strength: '500mg', form: 'tablet', quantity: 100, quantity_unit: 'tablets', pack_description: '1 x 100', is_controlled_drug: false, likely_schedule: null, confidence: 'high', notes: '', brand: null, packs: 1, pack_size: 100, quantity_figures: null, quantity_words: null, duration_text: null, is_credit: false }] };
    const regs = regList();
    const exempt = extraction.items.filter((i: any) => i.is_controlled_drug && registerExemption(i.drug_name, i.strength, i.form, i.brand)).map((i: any) => ({ label: `${i.brand ?? i.drug_name} ${i.strength}`, reason: registerExemption(i.drug_name, i.strength, i.form, i.brand) }));
    const proposals = extraction.items.filter((i: any) => i.is_controlled_drug && !registerExemption(i.drug_name, i.strength, i.form, i.brand)).map((item: any) => {
      const same = regs.filter((r) => [item.drug_name, item.brand].filter(Boolean).some((n: string) => genericKey(n) === genericKey(r.product.drug_name)));
      const exact = same.filter((r) => sameStrength(r.product.strength, item.strength));
      const match = exact.length === 1 ? exact[0] : null;
      const qty = decideQuantity(item, extraction.document_type as any);
      return { item, qty, match_state: match ? 'your_register' : same.length ? 'pick_register' : 'no_register', register_id: match?.id ?? null, register_label: match ? productTitle(match.product) : null, current_balance: match?.balance ?? null, candidates: regs.filter((r) => norm(r.product.drug_name).includes(norm(item.drug_name))).map((r) => ({ id: r.id, label: productTitle(r.product) })), draft: { entry_type: isRx ? 'supply' : 'receipt', transaction_date: today(), quantity: qty.quantity ?? '', supplier_name: extraction.supplier_name, supplier_address: extraction.supplier_address, recipient_name: extraction.patient_name, recipient_address: extraction.patient_address, patient_dob: (extraction as any).patient_dob ?? null, patient_details: isRx ? { first_name: (extraction as any).patient_first_name, surname: (extraction as any).patient_surname, gms: (extraction as any).gms_number } : null, prescriber_name: extraction.prescriber_name, prescriber_address: extraction.prescriber_address, authority_to_possess: isRx ? `Prescription: ${extraction.prescriber_name}` : null, prescription_ref: extraction.reference, notes: isRx ? null : extraction.reference, scan_id: null } };
    });
    audit('scan.read', { document_type: extraction.document_type });
    let patient_match: Json | null = null;
    if (isRx) {
      const x: any = extraction;
      const cands = matchPatients({ full_name: x.patient_name, first_name: x.patient_first_name, surname: x.patient_surname, dob: x.patient_dob, gms: x.gms_number, address: x.patient_address }, demoPatients());
      patient_match = { pick_id: preselect(cands).pick?.patient.id ?? null, ambiguous: preselect(cands).ambiguous, candidates: cands.map((c) => ({ id: c.patient.id, first_name: c.patient.first_name, surname: c.patient.surname, date_of_birth: c.patient.date_of_birth, address: c.patient.address, gms_number: c.patient.gms_number, level: c.level, reasons: c.reasons, conflicts: c.conflicts })) };
    }
    let ost: Json | null = null;
    if (isOst) {
      const { decideOst, ostRef } = await import('@/lib/ost');
      const t = today(), y = new Date(Date.now() - 864e5).toISOString().slice(0, 10);
      const form: any = { serial_no: '9000024', pharmacy_sequence_no: '31', treatment_card_no: 'PH 4417', date_prescribed: y, from_date: y, to_date: new Date(Date.now() + 5 * 864e5).toISOString().slice(0, 10), product: 'methadone', drug_written: 'METHADONE DTF 1MG/ML ORAL SOLUTION', daily_dose: 75, dose_unit: null, days_at_dose: 7, total_figures: '525', total_words: 'five hundred and twenty five', instalment_daily: null, instalment_double_sat: null, instalment_days: ['wed', 'sat'], supervised: true, supervised_daily: null, supervised_days: ['wed'], dispensings: [{ date: y, quantity: 75, quantity_text: '75 (S)', mode: 'supervised', initialled: true }, { date: t, quantity: 75, quantity_text: '75 (S)', mode: 'supervised', initialled: true }, { date: t, quantity: 300, quantity_text: '300 (TA)', mode: 'take_away', initialled: true }] };
      const dec = decideOst(form, t);
      const reg = regList().find((r: Json) => r.product.drug_name.startsWith('Methadone'));
      const draft = { entry_type: 'supply', transaction_date: t, quantity: dec.today.total, recipient_name: 'Declan Farrell', recipient_address: '12 Abbey Court, Ennis', prescriber_name: 'Dr K. Ryan', prescriber_address: 'Abbey Street Surgery, Ennis', authority_to_possess: 'Prescription: Dr K. Ryan', prescription_ref: ostRef(form.serial_no), notes: `OST instalment: ${dec.today.breakdown}`, scan_id: null };
      const item = { drug_name: 'Methadone hydrochloride', strength: '1mg/ml', form: 'oral solution', quantity: 525, quantity_unit: 'ml', pack_description: '525 (five hundred and twenty five)', is_controlled_drug: true, likely_schedule: 2, confidence: 'high', notes: '', brand: 'Methadone DTF', packs: null, pack_size: null, quantity_figures: '525', quantity_words: 'five hundred and twenty five', duration_text: '7 days', is_credit: false };
      const base = { item, qty: { quantity: dec.today.total, label: `Dispensed today: ${dec.today.breakdown}`, flags: dec.flags }, match_state: reg ? 'your_register' : 'no_register', register_id: reg?.id ?? null, register_label: reg ? productTitle(reg.product) : null, current_balance: reg?.balance ?? null, candidates: reg ? [{ id: reg.id, label: productTitle(reg.product) }] : [], draft };
      const missing = dec.earlier.map((e) => ({ ...base, qty: { quantity: e.quantity, label: `Dispensed ${e.date.split('-').reverse().join('/')}, not in the register yet`, flags: ['Recorded as a late entry: say why it wasn’t entered on the day.'] }, draft: { ...draft, transaction_date: e.date, quantity: e.quantity, notes: `OST instalment: ${e.quantity} supervised` } }));
      proposals.splice(0, proposals.length, base as any, ...(missing as any[]));
      Object.assign(extraction, { patient_name: 'DECLAN FARREL', patient_address: '12 Abbey Court, Ennis', reference: form.serial_no, items: [item] });
      ost = { serial_no: form.serial_no, treatment_card_no: form.treatment_card_no, product: 'methadone', drug_written: form.drug_written, daily_dose: 75, days_at_dose: 7, from_date: form.from_date, to_date: form.to_date, total: dec.total, dispensed_so_far: dec.dispensedSoFar, remaining: dec.remaining, schedule: dec.schedule, today: dec.today, earlier: dec.earlier.map((e) => ({ ...e, in_register: false })), flags: dec.flags };
    }
    if (isOst) {
      const cands = matchPatients({ full_name: 'DECLAN FARREL', address: '12 Abbey Ct, Ennis', card: 'PH 4417' }, demoPatients());
      patient_match = { pick_id: preselect(cands).pick?.patient.id ?? null, ambiguous: false, candidates: cands.map((c) => ({ id: c.patient.id, first_name: c.patient.first_name, surname: c.patient.surname, date_of_birth: c.patient.date_of_birth, address: c.patient.address, gms_number: c.patient.gms_number, treatment_card_no: c.patient.treatment_card_no, level: c.level, reasons: c.reasons, conflicts: c.conflicts })) };
    }
    return res({ scan_id: 'demo', extraction, proposals, exempt, patient_match, ost, ignored: extraction.items.filter((i: any) => !i.is_controlled_drug).length });
  }
  if (path === '/api/inbox') {
    if (needStaff()) return needStaff()!;
    const regs = regList();
    return res({ items: S.inbox.filter((i) => i.status === 'pending').map((i) => ({ ...i, balance: i.register_id ? balance(i.register_id) : null, candidates: regs.map((r) => ({ id: r.id, label: productTitle(r.product), unit: r.product.unit })) })) });
  }
  if ((m = path.match(/^\/api\/inbox\/([^/]+)\/reject$/))) {
    const ib = S.inbox.find((i) => i.id === m![1]);
    if (ib) { ib.status = 'rejected'; ib.problem = body.reason; audit('pmr.rejected', { reason: body.reason }); }
    return res({ ok: true });
  }
  if (path === '/api/integrations/keys') {
    if (method === 'GET') return res({ keys: S.keys });
    if (body.id) { const k = S.keys.find((x) => x.id === body.id)!; if (body.auto_post !== undefined) k.auto_post = body.auto_post; if (body.revoke) k.revoked_at = new Date().toISOString() as any; return res({ ok: true }); }
    const key = `cdr_live_DEMO${Math.random().toString(36).slice(2, 14)}`;
    S.keys.unshift({ id: uid(), name: body.name, key_prefix: key.slice(0, 17), auto_post: false, created_at: today(), last_used_at: null, revoked_at: null });
    return res({ key });
  }
  if (path === '/api/contacts') {
    if (needStaff()) return needStaff()!;
    if (method === 'GET') return res({ contacts: (S as any).contacts.filter((c: Json) => c.is_active !== false) });
    const list = Array.isArray(body.contacts) ? body.contacts : [body];
    let added = 0;
    for (const c of list) {
      if (c.id) Object.assign((S as any).contacts.find((x: Json) => x.id === c.id) ?? {}, c);
      else if (!(S as any).contacts.some((x: Json) => x.kind === c.kind && x.name.toLowerCase() === String(c.name).toLowerCase())) { (S as any).contacts.push({ ...c, id: uid() }); added++; }
    }
    return res({ ok: true, added });
  }
  if (path === '/api/suggest') {
    if (needStaff()) return needStaff()!;
    const kind = url.searchParams.get('kind') || '';
    const q = (url.searchParams.get('q') || '').toLowerCase();
    if (q.length < 2 && !(q === '' && kind !== 'witness')) return res({ suggestions: [] });
    if (q === '' && kind === 'patient') {
      const reg = regList().find((r: Json) => r.id === url.searchParams.get('register_id'));
      const ost = !!reg && /methadone|buprenorph/i.test(`${reg.product.drug_name} ${reg.product.brand ?? ''}`);
      const list = ost ? demoPatients().filter((p) => p.is_ost) : [];
      return res({ suggestions: list.map((p) => ({ name: `${p.first_name} ${p.surname}`.trim(), address: p.address, source: 'patient', patient_id: p.id, dob: p.date_of_birth, detail: ['OST', p.treatment_card_no].filter(Boolean).join(' · '), usual_prescriber: p.gp_name ? { name: p.gp_name, address: p.gp_address } : null })) });
    }
    if (q === '' && kind === 'prescriber') {
      const out: Json[] = ((S as any).contacts as Json[]).filter((c) => c.kind === 'prescriber' && c.is_active !== false).slice(0, 10).map((c) => ({ ...c, source: 'list' }));
      const seen = new Set(out.map((o) => o.name.toLowerCase()));
      for (const e of [...S.entries].sort((x, y) => y.recorded_at.localeCompare(x.recorded_at))) {
        if (!e.prescriber_name || seen.has(e.prescriber_name.toLowerCase())) continue;
        seen.add(e.prescriber_name.toLowerCase()); out.push({ name: e.prescriber_name, address: e.prescriber_address ?? null, source: 'register' });
        if (out.length >= 12) break;
      }
      return res({ suggestions: out });
    }
    const out: Json[] = [];
    if (kind === 'patient') for (const p of demoPatients().filter((x) => patientMatch(x, q)).slice(0, 8)) out.push({ name: `${p.first_name} ${p.surname}`.trim(), address: p.address, source: 'patient', patient_id: p.id, dob: p.date_of_birth, gms_number: p.gms_number, usual_prescriber: p.gp_name ? { name: p.gp_name, address: p.gp_address } : null });
    if (kind !== 'patient') for (const c of (S as any).contacts) if (c.kind === kind && c.is_active !== false && [c.name, c.gms_number, c.registration].some((v: string) => v && v.toLowerCase().includes(q))) out.push({ ...c, source: 'list' });
    const cols: Record<string, [string, string]> = { patient: ['recipient_name', 'recipient_address'], prescriber: ['prescriber_name', 'prescriber_address'], supplier: ['supplier_name', 'supplier_address'], witness: ['witness_name', 'witness_role'] };
    const [n, a] = cols[kind] ?? cols.patient;
    const seen = new Set(out.map((o) => o.name.toLowerCase()));
    for (const e of [...S.entries].sort((x, y) => y.recorded_at.localeCompare(x.recorded_at))) {
      const name = e[n]; if (!name || !name.toLowerCase().includes(q) || seen.has(name.toLowerCase()) || name === 'Balance brought forward') continue;
      seen.add(name.toLowerCase());
      out.push(kind === 'witness' ? { name, address: null, role: e[a], source: 'register' } : kind === 'patient' ? { name, address: e[a] ?? null, source: 'register', usual_prescriber: e.prescriber_name ? { name: e.prescriber_name, address: e.prescriber_address ?? null } : null } : { name, address: e[a] ?? null, source: 'register' });
    }
    if (kind === 'supplier') {
      const { KNOWN_SUPPLIERS } = await import('@/lib/invoice-rules');
      for (const k of KNOWN_SUPPLIERS) if ((k.name.toLowerCase().includes(q) || k.match.test(q)) && ![...seen].some((x) => k.match.test(x))) out.push({ name: k.name, address: k.address, source: 'preset' });
    }
    if (kind === 'prescriber' && out.length < 10) {
      const { searchGms, GMS_LIST_DATE } = await import('@/lib/gms');
      for (const g of searchGms(q, 10 - out.length)) if (!seen.has(g.n.toLowerCase())) out.push({ name: g.n, address: g.a, gms_number: g.g, source: 'gms', detail: `HSE GMS list (${GMS_LIST_DATE}): ${g.raw}` });
    }
    return res({ suggestions: out.slice(0, 10) });
  }
  if (path === '/api/gms') {
    if (needStaff()) return needStaff()!;
    const { browseGms, GMS_LIST_DATE } = await import('@/lib/gms');
    const r = browseGms(url.searchParams.get('q') || '', Number(url.searchParams.get('offset')) || 0, 50);
    return res({ ...r, list_date: GMS_LIST_DATE });
  }
  if (path.startsWith('/api/billing/')) return res({ error: 'Billing opens Stripe in the live version, not available in the demo.' }, 400);
  return fail(404, TRAINING ? 'Not available in training mode' : 'Not available in the demo');
}

function installInterceptor(passthrough: (path: string) => boolean = () => false) {
  const realFetch = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url, window.location.origin);
    if (url.origin === window.location.origin && url.pathname.startsWith('/api/')) {
      if (passthrough(url.pathname)) return realFetch(input as any, init);
      // Training: the PIN is checked by the real server (no PINs are copied); the session is local.
      if (TRAINING && url.pathname === '/api/staff/unlock') {
        const r = await realFetch(input as any, init);
        const body = await r.clone().json().catch(() => ({}));
        if (r.ok && body?.staff?.id) S.activeStaffId = body.staff.id;
        return r;
      }
      const r = await handle((init?.method || 'GET').toUpperCase(), url.pathname, url, init);
      save();
      return r;
    }
    return realFetch(input as any, init);
  };
  // Export links are plain <a href="/api/…"> downloads; build those files in the browser.
  document.addEventListener('click', (ev) => {
    const a = (ev.target as HTMLElement)?.closest?.('a[href^="/api/"]') as HTMLAnchorElement | null;
    if (!a) return;
    ev.preventDefault();
    const m = a.getAttribute('href')!.match(/^\/api\/registers\/([^/]+)\/export/);
    if (m) exportRegisters([m[1]], `cd-register-${m[1]}.csv`);
    else if (a.getAttribute('href') === '/api/export') exportRegisters(S.registers.map((r) => r.id), `cd-register-all-${today()}.csv`);
    else if (a.getAttribute('href') === '/api/backup') {
      const blob = new Blob([JSON.stringify({ format: 'pharmacycdreg-backup', version: 1, demo: true, exported_at: new Date().toISOString(), ...S }, null, 1)], { type: 'application/json' });
      const d = document.createElement('a'); d.href = URL.createObjectURL(blob); d.download = `pharmacycdreg-backup-${today()}.json`; d.click();
    }
  }, true);
}

export function installDemo() {
  if ((window as any).__cdregDemo) return;
  (window as any).__cdregDemo = true;
  S = load();
  installInterceptor();
}

/** Reading photos still uses the real reader in training (it writes nothing to the register). */
const TRAINING_PASSTHROUGH = ['/api/scan', '/api/scan/register-page', '/api/scan/status', '/api/settings/reader', '/api/settings/reader/test'];

/**
 * Training mode: practise on a copy of the pharmacy's own registers. Every change stays in this
 * page's memory; nothing reaches the real register, and a refresh clears it all.
 */
export function installTraining(snap: Json, pharmacy: Json) {
  if ((window as any).__cdregDemo || (window as any).__cdregTraining) return;
  (window as any).__cdregTraining = true;
  TRAINING = true;
  const base = seed();
  S = {
    ...base,
    pharmacy: { ...pharmacy },
    staff: snap.staff,
    products: snap.products,
    registers: snap.registers,
    entries: snap.entries,
    audit: [],
    inbox: snap.inbox ?? [],
    keys: [],
    contacts: snap.contacts ?? [],
    activeStaffId: snap.activeStaffId,
  } as unknown as State;
  if (snap.patients) (S as any).patients = snap.patients;
  if (snap.settings) (S as any).settings = snap.settings;
  if (snap.lowStock) (S as any).lowStock = snap.lowStock;
  installInterceptor((path) => TRAINING_PASSTHROUGH.includes(path));
}
