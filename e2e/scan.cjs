// Prueba "Escanear lista": foto (generada) → lectura OCR → grupos en su categoría, subidos a la nube.
// Uso:  npm run build:test && NODE_PATH=$(npm root -g) node e2e/scan.cjs [carpeta-de-capturas]
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path'), os = require('os'), assert = require('assert/strict');
const root = path.join(__dirname, '..', 'dist-test');
const shots = process.argv[2];
if (shots) fs.mkdirSync(shots, { recursive: true });
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.gz': 'application/gzip' };
const server = http.createServer((q, r) => {
  const u = q.url.split('?')[0];
  const f = path.join(root, u === '/' ? 'index.html' : u);
  fs.readFile(f, (e, d) => (e ? r.writeHead(404).end() : r.writeHead(200, { 'content-type': mime[path.extname(f)] || 'application/octet-stream' }).end(d)));
});
(async () => {
  await new Promise((r) => server.listen(0, r));
  const url = `http://localhost:${server.address().port}/`;
  const browser = await chromium.launch();
  const ip = await browser.newPage({ viewport: { width: 900, height: 420 } });
  await ip.setContent(`<body style="margin:0;background:#fff;font:34px Arial;color:#111;padding:30px;line-height:1.6"><div>iPhone 13 / iPhone 14 / iPhone 15</div><div>Galaxy A54 - Galaxy A55 - Galaxy A56</div><div>Moto G54, Moto G84, Moto G85</div></body>`);
  const img = path.join(os.tmpdir(), 'lista-compatibles.png');
  await ip.screenshot({ path: img });

  const p = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errs = [];
  p.on('pageerror', (e) => errs.push(e.message));
  p.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
  const shot = async (n) => shots && (await p.waitForTimeout(450), p.screenshot({ path: path.join(shots, `escanear-${n}.png`) }));
  const btn = (n, o) => p.getByRole('button', { name: n, ...o });
  const data = () => p.evaluate(() => window.__app.store.data);
  const cloud = () => p.evaluate(() => ({ models: Object.keys(window.__app.backend.cloud.models).length, groups: Object.keys(window.__app.backend.cloud.groups).length }));
  const file = () => p.locator('input[type=file]:not([capture])');

  await p.goto(url);
  const pw = p.locator('input[type=password]');
  for (let i = 0; i < 4; i++) await pw.nth(i).fill(i < 2 ? 'admin-secreta' : 'trabajo-123');
  await btn('Crear contraseñas').click();
  await p.getByText('¿Qué modelo buscas?').waitFor();
  assert.equal(await btn(/Escanear lista/).count(), 0); // ya no está en el inicio
  await btn('Administrar datos').click();
  await btn('Escanear lista (foto)').click();
  await p.getByText('¿Qué tipo de lista es?').waitFor();
  await shot('1-inicio');
  console.log('  ✓ Escanear lista está en Administrar datos y abre su pantalla');

  assert.equal(await p.getByLabel(/Subir solo, sin revisar/).isChecked(), false); // por omisión se revisa antes
  await p.getByLabel(/Subir solo, sin revisar/).check();
  await btn('Vidrio 9D', { exact: true }).click();
  await file().setInputFiles(img);
  await p.getByText('Listo, ya se subió').waitFor({ timeout: 120000 });
  await p.getByText('3 grupos agregados y 9 modelos nuevos').waitFor();
  let d = await data();
  assert.equal(Object.values(d.groups).length, 3);
  assert.ok(Object.values(d.groups).every((g) => g.type === 'GLASS' && g.variant === 'D9'));
  assert.deepEqual(Object.values(d.models).map((m) => m.name).sort(), ['Galaxy A54', 'Galaxy A55', 'Galaxy A56', 'Moto G54', 'Moto G84', 'Moto G85', 'iPhone 13', 'iPhone 14', 'iPhone 15']);
  assert.deepEqual(await cloud(), { models: 9, groups: 3 });
  await shot('2-listo');
  console.log('  ✓ lee la foto y sube 3 grupos a "Vidrio 9D", también a la nube');

  await btn('Deshacer lo que agregué').click();
  assert.equal(Object.keys((await data()).groups).length, 0);
  assert.deepEqual(await cloud(), { models: 0, groups: 0 });
  console.log('  ✓ deshacer quita todo');

  await p.getByLabel(/Subir solo, sin revisar/).uncheck();
  await btn('Case', { exact: true }).click();
  await file().setInputFiles(img);
  await p.getByText('Revisa lo que leí').waitFor({ timeout: 120000 });
  const ta = p.locator('textarea');
  assert.match(await ta.inputValue(), /^Case: iPhone 13, iPhone 14, iPhone 15\nCase: Galaxy A54/);
  await ta.fill('Case: iPhone 13, iPhone 14');
  await shot('3-revisar');
  await btn('Agregar y subir a la nube').click();
  await p.getByText('1 grupo agregado y 2 modelos nuevos').waitFor();
  assert.ok(Object.values(await data().then((x) => x.groups)).every((g) => g.type === 'CASE'));
  console.log('  ✓ con "revisar antes": se corrige el texto y se sube a la categoría Case');

  // ---- Con IA (la API se simula)
  let calls = 0, lastReq = null, status = 200;
  await p.route('https://api.anthropic.com/v1/messages', async (route) => {
    calls++;
    lastReq = { headers: route.request().headers(), body: JSON.parse(route.request().postData()) };
    if (status !== 200) return route.fulfill({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ error: { message: 'x' } }) });
    await route.fulfill({
      status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' },
      body: JSON.stringify({ content: [{ type: 'tool_use', name: 'registrar_grupos', input: { grupos: [{ modelos: ['iPhone 15', 'iPhone 16'], nota: 'Bordes altos' }, { modelos: ['Galaxy S25', 'Galaxy S24'] }] } }] }),
    });
  });
  await p.goto(url + '#/scan');
  await p.getByText('Leer con IA (mucho más preciso)').waitFor();
  await p.locator('input[type=password]').fill('no-es-llave');
  await btn('Guardar llave y activar').click();
  await p.getByText('Esa no parece una llave').waitFor();
  await p.locator('input[type=password]').fill('sk-ant-prueba123');
  await btn('Guardar llave y activar').click();
  await p.getByLabel('Leer con IA').waitFor();
  assert.equal(await p.getByLabel('Leer con IA').isChecked(), true);
  await p.getByLabel(/Subir solo, sin revisar/).uncheck();
  await btn('Vidrio privacy', { exact: true }).click();
  await file().setInputFiles(img);
  await p.getByText('Revisa lo que leí').waitFor({ timeout: 30000 });
  assert.equal(calls, 1);
  assert.equal(lastReq.headers['x-api-key'], 'sk-ant-prueba123');
  assert.equal(lastReq.headers['anthropic-dangerous-direct-browser-access'], 'true');
  assert.equal(lastReq.body.messages[0].content[0].source.media_type, 'image/jpeg');
  assert.match(lastReq.body.messages[0].content[1].text, /Vidrio privacy/);
  assert.equal(await p.locator('textarea').inputValue(), 'Vidrio privacy: iPhone 15, iPhone 16\nNota: Bordes altos\nVidrio privacy: Galaxy S25, Galaxy S24');
  await shot('4-ia');
  await btn('Agregar y subir a la nube').click();
  await p.getByText('2 grupos agregados').waitFor();
  assert.ok(Object.values((await data()).groups).some((g) => g.variant === 'PRIVACY' && g.note === 'Bordes altos'));
  console.log('  ✓ con IA: manda la foto, entiende la respuesta y sube a Vidrio privacy con su nota');

  status = 401;
  await btn('Escanear otra foto').click();
  await file().setInputFiles(img);
  await p.getByText(/La llave de IA no es válida/).waitFor({ timeout: 30000 });
  console.log('  ✓ si la llave no sirve, lo explica');
  await btn('Quitar la llave de este teléfono').click();
  await p.getByText('Leer con IA (mucho más preciso)').waitFor();
  assert.equal(await p.evaluate(() => localStorage.getItem('gc_vision_key')), null);
  console.log('  ✓ se puede quitar la llave');

  const real = errs.filter((e) => !/401 \(Unauthorized\)/.test(e)); // el 401 es la prueba de llave inválida
  assert.deepEqual(real, [], real.join('\n'));
  console.log('  ✓ sin errores en la consola\n\nTODO BIEN');
  await browser.close();
  server.close();
})().catch((e) => { console.error('\nFALLÓ:', e.message); server.close(); process.exit(1); });
