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
import { findDuplicate } from '@/lib/duplicates';
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
  record: (r: string) => ['supervising_pharmacist', 'pharmacist', 'locum_pharmacist'].includes(r),
  open: (r: string) => ['supervising_pharmacist', 'pharmacist'].includes(r),
  manage: (r: string) => r === 'supervising_pharmacist',
  audit: (r: string) => ['supervising_pharmacist', 'pharmacist', 'read_only'].includes(r),
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
const regList = () => S.registers.filter((r) => !r.closed_at).map((r) => ({ id: r.id, opened_at: r.opened_at, closed_at: null, product: productOf(r.id), balance: balance(r.id), quarantined: qFor(r.id), entry_count: S.entries.filter((e) => e.register_id === r.id).length }));
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
    return res({ pharmacy: S.pharmacy, staff: st && { id: st.id, full_name: st.full_name, role: st.role, psi_number: st.psi_number }, locked: !st, hasPins: true, inboxCount: S.inbox.filter((i) => i.status === 'pending').length, remindersDue: st ? REM().filter((r) => r.active && r.next_due <= today()).length : 0, feedbackNew: 0 });
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
    return res({ register: { id: r.id, product: productOf(r.id) }, ledger: ledger(r.id), entries: S.entries.filter((e) => e.register_id === r.id).sort((a, b) => a.seq - b.seq), staff: S.staff });
  }
  if (path === '/api/entries' && method === 'POST') {
    if (needStaff()) return needStaff()!;
    if (!can.record(st!.role)) return fail(403, 'Your role does not allow this action');
    const e = body;
    if (e.entry_type !== 'correction' && isLate(e.transaction_date)) {
      if (!e.late_reason || String(e.late_reason).trim().length < 5) return fail(400, 'This transaction is more than a day old, say why it’s being entered late (e.g. system down, entered from the paper fallback sheet).', 'LATE_ENTRY');
      e.notes = `Late entry: ${String(e.late_reason).trim()}${e.notes ? ` · ${e.notes}` : ''}`;
    }
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
    const seq = S.entries.filter((x) => x.register_id === e.register_id).length + 1;
    const row = { ...e, id: uid(), seq, quantity: String(e.quantity), recorded_at: new Date().toISOString(), recorded_by_staff_id: st!.id, source: e.inbox_id ? 'pmr' : e.scan_id ? 'scan' : 'manual' };
    if (e.entry_type !== 'correction') { delete row.corrects_entry_id; delete row.correction_reason; }
    delete row.inbox_id;
    S.entries.push(row);
    if (e.inbox_id) { const ib = S.inbox.find((i) => i.id === e.inbox_id); if (ib) ib.status = 'posted'; }
    audit(`cd_entry.${e.entry_type}`, { seq, quantity: e.quantity });
    return res({ id: row.id, seq, balance: next });
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
  if (path === '/api/onboarding') {
    return res({ steps: [
      { key: 'team', label: 'Add your team, each with their own PIN', done: true, href: '/dashboard/team' },
      { key: 'registers', label: 'Open a CD book for each product you stock', done: true, href: '/dashboard?new=register' },
      { key: 'twofa', label: 'Turn on two-step sign-in', done: false, href: '/dashboard/settings' },
      { key: 'scan', label: 'Try scanning a prescription', done: false, href: '/dashboard/scan?type=prescription' },
      { key: 'check', label: 'Do your first stock check', done: !!((S as any).checks || []).length, href: '/dashboard' },
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
  if (path === '/api/patients/import') return res({ added: 0 });
  if (path === '/api/patients') {
    if (needStaff()) return needStaff()!;
    if (method === 'GET') return res({ patients: demoPatients().filter((p) => patientMatch(p, url.searchParams.get('q') || '')).sort((a, b) => (a.surname || '').localeCompare(b.surname || '')) });
    const p = { ...body, id: uid(), is_active: true };
    demoPatients(); (S as any).patients.push(p);
    return res({ patient: p });
  }
  if (path.startsWith('/api/patients/')) {
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
    const extraction = isRx
      ? { document_type: 'prescription', document_date: today(), reference: 'Rx 10302', supplier_name: null, supplier_address: null, patient_name: 'Eileen Moran', patient_address: '12 Bindon St, Ennis', prescriber_name: 'Dr A. Walsh', prescriber_address: 'Ennis Medical Centre', prescriber_registration: '012345', warnings: [], items: [{ drug_name: 'Oxycodone hydrochloride', strength: '5mg', form: 'capsule', quantity: 28, quantity_unit: 'capsules', pack_description: '28 (twenty-eight)', is_controlled_drug: true, likely_schedule: 2, confidence: 'high', notes: '', brand: 'OxyNorm', packs: null, pack_size: null, quantity_figures: '28', quantity_words: 'twenty-eight', duration_text: null, is_credit: false }] }
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
      return { item, qty, match_state: match ? 'your_register' : same.length ? 'pick_register' : 'no_register', register_id: match?.id ?? null, register_label: match ? productTitle(match.product) : null, current_balance: match?.balance ?? null, candidates: regs.filter((r) => norm(r.product.drug_name).includes(norm(item.drug_name))).map((r) => ({ id: r.id, label: productTitle(r.product) })), draft: { entry_type: isRx ? 'supply' : 'receipt', transaction_date: today(), quantity: qty.quantity ?? '', supplier_name: extraction.supplier_name, supplier_address: extraction.supplier_address, recipient_name: extraction.patient_name, recipient_address: extraction.patient_address, prescriber_name: extraction.prescriber_name, prescriber_address: extraction.prescriber_address, authority_to_possess: isRx ? `Prescription: ${extraction.prescriber_name}` : null, prescription_ref: extraction.reference, notes: isRx ? null : extraction.reference, scan_id: null } };
    });
    audit('scan.read', { document_type: extraction.document_type });
    return res({ scan_id: 'demo', extraction, proposals, exempt, ignored: extraction.items.filter((i: any) => !i.is_controlled_drug).length });
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
    if (q.length < 2 && !(kind === 'supplier' && q === '')) return res({ suggestions: [] });
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
