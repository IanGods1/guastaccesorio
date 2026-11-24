import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyCount, addToCount, setCount, removeFromCount, countRows, countTotals, uncountedProducts, whatsappText, whatsappUrl, normalizePhone } from '../src/core/count.js';

const products = { a: { name: 'Cargador', category: 'Cargadores' }, b: { name: 'Bocina', category: 'Bocinas' }, c: { name: 'Gorra' } };
const stocks = { a: 19, b: 5, c: 3 };

test('count: lo contado se suma por producto y lo último contado va primero', () => {
  let c = emptyCount();
  c = addToCount(c, 'a', 5);
  c = addToCount(c, 'b', 2);
  c = addToCount(c, 'a', 15); // el mismo producto: se suma
  assert.equal(c.items.a, 20);
  assert.deepEqual(c.order, ['a', 'b']);
  c = setCount(c, 'b', 7);
  assert.equal(c.items.b, 7);
  c = setCount(c, 'b', 0); // cantidad 0 = quitar
  assert.deepEqual(Object.keys(c.items), ['a']);
  assert.deepEqual(removeFromCount(c, 'a').order, []);
});

test('count: filas, diferencias y productos sin contar', () => {
  let c = emptyCount();
  c = addToCount(c, 'a', 20);
  c = addToCount(c, 'b', 5);
  const rows = countRows(c, products, stocks);
  assert.deepEqual(rows.map((r) => [r.name, r.counted, r.system, r.diff]), [['Bocina', 5, 5, 0], ['Cargador', 20, 19, 1]]);
  assert.deepEqual(countTotals(rows), { products: 2, units: 25, different: 1 });
  const list = Object.entries(products).map(([id, p]) => ({ id, ...p }));
  assert.deepEqual(uncountedProducts(c, list, stocks).map((p) => p.name), ['Gorra']);
  assert.equal(countRows(addToCount(emptyCount(), 'zzz', 1), products, stocks)[0].gone, true);
});

test('count: texto y enlace de WhatsApp', () => {
  let c = addToCount(addToCount(emptyCount(), 'a', 20), 'b', 5);
  const rows = countRows(c, products, stocks);
  const text = whatsappText({ rows, uncounted: [{ name: 'Gorra' }], date: new Date(2026, 10, 24, 15, 40) });
  assert.match(text, /^\*Inventario\* · Guastaccesorio/);
  assert.match(text, /Contados: 2 productos · 25 unidades/);
  assert.match(text, /• Bocina: \*5\*\n/);
  assert.match(text, /• Cargador: \*20\* \(sistema 19, \+1\)/);
  assert.match(text, /Sin contar \(1\): Gorra/);
  assert.equal(normalizePhone('+502 5555-1234'), '50255551234');
  assert.equal(normalizePhone('123'), '');
  assert.match(whatsappUrl('hola ñ', '+502 5555-1234'), /^https:\/\/wa\.me\/50255551234\?text=hola%20%C3%B1$/);
  assert.match(whatsappUrl('x'), /^https:\/\/wa\.me\/\?text=x$/);
});
