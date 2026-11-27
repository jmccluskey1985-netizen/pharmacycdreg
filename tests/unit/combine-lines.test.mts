// Repeated invoice lines for the same product become one receipt. Made-up invoice.
import { combineRepeatLines } from '../../src/lib/combine-lines';

let fail = 0;
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fail++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : `: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`}`);
};
const line = (brand: string, strength: string, form: string, q: number | null, extra: any = {}) => ({
  register_id: null, item: { brand, drug_name: brand === 'OxyNorm' ? 'Oxycodone hydrochloride' : 'Fentanyl', strength, form, ...extra },
  qty: { quantity: q, label: q == null ? 'No quantity read' : `2 packs × 5 = ${q}`, flags: [] as string[] }, draft: { quantity: q ?? '' },
});

const p = combineRepeatLines([line('Durogesic', '12mcg/hr', 'transdermal patch', 10), line('DUROGESIC DTRANS', '12mcg/hr', 'transdermal patch', 10), line('OxyNorm', '5mg', 'capsule', 112)]);
eq('two Durogesic lines become one', p.length, 2);
eq('quantities added', p[0].qty.quantity, 20);
eq('draft quantity added', p[0].draft.quantity, 20);
eq('label shows the sum', p[0].qty.label, '2 packs × 5 = 10 + 2 packs × 5 = 10 = 20');
eq('flag explains it', p[0].qty.flags[0], '2 lines of this product on the invoice, combined into one receipt.');
eq('other product untouched', p[1].qty.quantity, 112);

const q = combineRepeatLines([line('Durogesic', '12mcg/hr', 'transdermal patch', 10), line('Durogesic', '25mcg/hr', 'transdermal patch', 10), line('Durogesic', '12mcg/hr', 'transdermal patch', 10, { is_credit: true })]);
eq('different strength and credit lines kept apart', q.length, 3);

if (fail) { console.log(`${fail} failed`); process.exit(1); }
