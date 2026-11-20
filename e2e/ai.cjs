// Prueba del flujo "Buscar similares con IA" en un navegador real, con la API de Anthropic SIMULADA
// (no se hace ninguna llamada real ni se gasta saldo).
// Uso:  npm run build:test && NODE_PATH=$(npm root -g) node e2e/ai.cjs [carpeta-de-capturas]
const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');
const assert = require('assert/strict');

const root = path.join(__dirname, '..', 'dist-test');
const shots = process.argv[2];
if (shots) fs.mkdirSync(shots, { recursive: true });
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' };
const server = http.createServer((req, res) => {
  const file = path.join(root, req.url.split('?')[0] === '/' ? 'index.html' : req.url.split('?')[0]);
  fs.readFile(file, (err, data) => {
    if (err) return res.writeHead(404).end();
    res.writeHead(200, { 'content-type': mime[path.extname(file)] ?? 'application/octet-stream' }).end(data);
  });
});

const KEY = 'sk-ant-api03-' + 'x'.repeat(40);
const log = (m) => console.log(`  ✓ ${m}`);
let step = 0;

// ---------------------------------------------------------------- Respuestas simuladas de la API

const usage = (inp, out, searches) => ({ input_tokens: inp, output_tokens: out, server_tool_use: { web_search_requests: searches } });
const message = (over) => ({ id: 'msg_test', type: 'message', role: 'assistant', model: 'claude-opus-5-5', stop_sequence: null, ...over });

const RESULT_URLS = [
  'https://www.spigen.com/products/iphone-14-case',
  'https://www.gsmarena.com/apple_iphone_13-11103.php',
  'https://www.gsmarena.com/apple_iphone_14-11861.php',
  'https://www.gsmarena.com/apple_iphone_15-12557.php',
  'https://www.esrgear.com/iphone-14-glass',
];

const PAUSED = message({
  stop_reason: 'pause_turn',
  usage: usage(30000, 1500, 4),
  content: [
    { type: 'text', text: 'Voy a buscar las medidas y las listas de compatibilidad.' },
    { type: 'server_tool_use', id: 'srvtoolu_1', name: 'web_search', input: { query: 'iPhone 13 case compatible iPhone 14' } },
    { type: 'web_search_tool_result', tool_use_id: 'srvtoolu_1', content: RESULT_URLS.map((url) => ({ type: 'web_search_result', url, title: 'x', page_age: null, encrypted_content: 'ENC-' + url })) },
  ],
});

const ANSWER = {
  target: { name: 'iPhone 13', brand: 'Apple', found: true, dimensions_mm: { height: 146.7, width: 71.5, depth: 7.65 }, screen_inches: 6.1, sources: ['https://www.gsmarena.com/apple_iphone_13-11103.php'] },
  clusters: [
    {
      kind: 'case',
      models: [{ name: 'iPhone 14', brand: 'Apple', dimensions_mm: { height: 146.7, width: 71.5, depth: 7.8 }, screen_inches: 6.1 }],
      explicit_compat_sources: [
        { url: 'https://www.spigen.com/products/iphone-14-case', quote: 'Compatible with iPhone 14 / iPhone 13' },
        { url: 'https://www.spigen.com/products/INVENTADO-no-salio-en-la-busqueda', quote: 'iPhone 13 and iPhone 14' },
      ],
      spec_sources: ['https://www.gsmarena.com/apple_iphone_14-11861.php', 'https://blog-random.com/iphone-14'],
      differences: [],
      summary: 'Mismo cuerpo y mismo módulo de cámara.',
    },
    {
      kind: 'case',
      models: [{ name: 'iPhone 15', brand: 'Apple', dimensions_mm: { height: 147.6, width: 71.6, depth: 7.8 }, screen_inches: 6.1 }],
      explicit_compat_sources: [{ url: 'https://www.spigen.com/products/iphone-14-case', quote: 'Fits iPhone 13, iPhone 14 and iPhone 15' }],
      spec_sources: ['https://www.gsmarena.com/apple_iphone_15-12557.php'],
      differences: ['El borde del iPhone 15 es más curvo'],
      summary: 'El fabricante lo lista, pero es 0.9 mm más alto.',
    },
    {
      kind: 'glass',
      models: [{ name: 'iPhone 14', brand: 'Apple', dimensions_mm: { height: 146.7, width: 71.5, depth: 7.8 }, screen_inches: 6.1 }],
      explicit_compat_sources: [{ url: 'https://www.esrgear.com/iphone-14-glass', quote: 'Tempered glass for iPhone 14 and iPhone 13' }],
      spec_sources: ['https://www.gsmarena.com/apple_iphone_14-11861.php'],
      differences: [],
      summary: 'Misma pantalla de 6.1 pulgadas y mismo recorte.',
    },
  ],
  not_compatible_or_unknown: [{ name: 'iPhone 13 Pro Max', reason: 'Pantalla de 6.7 pulgadas.' }],
  notes: 'Verifica el ajuste del iPhone 15 con un producto físico.',
};
const json = JSON.stringify(ANSWER, null, 2);
const cut = Math.floor(json.length / 2);
const FINAL = message({
  stop_reason: 'end_turn',
  usage: usage(41000, 4200, 3),
  content: [
    { type: 'text', text: '```json\n' + json.slice(0, cut) },
    { type: 'text', text: json.slice(cut) + '\n```', citations: [{ type: 'web_search_result_location', url: 'https://www.spigen.com/products/iphone-14-case', title: 'Spigen', cited_text: 'Compatible with iPhone 14', encrypted_index: 'IDX' }] },
  ],
});

