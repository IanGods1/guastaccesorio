import test from 'node:test';
import assert from 'node:assert/strict';
import {
  TRUSTED_DOMAINS, isTrusted, normalizeUrl, buildRequest, extractJson, normalizeResult, collectEvidence,
  gradeCluster, analyze, runResearch, describeApiError, estimateCost, sumUsage, AiError, GRADES,
} from '../src/core/ai.js';

const D = (h, w, d) => ({ height: h, width: w, depth: d });
const model = (name, dims, screen = 6.1, brand = 'Apple') => ({ name, brand, dimensions: dims, screen });
const cluster = (over = {}) => ({
  kind: 'case',
  models: [model('iPhone 14', D(146.7, 71.5, 7.8))],
  explicit: [{ url: 'https://www.spigen.com/products/case-iphone-14', quote: 'Compatible with iPhone 14 and iPhone 13' }],
  specSources: ['https://www.gsmarena.com/apple_iphone_14-11861.php'],
  differences: [],
  summary: '',
  ...over,
});
const target = { name: 'iPhone 13', brand: 'Apple', found: true, dimensions: D(146.7, 71.5, 7.65), screen: 6.1, sources: [] };
const evidenceWith = (...urls) => collectEvidence([{ content: [{ type: 'web_search_tool_result', content: urls.map((url) => ({ type: 'web_search_result', url, title: 't' })) }] }]);
const REAL = evidenceWith('https://www.spigen.com/products/case-iphone-14', 'https://www.gsmarena.com/apple_iphone_14-11861.php');

test('sitios confiables: solo los de la lista (y sus subdominios)', () => {
  assert.ok(isTrusted('https://www.gsmarena.com/x.php'));
  assert.ok(isTrusted('https://m.gsmarena.com/x.php'));
  assert.ok(isTrusted('https://support.apple.com/specs'));
  assert.ok(!isTrusted('https://evilgsmarena.com/x'));
  assert.ok(!isTrusted('https://gsmarena.com.evil.com/x'));
  assert.ok(!isTrusted('https://blog-random.com/iphone-13'));
  assert.ok(!isTrusted('javascript:alert(1)'));
  assert.ok(!isTrusted('not a url'));
  assert.equal(normalizeUrl('https://www.Spigen.com/a/b/?x=1#y'), normalizeUrl('http://spigen.com/a/b'));
});

test('pedido a Claude: búsqueda restringida a sitios confiables y límite de búsquedas', () => {
  const req = buildRequest({ model: 'claude-opus-5-5', targetName: 'iPhone 13', targetBrand: 'Apple', kinds: ['case'], maxUses: 4, today: '2026-11-20' });
  assert.equal(req.model, 'claude-opus-5-5');
  assert.equal(req.tools.length, 1);
  assert.equal(req.tools[0].type, 'web_search_20260209');
  assert.equal(req.tools[0].max_uses, 4);
  assert.deepEqual(req.tools[0].allowed_domains, TRUSTED_DOMAINS);
  assert.ok(!('blocked_domains' in req.tools[0]));
  assert.ok(!('tool_choice' in req) && !('temperature' in req) && !('thinking' in req));
  const text = req.messages[0].content;
  assert.match(text, /iPhone 13 \(marca: Apple\)/);
  assert.match(text, /CASE/);
  assert.doesNotMatch(text, /VIDRIO TEMPLADO/);
  const both = buildRequest({ model: 'm', targetName: 'A54', kinds: ['case', 'glass'] });
  assert.match(both.messages[0].content, /VIDRIO TEMPLADO/);
});

test('leer el JSON de la respuesta', () => {
  const obj = { target: { name: 'X' }, clusters: [] };
  assert.deepEqual(extractJson('```json\n' + JSON.stringify(obj) + '\n```'), obj);
  assert.deepEqual(extractJson('Aquí está:\n```json\n' + JSON.stringify(obj) + '\n```\nListo.'), obj);
  assert.deepEqual(extractJson('Claro. ' + JSON.stringify(obj) + ' Fin'), obj);
  assert.deepEqual(extractJson(JSON.stringify(obj)), obj);
  assert.equal(extractJson('sin json'), null);
  assert.equal(extractJson('{roto'), null);
});

