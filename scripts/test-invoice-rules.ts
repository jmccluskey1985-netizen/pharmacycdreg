// Checks the invoice rules against real Irish wholesaler paperwork layouts.
import { decideQuantity } from '../src/lib/quantity';
import { identifySupplier, looksLikeOwnPharmacy, checkReference, packSizeFromText } from '../src/lib/invoice-rules';

const base = { quantity: 0, quantity_unit: 'tablets', quantity_figures: null, quantity_words: null, duration_text: null, is_credit: false, confidence: 'high' as const };
const pharmacy = { name: 'St James Late Night Pharmacy', address: 'The Concourse, St James Hospital, Dublin 8' };
let fail = 0;
const eq = (name: string, got: unknown, want: unknown) => { const ok = JSON.stringify(got) === JSON.stringify(want); if (!ok) fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}  →  ${JSON.stringify(got)}${ok ? '' : `  (want ${JSON.stringify(want)})`}`); };

// 1-2. Uniphar CD docket: Quantity 1, Packsize column 56
eq('Uniphar CD docket OxyNorm 5mg caps', decideQuantity({ ...base, packs: 1, pack_size: 56, line_text: '1 OXYNORM 5MG CAPSULES 300420 56 30/04/29' }, 'invoice').quantity, 56);
eq('Docket ref "NUMBER" accepted', checkReference('0972709426', 'NUMBER'), null);
eq('Docket ACCOUNT rejected', !!checkReference('M', 'ACCOUNT'), true);
eq('Bibola Ltd ship-to is not supplier', looksLikeOwnPharmacy('Bibola Ltd', 'The Concourse, Dublin', pharmacy), true);
eq('Supplier from footer wording', identifySupplier(null, 'returned signed within 3 days to UNIPHAR PLC')?.name, 'Uniphar Wholesale');
// 3-4.
eq('Concerta XL 36mg ×30', decideQuantity({ ...base, packs: 1, pack_size: 30, line_text: '1 CONCERTA XL 36MG TABLETS 319589 30 31/01/28' }, 'invoice').quantity, 30);
eq('MST Continus 5mg ×60', decideQuantity({ ...base, packs: 1, pack_size: 60, line_text: '1 MST CONTINUS 5MG PR TABLETS 233455 60 31/10/28' }, 'invoice').quantity, 60);
// 5. PCO MDA receipt: pack size only in description
const pco = decideQuantity({ ...base, packs: 1, pack_size: null, line_text: '21465 Oxycontin 10mg prolonged-release tabs 56 274664 PC294 30/09/28 1' }, 'invoice');
eq('PCO MDA receipt Oxycontin → 56 from description', pco.quantity, 56);
eq('PCO "Invoice No:" accepted', checkReference('E402886', 'Invoice No:'), null);
eq('PCO "Reference:" rejected', !!checkReference('13131639', 'Reference:'), true);
eq('"Delivered To" block is not supplier', looksLikeOwnPharmacy('St James Late Night Pharmacy', 'Concourse St James Hospital Dublin 8', pharmacy), true);
eq('PCO from Registered-in-Ireland line', identifySupplier('PCO MANUFACTURING')?.address, 'Unit 10 Ashbourne Business Park, Rath, Ashbourne, Co. Meath, A84 WR60');
// 6. Uniphar multipage invoice: QTY 2, PACK 56 in separate column
eq('Uniphar invoice OxyNorm 2 × 56', decideQuantity({ ...base, packs: 2, pack_size: 56, line_text: '2 OXYNORM 5MG CAPSULES 56 6.52 11.0% A0 11.61 LK' }, 'invoice').quantity, 112);
eq('Invoice "INVOICE" accepted, not ACCOUNT 5017706', [checkReference('0972665107', 'INVOICE'), !!checkReference('5017706', 'ACCOUNT')], [null, true]);
eq('"Your Ref" rejected', !!checkReference('13129353', 'Your Ref:'), true);
const hw = decideQuantity({ ...base, packs: 8, pack_size: 28, handwritten_qty: '5', line_text: '8 LYCIMOR HARD CAPS 300MG 28 TEVA 4.64' }, 'invoice');
eq('Handwritten 5 beside printed 8 → blocked for check', [hw.quantity, hw.blocking], [224, true]);
eq('A tick is fine', decideQuantity({ ...base, packs: 2, pack_size: 56, handwritten_qty: '✓' }, 'invoice').blocking, false);
const mis = decideQuantity({ ...base, packs: 2, pack_size: 28, line_text: '2 OXYNORM 5MG CAPSULES 56 6.52' }, 'invoice');
eq('Misaligned PACK column (28 vs printed 56) → blocked', mis.blocking, true);
// 7. PCO invoice: codes and batch numbers ignored
eq('PCO invoice line pack size', packSizeFromText('S-01-C 1 PC294 21465 OXYCONTIN 10MG PROLONGED-RELEASE TABS 56 274664 8.30'), 56);
eq('PCO "INVOICE" accepted, Shop Ref rejected', [checkReference('E402886', 'INVOICE'), !!checkReference('2039', 'Shop Ref:')], [null, true]);
console.log(fail ? `\n${fail} FAILED` : '\nAll passed');
process.exit(fail ? 1 : 0);
