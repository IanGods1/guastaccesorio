// Lanzamientos: convierte la respuesta de Wikidata en una lista de teléfonos nuevos de las marcas populares.
import { detect, canonical, OTHER } from './brands.js';
import { normalize } from './text.js';

/** Marcas que se muestran (las más populares). */
export const POPULAR = ['Apple', 'Samsung', 'Xiaomi', 'Motorola', 'Huawei', 'Honor', 'Google', 'OnePlus', 'Oppo', 'Realme', 'Vivo', 'Nokia', 'Infinix', 'Tecno'];

/** Consulta a Wikidata: teléfonos con fabricante y fecha, desde `desde` (AAAA-MM-DD). */
export function sparql(desde) {
  return `SELECT ?item ?itemLabel ?mfrLabel ?date WHERE {
  ?item wdt:P31/wdt:P279* wd:Q19723451 .
  ?item wdt:P176 ?mfr .
  { ?item wdt:P577 ?date } UNION { ?item wdt:P571 ?date }
  FILTER(?date >= "${desde}T00:00:00Z"^^xsd:dateTime)
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
} LIMIT 1500`;
}

/** Quita el nombre del fabricante repetido al principio ("Samsung Galaxy S25" → "Galaxy S25"). */
export function cleanName(label) {
  return label
    .replace(/^(samsung|apple|motorola|xiaomi)\s+(?=\S)/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** @returns {{name:string, brand:string, date:string}[]} más nuevos primero, sin repetidos, solo marcas populares */
export function parseWikidata(json, { max = 150 } = {}) {
  const seen = new Map();
  for (const b of json?.results?.bindings ?? []) {
    const label = b.itemLabel?.value ?? '';
    const date = (b.date?.value ?? '').slice(0, 10);
    if (!label || /^Q\d+$/.test(label) || !/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    const name = cleanName(label);
    if (!/\d/.test(name) || name.length > 40) continue; // series sin número ("iPhone") no sirven
    let brand = detect(name);
    if (brand === OTHER) brand = canonical(b.mfrLabel?.value ?? '') || OTHER;
    if (!POPULAR.includes(brand)) continue;
    const key = normalize(name);
    const prev = seen.get(key);
    if (!prev || date < prev.date) seen.set(key, { name, brand, date }); // la fecha más temprana
  }
  return [...seen.values()].sort((a, b) => b.date.localeCompare(a.date) || a.name.localeCompare(b.name)).slice(0, max);
}