test('normalizar: no se confía en la forma de lo que devuelve la IA', () => {
  assert.equal(normalizeResult(null), null);
  const r = normalizeResult({
    target: { name: ' iPhone 13 ', brand: 'apple', dimensions_mm: { height: '146,7', width: 71.5, depth: 7.65 }, screen_inches: '6.1' },
    clusters: [
      { kind: 'otro', models: [{ name: 'X' }] },
      { kind: 'case', models: [{ name: 'iPhone 14', brand: 'apple' }, { name: 'IPHONE14' }, { name: 'iPhone 13' }, { name: '' }, null] },
      { kind: 'glass', models: [] },
      { kind: 'glass', models: [{ name: 'iPhone 14' }], explicit_compat_sources: [{ url: 'no-es-url', quote: 'x' }, { url: 'https://spigen.com/a', quote: 'y'.repeat(500) }] },
    ],
  });
  assert.equal(r.target.name, 'iPhone 13');
  assert.equal(r.target.brand, 'Apple');
  assert.deepEqual(r.target.dimensions, D(146.7, 71.5, 7.65));
  assert.equal(r.target.screen, 6.1);
  assert.equal(r.clusters.length, 2);
  assert.deepEqual(r.clusters[0].models.map((m) => m.name), ['iPhone 14']); // sin repetidos ni el propio objetivo
  assert.equal(r.clusters[1].explicit.length, 1);
  assert.equal(r.clusters[1].explicit[0].quote.length, 300);
});

test('confirmada: fuente confiable real que nombra los modelos + medidas que coinciden', () => {
  const g = gradeCluster(cluster(), target, REAL);
  assert.equal(g.grade, GRADES.confirmed);
  assert.equal(g.explicitOk, 1);
  assert.equal(g.dimsOk, true);
  assert.deepEqual(g.warnings, []);
});

test('un enlace que NO salió de la búsqueda real no confirma nada', () => {
  const g = gradeCluster(cluster(), target, evidenceWith('https://www.gsmarena.com/apple_iphone_14-11861.php'));
  assert.notEqual(g.grade, GRADES.confirmed);
  assert.equal(g.explicitOk, 0);
  assert.ok(g.warnings.some((w) => /no apareció en la búsqueda real/.test(w)));
});

test('si no se puede comprobar de dónde vienen los enlaces, nunca queda confirmada', () => {
  const g = gradeCluster(cluster(), target, collectEvidence([{ content: [{ type: 'text', text: 'hola' }] }]));
  assert.notEqual(g.grade, GRADES.confirmed);
  assert.ok(g.warnings.some((w) => /No se pudo comprobar/.test(w)));
});

test('la cita debe nombrar al modelo objetivo y a los demás', () => {
  for (const quote of ['Compatible with iPhone 14', 'Great case for iPhone 13', 'Funda bonita', '']) {
    const g = gradeCluster(cluster({ explicit: [{ url: 'https://www.spigen.com/products/case-iphone-14', quote }] }), target, REAL);
    assert.notEqual(g.grade, GRADES.confirmed, quote);
  }
});

test('fuentes que no son de la lista confiable se descartan', () => {
  const g = gradeCluster(
    cluster({ explicit: [{ url: 'https://blog-random.com/post', quote: 'iPhone 13 and iPhone 14 share a case' }], specSources: ['https://foro.com/x'] }),
    target,
    evidenceWith('https://blog-random.com/post', 'https://foro.com/x'),
  );
  assert.equal(g.grade, GRADES.unverified);
  assert.equal(g.sources.length, 0);
  assert.ok(g.warnings.some((w) => /no estar en la lista de sitios confiables/.test(w)));
});

test('medidas distintas: el ejemplo iPhone 13 / iPhone 15 queda como probable con aviso', () => {
  const c = cluster({ models: [model('iPhone 15', D(147.6, 71.6, 7.8))], explicit: [{ url: 'https://www.spigen.com/products/case-iphone-14', quote: 'iPhone 13, iPhone 14 and iPhone 15 case' }] });
  const g = gradeCluster(c, target, REAL);
  assert.equal(g.grade, GRADES.probable); // el fabricante lo lista, pero las medidas no coinciden
  assert.equal(g.dimsOk, false);
  assert.ok(g.warnings.some((w) => /iPhone 15: el alto difiere 0.9 mm/.test(w)));
});

