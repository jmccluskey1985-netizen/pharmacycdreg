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
