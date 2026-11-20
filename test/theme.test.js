import test from 'node:test';
import assert from 'node:assert/strict';
import { PALETTES, DEFAULT_COLOR, hexToHsl, hslToHex, contrast, resolveColor, tokens, themeCss, barColor } from '../src/core/theme.js';

test('conversión de colores', () => {
  assert.equal(hslToHex(0, 100, 50), '#ff0000');
  assert.equal(hslToHex(120, 100, 25), '#008000');
  assert.equal(hslToHex(0, 0, 100), '#ffffff');
  const hsl = hexToHsl('#0a2342');
  assert.ok(Math.abs(hsl.h - 213) < 1 && Math.abs(hsl.s - 74) < 2 && Math.abs(hsl.l - 15) < 1);
  assert.equal(hexToHsl('rojo'), null);
  assert.ok(contrast('#ffffff', '#000000') > 20.9);
  assert.ok(contrast('#777777', '#ffffff') > 4.4 && contrast('#777777', '#ffffff') < 4.6);
});

test('el azul marino por defecto es el mismo de antes (diferencia imperceptible)', () => {
  const channels = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const before = channels('#0a2342');
  for (const v of [tokens(DEFAULT_COLOR, 'light')['--navy'], barColor(DEFAULT_COLOR)]) {
    channels(v).forEach((c, i) => assert.ok(Math.abs(c - before[i]) <= 2, `${v} difiere de #0a2342`));
  }
});

test('colores de la lista, personalizados y valores inválidos', () => {
  assert.deepEqual(resolveColor('verde'), { hue: 150, sat: 64, light: 24 });
  const custom = resolveColor('#ff6600');
  assert.ok(Math.abs(custom.hue - 24) < 1 && custom.sat === 85); // la intensidad se limita
  assert.deepEqual(resolveColor('nada'), { hue: 213, sat: 74, light: 15 });
  assert.deepEqual(resolveColor(null), { hue: 213, sat: 74, light: 15 });
  assert.equal(new Set(PALETTES.map((p) => p.id)).size, PALETTES.length);
});

/** Revisa que el texto se lea bien en cada combinación de colores. */
function assertReadable(value) {
  const L = tokens(value, 'light');
  const D = tokens(value, 'dark');
  const check = (a, b, min, what) => assert.ok(contrast(a, b) >= min, `${value}: ${what} = ${contrast(a, b).toFixed(2)} (mínimo ${min})`);
  // Claro
  check('#ffffff', L['--navy'], 7.5, 'texto blanco sobre la barra');
  check('#ffffff', L['--navy2'], 4.5, 'texto blanco sobre el final del degradado');
  check(L['--on-primary'], L['--primary'], 7.5, 'texto de los botones (claro)');
  check(L['--on-primary-container'], L['--primary-container'], 7, 'texto sobre el color suave (claro)');
  check(L['--on-surface'], L['--bg'], 12, 'texto principal sobre el fondo (claro)');
  check(L['--on-surface'], L['--surface'], 12, 'texto principal sobre las tarjetas (claro)');
  check(L['--muted'], L['--bg'], 5, 'texto secundario sobre el fondo (claro)');
  check(L['--muted'], L['--surface-variant'], 4.5, 'texto secundario sobre tarjetas grises (claro)');
  check(L['--primary'], L['--bg'], 7, 'enlaces y títulos (claro)');
  // Oscuro
  check('#ffffff', D['--navy'], 8, 'texto blanco sobre la barra (oscuro)');
  check('#ffffff', D['--navy2'], 6, 'texto blanco sobre el degradado (oscuro)');
  check(D['--on-primary'], D['--primary'], 7, 'texto de los botones (oscuro)');
  check(D['--on-primary-container'], D['--primary-container'], 7, 'texto sobre el color suave (oscuro)');
  check(D['--on-surface'], D['--bg'], 12, 'texto principal sobre el fondo (oscuro)');
  check(D['--on-surface'], D['--surface'], 12, 'texto principal sobre las tarjetas (oscuro)');
  check(D['--muted'], D['--bg'], 7, 'texto secundario sobre el fondo (oscuro)');
  check(D['--muted'], D['--surface-variant'], 4.5, 'texto secundario sobre tarjetas (oscuro)');
  check(D['--primary'], D['--bg'], 7, 'enlaces y títulos sobre el fondo (oscuro)');
  check(D['--primary'], D['--surface'], 6, 'enlaces y títulos sobre las tarjetas (oscuro)');
}

test('todos los colores de la lista se leen bien', () => {
  for (const p of PALETTES) assertReadable(p.id);
});

test('cualquier color personalizado se lee bien (se prueban 360 tonos y varias intensidades)', () => {
  for (let h = 0; h < 360; h += 3) {
    for (const s of [5, 30, 60, 100]) assertReadable(hslToHex(h, s, 50));
  }
  for (const hex of ['#ffff00', '#00ff00', '#ffffff', '#000000', '#808080', '#ff00ff', '#ffa500']) assertReadable(hex);
});

test('hoja de estilo: claro, oscuro y según el sistema', () => {
  const css = themeCss('verde');
  assert.match(css, /^:root\{--navy:#[0-9a-f]{6}/);
  assert.match(css, /:root\[data-theme='dark'\]\{/);
  assert.match(css, /@media \(prefers-color-scheme: dark\)\{:root:not\(\[data-theme='light'\]\)\{/);
  assert.notEqual(themeCss('verde'), themeCss('granate'));
  assert.equal(themeCss('verde'), themeCss('verde'));
});
