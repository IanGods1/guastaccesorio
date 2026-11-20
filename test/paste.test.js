import test from 'node:test';
import assert from 'node:assert/strict';
import { parsePasted, splitModels, buildPrompt, similarExisting, kindLabel } from '../src/core/paste.js';

const names = (g) => g.models.map((m) => m.name);
const summary = (r) => r.groups.map((g) => [g.type, g.variant, names(g).join(' | '), g.models[0]?.brand ?? '', g.note]);

test('formato pedido a la IA: grupos con marca y nota debajo', () => {
  const r = parsePasted(`Case: iPhone 13, iPhone 14, iPhone 15
Marca: Apple
Nota: La cámara del 15 queda un poco justa

Vidrio normal: iPhone 13, iPhone 14
Marca: Apple

Vidrio 9D: iPhone 13, iPhone 14, iPhone 15
Marca: Apple

Vidrio privacy: iPhone 13, iPhone 14
Marca: Apple`);
  assert.deepEqual(summary(r), [
    ['CASE', 'NORMAL', 'iPhone 13 | iPhone 14 | iPhone 15', 'Apple', 'La cámara del 15 queda un poco justa'],
    ['GLASS', 'NORMAL', 'iPhone 13 | iPhone 14', 'Apple', ''],
    ['GLASS', 'D9', 'iPhone 13 | iPhone 14 | iPhone 15', 'Apple', ''],
    ['GLASS', 'PRIVACY', 'iPhone 13 | iPhone 14', 'Apple', ''],
  ]);
  assert.deepEqual(r.ignored, []);
  assert.deepEqual(r.errors, []);
});

test('respuesta con Markdown, viñetas, números y emojis', () => {
  const r = parsePasted(`¡Claro! Aquí tienes la información:

**Case:** iPhone 13, iPhone 14
- **Marca:** Apple
- Nota: Mismo módulo de cámara

1. ✅ **Vidrio 9D:** iPhone 13, iPhone 14

Espero que sirva.`);
  assert.deepEqual(summary(r), [
    ['CASE', 'NORMAL', 'iPhone 13 | iPhone 14', 'Apple', 'Mismo módulo de cámara'],
    ['GLASS', 'D9', 'iPhone 13 | iPhone 14', '', ''],
  ]);
  assert.deepEqual(r.ignored, ['¡Claro! Aquí tienes la información:', 'Espero que sirva.']);
});

test('todo en una línea con "|"', () => {
  const r = parsePasted('Case: Galaxy A54, Galaxy A55 | Marca: Samsung | Nota: botones distintos\nVidrio privado: Galaxy A54 | Galaxy A55 | marca: samsung');
  assert.deepEqual(summary(r), [
    ['CASE', 'NORMAL', 'Galaxy A54 | Galaxy A55', 'Samsung', 'botones distintos'],
    ['GLASS', 'PRIVACY', 'Galaxy A54 | Galaxy A55', 'Samsung', ''],
  ]);
});

test('lista con viñetas debajo del tipo', () => {
  const r = parsePasted(`Case:
- iPhone 13
- iPhone 14
- iPhone 15 (la cámara es más grande)
Marca: Apple`);
  assert.deepEqual(summary(r), [['CASE', 'NORMAL', 'iPhone 13 | iPhone 14 | iPhone 15', 'Apple', 'iPhone 15: la cámara es más grande']]);
});

test('abreviaturas: iPhone 13/14/15, Galaxy A54/A55, Redmi Note 12/13', () => {
  assert.deepEqual(splitModels('iPhone 13/14/15').models, ['iPhone 13', 'iPhone 14', 'iPhone 15']);
  assert.deepEqual(splitModels('iPhone 13, 14, 15 Pro').models, ['iPhone 13', 'iPhone 14', 'iPhone 15 Pro']);
  assert.deepEqual(splitModels('Galaxy A54/A55').models, ['Galaxy A54', 'Galaxy A55']);
  assert.deepEqual(splitModels('Redmi Note 12/13').models, ['Redmi Note 12', 'Redmi Note 13']);
  assert.deepEqual(splitModels('Galaxy S22, S23+').models, ['Galaxy S22', 'Galaxy S23+']);
  assert.deepEqual(splitModels('iPhone 13 y iPhone 14').models, ['iPhone 13', 'iPhone 14']);
  // modelos cortos sin prefijo se respetan tal cual (marca elegida aparte)
  assert.deepEqual(splitModels('A54, A55, A34').models, ['A54', 'A55', 'A34']);
  // no se mezclan marcas ni se repiten
  assert.deepEqual(splitModels('iPhone 13, Galaxy A54, iphone 13').models, ['iPhone 13', 'Galaxy A54']);
  assert.deepEqual(splitModels('Nothing Phone (1), Pixel 8.').models, ['Nothing Phone (1)', 'Pixel 8']);
});

test('marca y nota sueltas al inicio valen para todos los grupos', () => {
  const r = parsePasted(`Marca: Samsung
Nota: Verificar con el producto

Case: A54, A55
Vidrio 9D: A54, A55
Nota: Solo 9D`);
  assert.deepEqual(summary(r), [
    ['CASE', 'NORMAL', 'A54 | A55', 'Samsung', 'Verificar con el producto'],
    ['GLASS', 'D9', 'A54 | A55', 'Samsung', 'Solo 9D'],
  ]);
});

test('nombre del grupo', () => {
  const r = parsePasted('Case: iPhone 13, iPhone 14\nNombre: Case iPhone 13 y 14');
  assert.equal(r.groups[0].name, 'Case iPhone 13 y 14');
});

