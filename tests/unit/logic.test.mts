// Register logic that protects against wrong entries: duplicates, brand matching, quantities.
import { findDuplicate } from '../../src/lib/duplicates';
import { matchRegister } from '../../src/lib/match';
import { decideQuantity, wordsToNumber } from '../../src/lib/quantity';
import { productFor, normBrand } from '../../src/data/cd-products';

let fail = 0;
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fail++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : `: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`}`);
};

// ── Duplicate guard (fake of the Supabase query chain it uses) ──
const rows = [
  { register_id: 'R', entry_type: 'receipt', seq: 3, quantity: 56, notes: 'Invoice 0972709426', supplier_name: 'Uniphar Wholesale', transaction_date: '2026-11-10' },
  { register_id: 'R', entry_type: 'receipt', seq: 1, quantity: 518, notes: 'Opening balance', supplier_name: 'Balance brought forward', transaction_date: '2026-11-09' },
  { register_id: 'R', entry_type: 'supply', seq: 9, quantity: 18, recipient_name: 'Tyrone Burke', prescriber_name: 'Dr S. Russell', prescription_ref: 'Order 2075963163', authority_to_possess: null, transaction_date: '2026-11-12' },
];
const db: any = { from: () => { let r = rows.slice(); const q: any = {
  select: () => q, eq: (k: string, v: any) => (r = r.filter((x: any) => x[k] === v), q),
  gte: (k: string, v: any) => (r = r.filter((x: any) => x[k] >= v), q), lte: (k: string, v: any) => (r = r.filter((x: any) => x[k] <= v), q),
  limit: () => q, then: (res: any) => res({ data: r }) }; return q; } };
const dup = async (e: any) => (await findDuplicate(db, 'R', e))?.level ?? 'ok';
eq('same invoice scanned twice is blocked', await dup({ entry_type: 'receipt', transaction_date: '2026-11-10', quantity: 56, notes: 'Invoice 0972709426' }), 'block');
eq('same invoice typed as bare number is blocked', await dup({ entry_type: 'receipt', transaction_date: '2026-11-11', quantity: 56, notes: '0972709426' }), 'block');
eq('same quantity, different invoice, 2 days later warns', await dup({ entry_type: 'receipt', transaction_date: '2026-11-12', quantity: 56, notes: 'Invoice 0972712000' }), 'warn');
eq('different invoice a week later is fine', await dup({ entry_type: 'receipt', transaction_date: '2026-11-18', quantity: 112, notes: 'Invoice 0972799999' }), 'ok');
eq('same Rx reference again is blocked', await dup({ entry_type: 'supply', transaction_date: '2026-11-13', quantity: 18, recipient_name: 'TYRONE  BURKE', prescription_ref: '2075963163' }), 'block');
eq('same patient + amount same day is blocked', await dup({ entry_type: 'supply', transaction_date: '2026-11-12', quantity: 18, recipient_name: 'Tyrone Burke' }), 'block');
eq('same patient + amount 2 days later warns', await dup({ entry_type: 'supply', transaction_date: '2026-11-14', quantity: 18, recipient_name: 'Tyrone Burke', prescriber_name: 'Dr S. Russell' }), 'warn');
eq('same patient, new Rx 10 days later is fine', await dup({ entry_type: 'supply', transaction_date: '2026-11-22', quantity: 18, recipient_name: 'Tyrone Burke', prescription_ref: 'Order 2079990001' }), 'ok');
eq('repeat Rx from the same doctor is NOT a duplicate (reg / GMS numbers ignored)', await (async () => {
  rows.push({ register_id: 'R', entry_type: 'supply', seq: 12, quantity: 28, recipient_name: 'Mary Kelly', prescriber_name: 'Dr A. Walsh', prescription_ref: null as any, authority_to_possess: 'Prescription: Dr A. Walsh (Reg 012345) · GMS 88213', transaction_date: '2026-11-02' } as any);
  return dup({ entry_type: 'supply', transaction_date: '2026-11-13', quantity: 28, recipient_name: 'Mary Kelly', prescriber_name: 'Dr A. Walsh', authority_to_possess: 'Prescription: Dr A. Walsh (Reg 012345) · GMS 88213', prescription_ref: 'Rx 77001' });
})(), 'ok');
eq('different patient same amount is fine', await dup({ entry_type: 'supply', transaction_date: '2026-11-12', quantity: 18, recipient_name: 'Mary Kelly' }), 'ok');

// ── Brand-aware register matching ──
const R = (id: string, brand: string | null, strength: string) => ({ id, label: id, drug_name: 'Oxycodone hydrochloride', class_name: 'Oxycodone', strength, form: 'capsule', unit: 'capsules', brand });
const regs = [R('oxy5', 'OxyNorm', '5mg'), R('sho10', 'Shortec', '10mg'), R('oxy10', 'OxyNorm', '10mg')];
const m = (b: string | null, st: string) => { const x: any = matchRegister(regs as any, 'Oxycodone hydrochloride', st, 'capsule', b); return [x.state, x.match?.id ?? null]; };
eq('OxyNorm 5mg goes to the OxyNorm 5mg book', m('OxyNorm', '5mg'), ['your_register', 'oxy5']);
eq('Shortec 5mg never goes into the OxyNorm book', m('Shortec', '5mg'), ['no_register', null]);
eq('brand matching ignores case', m('oxynorm', '10mg'), ['your_register', 'oxy10']);
eq('no brand read: pharmacist picks the book', m(null, '10mg')[0], 'pick_register');
eq('OxyNorm is capsules in the catalogue', productFor('oxycodone', 'capsule', 'OxyNorm')?.form?.toLowerCase().includes('caps'), true);
eq('brand aliases normalise', normBrand('oxy norm'), 'OxyNorm');

// ── Quantities ──
const base = { quantity: 0, quantity_unit: 'capsules', packs: null, pack_size: null, quantity_figures: null, quantity_words: null, duration_text: null, is_credit: false, confidence: 'high' as const };
eq('words: one hundred and twelve', wordsToNumber('one hundred and twelve'), 112);
eq('words: twenty-eight', wordsToNumber('twenty-eight'), 28);
eq('words: not a number', wordsToNumber('two weeks'), null);
eq('invoice: 2 packs x 56 = 112', decideQuantity({ ...base, quantity: 112, packs: 2, pack_size: 56 } as any, 'invoice').quantity, 112);
eq('Rx: words and figures agree', decideQuantity({ ...base, quantity_words: 'twenty-eight', quantity_figures: '28' } as any, 'prescription').quantity, 28);
const bad = decideQuantity({ ...base, quantity_words: 'twenty', quantity_figures: '28' } as any, 'prescription');
eq('Rx: words and figures disagree is blocked', [bad.quantity, bad.blocking], [null, true]);
eq('Rx: 18 doses x 1 = 18', decideQuantity({ ...base, quantity_unit: 'doses', quantity_words: 'eighteen doses', units_per_dose: 1 } as any, 'prescription').quantity, 18);

console.log(fail ? `\n${fail} FAILED` : '\nAll passed');
process.exit(fail ? 1 : 0);
