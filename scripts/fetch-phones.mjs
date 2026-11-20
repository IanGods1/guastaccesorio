// Descarga los teléfonos lanzados en los últimos ~2 años (Wikidata) y guarda data/novedades.json.
// Lo ejecuta GitHub Actions todos los días; si falla, se conserva el archivo anterior.
import { readFileSync, writeFileSync } from 'node:fs';
import { mergeReleases, parseWikidata, parseWikipedia, sparql } from '../src/core/releases.js';

const desde = new Date(Date.now() - 2 * 365 * 86400000).toISOString().slice(0, 10);
const res = await fetch('https://query.wikidata.org/sparql?format=json&query=' + encodeURIComponent(sparql(desde)), {
  headers: { Accept: 'application/sparql-results+json', 'User-Agent': 'guastaccesorio-novedades/1.0 (GitHub Actions)' },
  signal: AbortSignal.timeout(120000),
});
if (!res.ok) throw new Error(`Wikidata respondió ${res.status}`);
const json = await res.json();
const wikidata = parseWikidata(json);

// Segunda fuente: las listas de Wikipedia "Mobile phones introduced in AAAA" (solo traen el año).
const wikipedia = [];
for (const year of [new Date().getFullYear(), new Date().getFullYear() - 1]) {
  try {
    const url = 'https://en.wikipedia.org/w/api.php?action=query&list=categorymembers&cmnamespace=0&cmlimit=500&format=json&cmtitle=' + encodeURIComponent(`Category:Mobile phones introduced in ${year}`);
    const r = await fetch(url, { headers: { 'User-Agent': 'guastaccesorio-novedades/1.0 (GitHub Actions)' }, signal: AbortSignal.timeout(60000) });
    const members = (await r.json()).query?.categorymembers ?? [];
    const found = parseWikipedia(members.map((m) => m.title), year);
    console.log(`Wikipedia ${year}: ${members.length} páginas, ${found.length} válidas`);
    wikipedia.push(found);
  } catch (e) {
    console.log(`Wikipedia ${year}: no se pudo leer (${e.message})`);
  }
}
const phones = mergeReleases([wikidata, ...wikipedia]);
console.log(`Filas: ${json.results.bindings.length}, teléfonos válidos: ${phones.length}`);
const brands = {};
for (const p of phones) brands[p.brand] = (brands[p.brand] ?? 0) + 1;
console.log(brands);
console.log(phones.slice(0, 40).map((p) => `${p.date ?? p.year} ${p.brand} ${p.name}`).join('\n'));
if (phones.length < 5) throw new Error('Muy pocos resultados: no se actualiza el archivo');

let old = {};
try { old = JSON.parse(readFileSync('data/novedades.json', 'utf8')); } catch {}
if (JSON.stringify(old.phones) !== JSON.stringify(phones)) {
  writeFileSync('data/novedades.json', JSON.stringify({ updated: new Date().toISOString().slice(0, 10), source: 'Wikidata y Wikipedia', phones }, null, 1) + '\n');
  console.log('Archivo actualizado');
} else console.log('Sin cambios');