test('lo que no es un modelo se ignora y se avisa', () => {
  const r = parsePasted(`Case: no hay modelos compatibles confirmados
Vidrio normal: iPhone 13, iPhone 14
Vidrio 9D:
Resumen: los dos son casi iguales`);
  assert.deepEqual(summary(r), [['GLASS', 'NORMAL', 'iPhone 13 | iPhone 14', '', '']]);
  assert.ok(r.ignored.includes('no hay modelos compatibles confirmados'));
  assert.ok(r.ignored.includes('Resumen: los dos son casi iguales'));
  assert.ok(r.warnings.some((w) => /no tiene modelos/.test(w)));
});

test('tabla de Markdown', () => {
  const r = parsePasted(`| tipo | grupo | modelo | nota | marca | variante |
|---|---|---|---|---|---|
| Case | Case iPhone | iPhone 13 | justa | Apple | |
| Case | Case iPhone | iPhone 14 | | Apple | |
| Vidrio templado | Vidrio 9D iPhone | iPhone 13 | | Apple | 9D |
| Vidrio templado | Vidrio 9D iPhone | iPhone 14 | | Apple | 9D |`);
  assert.deepEqual(r.groups.map((g) => [g.type, g.variant, g.name, names(g).join(','), g.note]), [
    ['CASE', 'NORMAL', 'Case iPhone', 'iPhone 13,iPhone 14', 'justa'],
    ['GLASS', 'D9', 'Vidrio 9D iPhone', 'iPhone 13,iPhone 14', ''],
  ]);
  assert.equal(r.groups[0].models[0].brand, 'Apple');
});

test('CSV (coma, punto y coma o tabulación) y modelos sueltos', () => {
  const csv = 'tipo,grupo,modelo,nota,marca\nCase,G1,iPhone 13,,Apple\nCase,G1,iPhone 14,,Apple\n,,Moto G84,,Motorola\nAlgo,G2,X,,';
  const r = parsePasted(csv);
  assert.equal(r.groups.length, 1);
  assert.deepEqual(r.loose, [{ name: 'Moto G84', brand: 'Motorola' }]);
  assert.equal(r.errors.length, 1);
  assert.equal(parsePasted(csv.replaceAll(',', ';')).groups.length, 1);
  assert.equal(parsePasted(csv.replaceAll(',', '\t')).groups.length, 1);
});

test('una línea con muchos "|" no se confunde con una tabla', () => {
  const r = parsePasted('Case: iPhone 13, iPhone 14 | Marca: Apple | Nota: x | Nombre: Mi grupo\nVidrio 9D: iPhone 13 | iPhone 14 | Marca: Apple | Nota: y | Nombre: Otro');
  assert.equal(r.groups.length, 2);
  assert.equal(r.groups[0].name, 'Mi grupo');
});

test('texto vacío o sin formato', () => {
  assert.deepEqual(parsePasted('').groups, []);
  assert.deepEqual(parsePasted('   \n  ').groups, []);
  const r = parsePasted('Hola, no entendí tu pregunta. ¿Puedes repetirla?');
  assert.deepEqual(r.groups, []);
  assert.equal(r.ignored.length, 1);
  assert.deepEqual(parsePasted(null).groups, []);
});

test('bloque de código y nombres con comillas', () => {
  const r = parsePasted('```\nCase: "iPhone 13", “iPhone 14”\nMarca: Apple\n```');
  assert.deepEqual(summary(r), [['CASE', 'NORMAL', 'iPhone 13 | iPhone 14', 'Apple', '']]);
});

test('grupos parecidos que ya existen', () => {
  const data = {
    models: { 1: { id: '1', name: 'iPhone 13', normalized: 'iphone13' }, 2: { id: '2', name: 'iPhone 14', normalized: 'iphone14' }, 3: { id: '3', name: 'iPhone 15', normalized: 'iphone15' } },
    groups: {
      1: { id: '1', type: 'CASE', variant: 'NORMAL', name: 'Case 13/14', models: ['1', '2'] },
      2: { id: '2', type: 'GLASS', variant: 'NORMAL', name: 'Vidrio 13/14', models: ['1', '2'] },
      3: { id: '3', type: 'CASE', variant: 'NORMAL', name: 'Solo 15', models: ['3'] },
    },
  };
  const g = { type: 'CASE', variant: 'NORMAL', models: [{ name: 'iPhone 13' }, { name: 'iPhone 14' }, { name: 'iPhone 15' }] };
  assert.deepEqual(similarExisting(g, data), [{ name: 'Case 13/14', shared: 2 }]);
  assert.deepEqual(similarExisting({ ...g, type: 'GLASS', variant: 'D9' }, data), []);
  assert.equal(kindLabel({ type: 'GLASS', variant: 'D9' }), 'Vidrio 9D');
  assert.equal(kindLabel({ type: 'CASE', variant: 'NORMAL' }), 'Case');
});

test('la pregunta para la IA lleva el modelo y el formato que entiende la app', () => {
  const p = buildPrompt('  iPhone 13 ');
  assert.match(p, /este modelo: iPhone 13\n/);
  assert.match(p, /Vidrio 9D:/);
  assert.match(p, /Vidrio privacy:/);
  assert.match(p, /Si no estás seguro de un modelo, NO lo incluyas/);
  assert.match(buildPrompt(''), /\[ESCRIBE AQUÍ EL MODELO/);
  // lo que la propia pregunta muestra como ejemplo se puede leer (los marcadores no son modelos)
  const example = parsePasted(p.slice(p.indexOf('Case: modelo 1'), p.indexOf('Reglas:')));
  assert.deepEqual(example.groups, []);
});
