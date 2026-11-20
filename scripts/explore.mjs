const run = async (name, q) => {
  const res = await fetch('https://query.wikidata.org/sparql?format=json&query=' + encodeURIComponent(q), { headers: { Accept: 'application/sparql-results+json', 'User-Agent': 'guastaccesorio-novedades/1.0' }, signal: AbortSignal.timeout(100000) });
  const j = await res.json();
  console.log('==', name, j.results.bindings.length);
  for (const b of j.results.bindings.slice(0, 25)) console.log(Object.values(b).map((v) => v.value).join(' | '));
};
await run('iPhone 16 Pro clases', `SELECT ?item ?itemLabel ?clsLabel ?cls ?mfrLabel ?date WHERE { ?item rdfs:label "iPhone 16 Pro"@en . OPTIONAL{?item wdt:P31 ?cls} OPTIONAL{?item wdt:P176 ?mfr} OPTIONAL{?item wdt:P577 ?date} SERVICE wikibase:label { bd:serviceParam wikibase:language "en". } }`);
await run('Galaxy S25 clases', `SELECT ?item ?itemLabel ?clsLabel ?cls ?mfrLabel ?date WHERE { ?item rdfs:label "Samsung Galaxy S25"@en . OPTIONAL{?item wdt:P31 ?cls} OPTIONAL{?item wdt:P176 ?mfr} OPTIONAL{?item wdt:P577 ?date} SERVICE wikibase:label { bd:serviceParam wikibase:language "en". } }`);
await run('clases de telefonos Apple desde 2024', `SELECT ?clsLabel ?cls (COUNT(?item) AS ?n) WHERE { ?item wdt:P176 wd:Q312 . ?item wdt:P31 ?cls . ?item wdt:P577 ?d . FILTER(?d >= "2023-01-01T00:00:00Z"^^xsd:dateTime) SERVICE wikibase:label { bd:serviceParam wikibase:language "en". } } GROUP BY ?clsLabel ?cls ORDER BY DESC(?n) LIMIT 20`);
