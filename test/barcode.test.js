import test from 'node:test';
import assert from 'node:assert/strict';
import { checkDigit, isValidEan13, normalizeCode, nextBarcode, ean13Modules } from '../src/core/barcode.js';

test('barcode: dígito verificador y validación', () => {
  assert.equal(checkDigit('590123412345'), '7'); // ejemplo conocido 5901234123457
  assert.equal(isValidEan13('5901234123457'), true);
  assert.equal(isValidEan13('5901234123458'), false);
  assert.equal(isValidEan13('123'), false);
  assert.equal(normalizeCode(' 5901234 123457 '), '5901234123457');
  assert.equal(normalizeCode('036000291452'), '0036000291452'); // UPC-A
  assert.equal(normalizeCode('036000291453'), null);
  assert.equal(normalizeCode('abc'), null);
});

test('barcode: códigos internos únicos y consecutivos', () => {
  const first = nextBarcode([]);
  assert.equal(first.length, 13);
  assert.ok(first.startsWith('2') && isValidEan13(first));
  assert.equal(first.slice(1, 12), '00000000001');
  const seen = new Set();
  let list = [];
  for (let i = 0; i < 500; i++) {
    const c = nextBarcode(list);
    assert.ok(isValidEan13(c));
    assert.ok(!seen.has(c), 'repetido ' + c);
    seen.add(c);
    list = [...list, c];
  }
  // ignora códigos de fábrica y inválidos
  const alto = '200000000099' + checkDigit('200000000099');
  assert.equal(nextBarcode(['5901234123457', alto, 'basura']).slice(1, 12), '00000000100');
});

test('barcode: módulos del EAN-13', () => {
  const m = ean13Modules('5901234123457');
  assert.equal(m.length, 95);
  assert.equal(m.slice(0, 3), '101');
  assert.equal(m.slice(45, 50), '01010');
  assert.equal(m.slice(92), '101');
  assert.throws(() => ean13Modules('1234567890123'));
});