test('con diferencias avisadas nunca queda confirmada', () => {
  const g = gradeCluster(cluster({ differences: ['El módulo de cámara es más grande'] }), target, REAL);
  assert.equal(g.grade, GRADES.probable);
  assert.ok(g.warnings.some((w) => /Diferencia: El módulo de cámara/.test(w)));
});

test('sin evidencia y sin medidas: por verificar', () => {
  const g = gradeCluster(cluster({ models: [model('iPhone 14', null)], explicit: [], specSources: [] }), target, REAL);
  assert.equal(g.grade, GRADES.unverified);
});

test('vidrio: cuenta el tamaño de pantalla', () => {
  const ok = gradeCluster(cluster({ kind: 'glass', models: [model('iPhone 14', D(146.7, 71.5, 7.8), 6.1)] }), target, REAL);
  assert.equal(ok.grade, GRADES.confirmed);
  const bad = gradeCluster(cluster({ kind: 'glass', models: [model('iPhone 14 Plus', D(146.7, 71.5, 7.8), 6.7)] }), target, REAL);
  assert.equal(bad.dimsOk, false);
  assert.ok(bad.warnings.some((w) => /la pantalla es de 6.7"/.test(w)));
  // el grosor no importa en un vidrio
  const thick = gradeCluster(cluster({ kind: 'glass', models: [model('iPhone 14', D(146.7, 71.5, 9.9), 6.1)] }), target, REAL);
  assert.equal(thick.dimsOk, true);
});

test('evidencia: resultados anidados (filtrado dinámico) y citas', () => {
  const ev = collectEvidence([
    { content: [
      { type: 'server_tool_use', name: 'web_search', caller: { type: 'code_execution_20260120' }, input: { query: 'x' } },
      { type: 'web_search_tool_result', caller: { type: 'code_execution_20260120' }, content: [{ type: 'web_search_result', url: 'https://www.gsmarena.com/a.php' }] },
      { type: 'web_search_tool_result', content: { type: 'web_search_tool_result_error', error_code: 'unavailable' } },
    ] },
    { content: [{ type: 'text', text: 'dato', citations: [{ type: 'web_search_result_location', url: 'https://spigen.com/p/1/' }] }] },
  ]);
  assert.ok(ev.canVerify);
  assert.ok(ev.has('https://gsmarena.com/a.php'));
  assert.ok(ev.has('https://www.spigen.com/p/1'));
  assert.ok(!ev.has('https://www.spigen.com/p/2'));
});

test('análisis completo de una respuesta, ordenado por confianza', () => {
  const json = {
    target: { name: 'iPhone 13', brand: 'Apple', dimensions_mm: { height: 146.7, width: 71.5, depth: 7.65 }, screen_inches: 6.1 },
    clusters: [
      { kind: 'case', models: [{ name: 'iPhone 15', dimensions_mm: { height: 147.6, width: 71.6, depth: 7.8 } }], explicit_compat_sources: [], spec_sources: ['https://www.gsmarena.com/apple_iphone_15-12557.php'] },
      { kind: 'case', models: [{ name: 'iPhone 14', dimensions_mm: { height: 146.7, width: 71.5, depth: 7.8 } }],
        explicit_compat_sources: [{ url: 'https://www.spigen.com/p/1', quote: 'Fits iPhone 13 / iPhone 14' }], spec_sources: [] },
    ],
  };
  const responses = [{ content: [
    { type: 'web_search_tool_result', content: [{ url: 'https://www.spigen.com/p/1' }, { url: 'https://www.gsmarena.com/apple_iphone_15-12557.php' }] },
    { type: 'text', text: '```json\n' + JSON.stringify(json) + '\n```' },
  ] }];
  const a = analyze(responses, responses[0].content[1].text);
  assert.deepEqual(a.clusters.map((c) => [c.models[0].name, c.grade]), [['iPhone 14', 'confirmed'], ['iPhone 15', 'unverified']]);
  assert.equal(analyze(responses, 'no json'), null);
});

// ---------------------------------------------------------------- Ejecución

const fakeClient = (...replies) => {
  const calls = [];
  return {
    calls,
    messages: { create: async (params, opts) => { calls.push({ params: structuredClone(params), opts }); const r = replies.shift(); if (r instanceof Error) throw r; return r; } },
  };
};
const reply = (over) => ({ stop_reason: 'end_turn', content: [{ type: 'text', text: '{"ok":1}' }], usage: { input_tokens: 1000, output_tokens: 200, server_tool_use: { web_search_requests: 2 } }, ...over });

test('ejecución: continúa cuando la búsqueda se pausa, reenviando lo dicho sin cambios', async () => {
  const paused = reply({ stop_reason: 'pause_turn', content: [{ type: 'server_tool_use', id: 's1', name: 'web_search', input: { query: 'q' } }, { type: 'web_search_tool_result', tool_use_id: 's1', content: [{ type: 'web_search_result', url: 'https://gsmarena.com/a', encrypted_content: 'ENC' }] }] });
  const client = fakeClient(paused, reply());
  const steps = [];
  const out = await runResearch(client, buildRequest({ model: 'm', targetName: 'x', kinds: ['case'] }), { onProgress: (p) => steps.push(p.turn) });
  assert.equal(client.calls.length, 2);
  assert.deepEqual(steps, [1, 2]);
  const second = client.calls[1].params.messages;
  assert.equal(second.length, 2);
  assert.equal(second[1].role, 'assistant');
  assert.deepEqual(second[1].content, paused.content); // intacto (incluye encrypted_content)
  assert.equal(out.text, '{"ok":1}');
  assert.equal(out.responses.length, 2);
  assert.deepEqual(sumUsage(out.responses), { input: 2000, output: 400, searches: 4 });
});

test('ejecución: rechazo, respuesta cortada y demasiadas pausas', async () => {
  await assert.rejects(runResearch(fakeClient(reply({ stop_reason: 'refusal' })), buildRequest({ model: 'm', targetName: 'x', kinds: ['case'] })), (e) => e.kind === 'refusal');
  await assert.rejects(runResearch(fakeClient(reply({ stop_reason: 'max_tokens' })), buildRequest({ model: 'm', targetName: 'x', kinds: ['case'] })), (e) => e.kind === 'truncated');
  const pausedForever = Array.from({ length: 3 }, () => reply({ stop_reason: 'pause_turn' }));
  await assert.rejects(runResearch(fakeClient(...pausedForever), buildRequest({ model: 'm', targetName: 'x', kinds: ['case'] }), { maxTurns: 3 }), (e) => e.kind === 'too-long');
});

test('errores de la API en español', () => {
  const api = (status, message, name = 'APIError') => Object.assign(new Error(message), { status, name });
  assert.equal(describeApiError(api(401, 'invalid x-api-key')).kind, 'auth');
  assert.equal(describeApiError(api(429, 'rate')).kind, 'rate');
  assert.equal(describeApiError(api(529, 'Overloaded')).kind, 'overloaded');
  assert.equal(describeApiError(api(400, 'Your credit balance is too low to access the Anthropic API')).kind, 'credits');
  assert.equal(describeApiError(api(400, 'web search is not enabled for this organization')).kind, 'websearch');
  assert.equal(describeApiError(api(404, 'model: x')).kind, 'model');
  assert.equal(describeApiError(Object.assign(new Error('Connection error.'), { name: 'APIConnectionError' })).kind, 'network');
  assert.equal(describeApiError(Object.assign(new Error('Request was aborted.'), { name: 'APIUserAbortError' })).kind, 'abort');
  assert.ok(describeApiError(new Error('raro')) instanceof AiError);
  assert.match(describeApiError(api(401, 'x')).message, /llave/);
});

test('costo estimado: tokens + búsquedas web (US$10 por 1,000)', () => {
  const u = { input: 60000, output: 6000, searches: 5 };
  assert.equal(estimateCost('claude-opus-5-5', u).toFixed(3), '0.410'); // 0.24 + 0.12 + 0.05
  assert.equal(estimateCost('claude-sonnet-5-5', u).toFixed(3), '0.230');
  assert.equal(estimateCost('claude-haiku-5-5', u).toFixed(3), '0.059');
});
