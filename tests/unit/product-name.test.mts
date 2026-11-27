import { test } from 'node:test';
import assert from 'node:assert/strict';
import { brandOf, productTitle } from '../../src/lib/product-name';

const mor = (brand: string | null, form = 'prolonged-release tablet') => ({ drug_name: 'Morphine sulfate', strength: '10mg', form, brand });

test('MST spellings all read MST Continus', () => {
  for (const b of ['MST', 'mst', 'MST CONTINUS', 'Mst Continus', 'MST-Continus']) assert.equal(brandOf(mor(b)), 'MST Continus', b);
});
test('Sevredol stays Sevredol, with its own form', () => {
  assert.equal(productTitle(mor('SEVREDOL', 'tablet')), 'Sevredol 10mg tablet');
});
test('unknown brands in capitals are tidied, mixed case kept', () => {
  assert.equal(brandOf(mor('ROWEX')), 'Rowex');
  assert.equal(brandOf(mor('McBrand')), 'McBrand');
});
test('no brand falls back to the usual brand for the form', () => {
  assert.equal(brandOf(mor(null)), 'MST Continus');
});

import { formKey, standardForm, productFor } from '../../src/data/cd-products';
test('patch written any way is the Durogesic transdermal patch', () => {
  for (const f of ['patch', 'Patch', 'patches', 'transdermal patches', 'TD patch']) assert.equal(formKey(f), formKey('transdermal patch'), f);
  assert.equal(standardForm('patch'), 'transdermal patch');
  assert.equal(productFor('Fentanyl', 'patch', 'Durogesic')?.brands[0], 'Durogesic');
});
test('forms that are really different stay different', () => {
  assert.notEqual(formKey('tablet'), formKey('prolonged-release tablet'));
  assert.notEqual(formKey('m/r capsule'), formKey('prolonged-release capsule')); // Ritalin LA is modified-release
  assert.equal(formKey('PR tablet'), formKey('prolonged-release tablet'));
  assert.notEqual(formKey('oral solution'), formKey('concentrated oral solution'));
});
