import test from 'node:test';
import assert from 'node:assert/strict';
import { parseWikidata, cleanName, POPULAR } from '../src/core/releases.js';

const row = (label, mfr, date) => ({ itemLabel: { value: label }, mfrLabel: { value: mfr }, date: { value: date } });

test('releases: filtra, limpia, ordena y quita repetidos', () => {
  const r = parseWikidata({
    results: {
      bindings: [
        row('iPhone 16 Pro', 'Apple Inc.', '2024-09-20T00:00:00Z'),
        row('Samsung Galaxy S25 Ultra', 'Samsung Electronics', '2025-02-07T00:00:00Z'),
        row('Galaxy S25 Ultra', 'Samsung Electronics', '2025-01-22T00:00:00Z'),
        row('Moto G Power', 'Motorola Mobility', '2025-03-01T00:00:00Z'), // sin número: se descarta
        row('Moto G55', 'Motorola Mobility', '2025-01-10T00:00:00Z'),
        row('Q12345', 'Apple Inc.', '2025-01-01T00:00:00Z'), // sin etiqueta
        row('Fairphone 5', 'Fairphone', '2023-08-30T00:00:00Z'), // marca no popular
        row('Pixel 9', 'Google', 'basura'),
        row('iPhone 18 Pro', 'Apple Inc.', '2026-01-01T00:00:00Z'), // solo año: se descarta
        row('Redmi Note 14', 'Xiaomi', '2024-12-10T00:00:00Z'),
      ],
    },
  });
  assert.deepEqual(r.map((p) => [p.name, p.brand, p.date]), [
    ['Galaxy S25 Ultra', 'Samsung', '2025-01-22'],
    ['Moto G55', 'Motorola', '2025-01-10'],
    ['Redmi Note 14', 'Xiaomi', '2024-12-10'],
    ['iPhone 16 Pro', 'Apple', '2024-09-20'],
  ]);
  assert.ok(POPULAR.includes('Apple'));
  assert.equal(cleanName('Samsung  Galaxy A56'), 'Galaxy A56');
  assert.deepEqual(parseWikidata({}), []);
});

test('releases: quita el nombre de cualquier marca popular repetido', () => {
  assert.equal(cleanName('Huawei Mate 80'), 'Huawei Mate 80'); // sin la marca ya no se reconocería
  assert.equal(cleanName('Vivo X100'), 'Vivo X100');
  assert.equal(cleanName('Apple iPhone 16'), 'iPhone 16');
  assert.equal(cleanName('Google Pixel 9'), 'Pixel 9');
  assert.equal(cleanName('Apple'), 'Apple');
});