(async () => {
  await new Promise((r) => server.listen(0, r));
  const url = `http://localhost:${server.address().port}/`;
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => m.type() === 'error' && !/Failed to load resource/.test(m.text()) && errors.push(`console: ${m.text()}`));
  const shot = async (name) => shots && page.screenshot({ path: path.join(shots, `ai-${String(++step).padStart(2, '0')}-${name}.png`) });
  const text = (t, o) => page.getByText(t, o);
  const btn = (n, o) => page.getByRole('button', { name: n, ...o });

  // --- la API simulada
  const apiCalls = [];
  let script = []; // respuestas que se entregan en orden: {status, body, delay}
  await page.route('https://api.anthropic.com/**', async (route) => {
    const req = route.request();
    const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    apiCalls.push({ url: req.url(), headers: req.headers(), body: JSON.parse(req.postData() ?? '{}') });
    const next = script.shift() ?? { status: 500, body: { error: { type: 'api_error', message: 'sin respuesta preparada' } } };
    if (next.delay) await new Promise((r) => setTimeout(r, next.delay));
    return route.fulfill({ status: next.status ?? 200, headers: { ...cors, 'content-type': 'application/json' }, body: JSON.stringify(next.body) });
  });

  // --- administrador con un modelo ya registrado
  await page.goto(url);
  const pw = page.locator('input[type=password]');
  for (let i = 0; i < 4; i++) await pw.nth(i).fill(i < 2 ? 'admin-secreta' : 'trabajo-123');
  await btn('Crear contraseñas').click();
  await text('Compatibilidad de cases y vidrios').waitFor();
  await page.evaluate(() => {
    window.__app.store.apply((d) => (d.getOrCreateModel('iPhone 13', 'Apple'), {}));
  });
  const id13 = await page.evaluate(() => Object.values(window.__app.store.data.models).find((m) => m.name === 'iPhone 13').id);
  await btn('Buscar similares con IA').waitFor();
  log('el administrador ve el botón "Buscar similares con IA" en el inicio');

  console.log('Llave');
  await page.goto(url + `#/ai?model=${id13}`);
  await text('Falta la llave de Anthropic').waitFor();
  assert.equal(await page.getByPlaceholder('ej. iPhone 13 o Galaxy A54').inputValue(), 'iPhone 13');
  assert.equal(await btn('Buscar con IA').isDisabled(), true);
  await shot('sin-llave');
  await btn('Poner llave').click();
  await page.getByPlaceholder('sk-ant-...').fill('llave-mala');
  await btn('Guardar', { exact: true }).click();
  await text('La llave debe empezar con sk-ant-').waitFor();
  await page.getByPlaceholder('sk-ant-...').fill(KEY);
  await btn('Guardar', { exact: true }).click();
  await text('Llave guardada').waitFor();
  assert.equal(await btn('Buscar con IA').isDisabled(), false);
  log('la llave se valida y se guarda en este dispositivo');

  console.log('Búsqueda');
  script = [{ body: PAUSED, delay: 400 }, { body: FINAL }];
  await btn('Buscar con IA').click();
  await text('Buscando en sitios confiables…').waitFor();
  await shot('buscando');
  await text('Confirmada', { exact: true }).first().waitFor({ timeout: 15000 });
  await shot('resultado');

  // lo que se le pidió a la API
  assert.equal(apiCalls.length, 2);
  const first = apiCalls[0];
  assert.equal(first.url, 'https://api.anthropic.com/v1/messages');
  // el SDK oficial envía la llave en la cabecera de autorización
  assert.ok(first.headers.authorization === `Bearer ${KEY}` || first.headers['x-api-key'] === KEY);
  assert.equal(first.headers['anthropic-dangerous-direct-browser-access'], 'true');
  assert.equal(first.body.model, 'claude-opus-5-5');
  assert.equal(first.body.tools[0].type, 'web_search_20260209');
  assert.equal(first.body.tools[0].max_uses, 6);
  assert.ok(first.body.tools[0].allowed_domains.includes('gsmarena.com'));
  assert.ok(!first.body.tools[0].allowed_domains.includes('blog-random.com'));
  assert.match(first.body.messages[0].content, /iPhone 13 \(marca: Apple\)/);
  // la segunda llamada continúa la pausa con lo dicho antes, sin cambios
  const second = apiCalls[1].body.messages;
  assert.equal(second[1].role, 'assistant');
  assert.deepEqual(second[1].content, PAUSED.content);
  log('la pregunta usa búsqueda restringida a sitios confiables y retoma la pausa sin alterar nada');

  // lo que se muestra
  await text('iPhone 13', { exact: true }).first().waitFor();
  await text('146.7 × 71.5 × 7.65 mm').waitFor();
  const cards = page.locator('.ai-card');
  assert.equal(await cards.count(), 3);
  // orden en pantalla: primero los Case (confirmada y luego probable) y después el Vidrio
  assert.match(await cards.nth(0).innerText(), /Confirmada/); // case iPhone 14
  assert.match(await cards.nth(1).innerText(), /Probable/); // case iPhone 15
  assert.match(await cards.nth(2).innerText(), /Confirmada/); // vidrio iPhone 14
  const c15 = await cards.nth(1).innerText();
  assert.match(c15, /iPhone 15: el alto difiere 0\.9 mm/);
  assert.match(c15, /Diferencia: El borde del iPhone 15 es más curvo/);
  const c14 = await cards.nth(0).innerText();
  assert.match(c14, /spigen\.com/);
  assert.doesNotMatch(c14, /INVENTADO/);
  assert.doesNotMatch(c14, /blog-random/);
  assert.match(c14, /Se descartó un enlace que no apareció en la búsqueda real/);
  assert.match(c14, /Se descartaron 1 fuente\(s\) por no estar en la lista de sitios confiables/);
  assert.match(c14, /“Compatible with iPhone 14 \/ iPhone 13”/);
  await text('Descartados (1)').waitFor();
  await text('Costo de esta búsqueda: ≈ US$0.47').waitFor(); // (71000×4 + 5700×20)/1e6 + 7×0.01
  // marcadas de antemano: solo las confirmadas
  const on = await page.locator('.check.strong input').evaluateAll((els) => els.map((e) => e.checked));
  assert.deepEqual(on, [true, false, true]);
  assert.equal(await btn(/Guardar 2 grupos seleccionados/).count(), 1);
  log('grados de confianza: confirmadas marcadas; la de medidas distintas queda "Probable"; enlaces inventados y no confiables se descartan');

  console.log('Guardar');
  // el vidrio también como 9D
  await cards.nth(2).getByRole('button', { name: '9D' }).click();
  await btn(/Guardar 2 grupos seleccionados/).click();
  await text('3 grupos guardados').waitFor();
  await page.waitForURL(/#\/admin$/);
  const data = await page.evaluate(() => window.__app.store.data);
  const groups = Object.values(data.groups);
  assert.equal(groups.length, 3);
  const names = (g) => g.models.map((id) => data.models[id].name).sort();
  const caseG = groups.find((g) => g.type === 'CASE');
  assert.deepEqual(names(caseG), ['iPhone 13', 'iPhone 14']);
  assert.match(caseG.note, /^Confirmado con fuentes \(\d{4}-\d\d-\d\d\)\. Fuentes: spigen\.com/);
  assert.deepEqual(groups.filter((g) => g.type === 'GLASS').map((g) => g.variant).sort(), ['D9', 'NORMAL']);
  assert.equal(Object.keys(data.models).length, 2);
  assert.equal(data.models[id13].name, 'iPhone 13'); // se reutilizó el modelo ya registrado
  await shot('guardado');
  log('guarda un grupo de case y uno de vidrio por cada clase marcada, reutilizando el modelo registrado');

  console.log('Sin confirmar');
  script = [{ body: PAUSED }, { body: FINAL }];
  await page.goto(url + `#/ai?model=${id13}`);
  await btn('Buscar con IA').click();
  await text('Probable', { exact: true }).first().waitFor({ timeout: 15000 });
  await page.locator('.ai-card').nth(1).locator('.check.strong input').check();
  await btn(/Guardar 3 grupos seleccionados/).click();
  await text('Hay grupos sin confirmar').waitFor();
  await shot('sin-confirmar');
  await page.locator('.dialog').getByRole('button', { name: 'Cancelar' }).click();
  assert.equal(Object.keys(await page.evaluate(() => window.__app.store.data.groups)).length, 3);
  log('un grupo "Probable" pide confirmación y, si cancelas, no se guarda nada');

  console.log('Errores y cancelar');
  const tryError = async (reply, expected, times = 1) => {
    script = Array.from({ length: times }, () => reply);
    await page.goto(url + '#/ai');
    await page.getByPlaceholder('ej. iPhone 13 o Galaxy A54').fill('Galaxy A54');
    await btn('Buscar con IA').click();
    await text(expected).waitFor({ timeout: 15000 });
  };
  await tryError({ status: 401, body: { type: 'error', error: { type: 'authentication_error', message: 'invalid x-api-key' } } }, 'La llave de Anthropic no es válida');
  await tryError({ status: 400, body: { type: 'error', error: { type: 'invalid_request_error', message: 'Your credit balance is too low to access the Anthropic API.' } } }, 'no tiene saldo');
  await tryError({ status: 429, body: { type: 'error', error: { type: 'rate_limit_error', message: 'rate' } } }, 'Demasiadas consultas seguidas', 2); // el SDK reintenta una vez
  await tryError({ body: message({ stop_reason: 'end_turn', usage: usage(10, 10, 0), content: [{ type: 'text', text: 'no sé' }] }) }, 'no devolvió una respuesta que se pueda leer');
  await shot('error');
  log('errores de la API explicados en español');

  script = [{ body: FINAL, delay: 20000 }];
  await page.goto(url + '#/ai');
  await page.getByPlaceholder('ej. iPhone 13 o Galaxy A54').fill('Galaxy A54');
  await btn('Buscar con IA').click();
  await text('Buscando en sitios confiables…').waitFor();
  await btn('Cancelar').click();
  await text('Búsqueda cancelada').waitFor();
  await btn('Buscar con IA').waitFor();
  log('se puede cancelar una búsqueda en curso');

  console.log('Configuración y trabajador');
  await page.goto(url + '#/settings');
  await text(`Llave: ${KEY.slice(0, 7)}…${KEY.slice(-4)}`).waitFor();
  await page.getByRole('button', { name: /Claude Sonnet 5\.5/ }).click();
  await page.getByRole('button', { name: /^10 \(hasta/ }).click();
  await shot('configuracion-ia');
  script = [{ body: PAUSED }, { body: FINAL }];
  await page.goto(url + '#/ai');
  await page.getByPlaceholder('ej. iPhone 13 o Galaxy A54').fill('iPhone 13');
  await page.locator('label.check', { hasText: 'Vidrio templado' }).locator('input').uncheck();
  await btn('Buscar con IA').click();
  await text('Confirmada', { exact: true }).first().waitFor({ timeout: 15000 });
  const last = apiCalls[apiCalls.length - 2].body;
  assert.equal(last.model, 'claude-sonnet-5-5');
  assert.equal(last.tools[0].max_uses, 10);
  assert.doesNotMatch(last.messages[0].content, /VIDRIO TEMPLADO/);
  log('el modelo de IA, el máximo de búsquedas y qué buscar se respetan');

  await page.goto(url + '#/settings');
  await btn('Quitar la llave de este dispositivo').click();
  await page.locator('.dialog').getByRole('button', { name: 'Quitar', exact: true }).click();
  await text('Sin llave de Anthropic').waitFor();
  assert.equal(await page.evaluate(() => localStorage.getItem('gc_ai_key')), null);
  log('la llave se puede quitar del dispositivo');

  // el trabajador no tiene nada de esto
  await page.goto(url + '#/settings');
  await btn('Cerrar sesión').first().click();
  await page.locator('.dialog').getByRole('button', { name: 'Cerrar sesión' }).click();
  await page.locator('input[type=password]').fill('trabajo-123');
  await btn('Entrar').click();
  await text('Compatibilidad de cases y vidrios').waitFor();
  assert.equal(await btn(/con IA/).count(), 0);
  await page.goto(url + `#/ai?model=${id13}`);
  await page.reload();
  await text('Compatibilidad de cases y vidrios').waitFor();
  await page.goto(url + `#/m/${id13}`);
  await page.reload();
  await text('El mismo case le queda a:').waitFor();
  assert.equal(await btn(/con IA/).count(), 0);
  log('el trabajador no ve el botón ni puede abrir la pantalla de IA');

  assert.deepEqual(errors, [], `errores en la consola:\n${errors.join('\n')}`);
  log('sin errores en la consola');
  await browser.close();
  server.close();
  console.log('\nTODO BIEN');
})().catch((e) => {
  console.error('\nFALLÓ:', e.message);
  server.close();
  process.exit(1);
});
