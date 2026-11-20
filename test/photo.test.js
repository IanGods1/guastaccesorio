import test from 'node:test';
import assert from 'node:assert/strict';
import { photoToText } from '../src/core/photo.js';
import { parsePasted } from '../src/core/paste.js';

test('photo: una línea = un grupo (separadores variados)', () => {
  const r = photoToText('1. iPhone 13, iPhone 14\n• Galaxy A54 / Galaxy A55\nMoto G54 - Moto G84\nSolo uno', 'Case');
  assert.equal(r.text, 'Case: iPhone 13, iPhone 14\nCase: Galaxy A54, Galaxy A55\nCase: Moto G54, Moto G84');
  assert.equal(r.groups, 3);
});

test('photo: un bloque con un modelo por línea = un grupo', () => {
  const r = photoToText('Vidrio 9D\n\nA54\nA55\nA56\n\nRedmi 12\nRedmi 13\n', 'Vidrio 9D');
  assert.equal(r.text, 'Vidrio 9D: A54, A55, A56\nVidrio 9D: Redmi 12, Redmi 13');
});

test('photo: lo que sale se entiende en "Pegar información"', () => {
  const t = photoToText('iPhone 13 / iPhone 14 / iPhone 15\nGalaxy A54 + Galaxy A55', 'Vidrio privacy').text;
  const p = parsePasted(t);
  assert.equal(p.groups.length, 2);
  assert.equal(p.groups[0].variant, 'PRIVACY');
  assert.deepEqual(p.groups[0].models.map((m) => m.name), ['iPhone 13', 'iPhone 14', 'iPhone 15']);
});

test('photo: ruido y texto vacío', () => {
  assert.equal(photoToText('', 'Case').groups, 0);
  assert.equal(photoToText('~~ ,, \n lista de precios', 'Case').groups, 0);
});
