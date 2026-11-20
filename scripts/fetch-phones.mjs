// Descarga los teléfonos lanzados en los últimos ~2 años (Wikidata) y guarda data/novedades.json.
// Lo ejecuta GitHub Actions todos los días; si falla, se conserva el archivo anterior.
import { readFileSync, writeFileSync } from 'node:fs';
import { parseWikidata, sparql } from '../src/core/releases.js';

const desde = new Date(Date.now() - 2 * 365 * 86400000).toISOString().slice(0, 10);
const res = await fetch('https://query.wikidata.org/sparql?format=json&query=' + encodeURIComponent(sparql(desde)), {
  headers: { Accept: 'application/sparql-results+json', 'User-Agent': 'guastaccesorio-novedades/1.0 (GitHub Actions)' },
  signal: AbortSignal.timeout(120000),
});
if (!res.ok) throw new Error(`Wikidata respondió ${res.status}`);
const json = await res.json();
const phones = parseWikidata(json);
console.log(`Filas: ${json.results.bindings.length}, teléfonos válidos: ${phones.length}`);
const brands = {};
for (const p of phones) brands[p.brand] = (brands[p.brand] ?? 0) + 1;
console.log(brands);
console.log(phones.slice(0, 15).map((p) => `${p.date} ${p.brand} ${p.name}`).join('\n'));
if (phones.length < 5) throw new Error('Muy pocos resultados: no se actualiza el archivo');

let old = {};
try { old = JSON.parse(readFileSync('data/novedades.json', 'utf8')); } catch {}
if (JSON.stringify(old.phones) !== JSON.stringify(phones)) {
  writeFileSync('data/novedades.json', JSON.stringify({ updated: new Date().toISOString().slice(0, 10), source: 'Wikidata', phones }, null, 1) + '\n');
  console.log('Archivo actualizado');
} else console.log('Sin cambios');
