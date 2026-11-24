// Prueba del flujo "Pegar información" en un navegador real (con la nube simulada).
// Uso:  npm run build:test && NODE_PATH=$(npm root -g) node e2e/paste.cjs [carpeta-de-capturas]
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
  fs.readFile(file, (err, data) => (err ? res.writeHead(404).end() : res.writeHead(200, { 'content-type': mime[path.extname(file)] ?? 'application/octet-stream' }).end(data)));
});

const log = (m) => console.log(`  ✓ ${m}`);
let step = 0;

const AI_ANSWER = `¡Claro! Aquí tienes:

**Case:** iPhone 13/14/15
Marca: Apple
Nota: La cámara del 15 queda un poco justa

**Vidrio normal:** iPhone 13, iPhone 14
Marca: Apple

**Vidrio 9D:** iPhone 13, iPhone 14, iPhone 15
Marca: Apple

**Vidrio privacy:** iPhone 13, iPhone 14
Marca: Apple

Espero que te sirva.`;

(async () => {
  await new Promise((r) => server.listen(0, r));
  const url = `http://localhost:${server.address().port}/`;
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: url.replace(/\/$/, '') });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => m.type() === 'error' && errors.push(`console: ${m.text()}`));
  const shot = async (name) => shots && (await page.waitForTimeout(450), page.screenshot({ path: path.join(shots, `pegar-${String(++step).padStart(2, '0')}-${name}.png`) }));
  const text = (t, o) => page.getByText(t, o);
  const btn = (n, o) => page.getByRole('button', { name: n, ...o });
  const data = () => page.evaluate(() => window.__app.store.data);
  const cloud = () => page.evaluate(() => ({ models: Object.keys(window.__app.backend.cloud.models).length, groups: Object.keys(window.__app.backend.cloud.groups).length }));
  const pasteArea = page.getByPlaceholder('Pega aquí lo que respondió la IA…');

  // --- administrador
  await page.goto(url);
  const pw = page.locator('input[type=password]');
  for (let i = 0; i < 4; i++) await pw.nth(i).fill(i < 2 ? 'admin-secreta' : 'trabajo-123');
  await btn('Crear contraseñas').click();
  await text('¿Qué modelo buscas?').waitFor();
  assert.equal(await btn('Pegar información', { exact: true }).count(), 0); // ya no está en el inicio
  await btn('Administrar datos').click();
  await btn('Pegar información de una IA').waitFor();
  await shot('inicio');
  log('"Pegar información" está en Administrar datos (no en el inicio)');

  console.log('Pedir la información');
  await btn('Pegar información de una IA').click();
  await text('Pide la información a una IA').waitFor();
  await page.getByPlaceholder('ej. iPhone 13 o Galaxy A54').fill('iPhone 13');
  await btn('Copiar la pregunta para la IA').click();
  await text('Copiada. Pégala en ChatGPT').waitFor();
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  assert.match(copied, /este modelo: iPhone 13\n/);
  assert.match(copied, /Vidrio 9D:/);
  assert.match(copied, /Si no estás seguro de un modelo, NO lo incluyas/);
  await shot('paso-1');
  log('copia la pregunta para la IA con el modelo escrito');

  console.log('Pegar y revisar');
  await pasteArea.fill(AI_ANSWER);
  await text('Esto es lo que voy a agregar').waitFor();
  const cards = page.locator('.paste-group');
  assert.equal(await cards.count(), 4);
  const first = await cards.nth(0).innerText();
  assert.match(first, /Case/);
  assert.match(first, /iPhone 13\s*nuevo/);
  assert.match(first, /iPhone 14\s*nuevo/);
  assert.match(first, /iPhone 15\s*nuevo/); // "iPhone 13/14/15" se expandió
  assert.match(first, /Marca: Apple/);
  assert.match(first, /Nota: La cámara del 15 queda un poco justa/);
  assert.match(await cards.nth(2).innerText(), /Vidrio 9D/);
  assert.match(await cards.nth(3).innerText(), /Vidrio privacy/);
  await text('Líneas ignoradas (2)').waitFor();
  await btn('Agregar 4 grupos y subir a la nube').waitFor();
  assert.equal((await data()).groups && Object.keys((await data()).groups).length, 0); // todavía no se guardó nada
  await shot('vista-previa');
  log('lee la respuesta de la IA (con Markdown), expande "13/14/15" y muestra una vista previa sin guardar nada');

  console.log('Agregar y subir');
  await btn('Agregar 4 grupos y subir a la nube').click();
  await text('Listo, ya está agregado').waitFor();
  await text('4 grupos agregados y 3 modelos nuevos').waitFor();
  let d = await data();
  assert.equal(Object.keys(d.groups).length, 4);
  assert.deepEqual(Object.values(d.models).map((m) => [m.name, m.brand]).sort(), [['iPhone 13', 'Apple'], ['iPhone 14', 'Apple'], ['iPhone 15', 'Apple']]);
  assert.deepEqual(Object.values(d.groups).map((g) => g.variant).sort(), ['D9', 'NORMAL', 'NORMAL', 'PRIVACY']);
  assert.deepEqual(await cloud(), { models: 3, groups: 4 }); // ya está en la nube
  await shot('listo');
  log('agrega los grupos y los sube a la nube');

  console.log('Deshacer');
  await btn('Deshacer lo que agregué').click();
  await text('Deshecho: se quitó lo que se había agregado').waitFor();
  d = await data();
  assert.equal(Object.keys(d.groups).length + Object.keys(d.models).length, 0);
  assert.deepEqual(await cloud(), { models: 0, groups: 0 }); // también se quitó de la nube
  await text('Esto es lo que voy a agregar').waitFor(); // vuelve a la vista previa
  log('deshacer quita todo, también de la nube');

  console.log('Repetir lo mismo');
  await btn('Agregar 4 grupos y subir a la nube').click();
  await text('Listo, ya está agregado').waitFor();
  await btn('Pegar otra información').click();
  await pasteArea.fill(AI_ANSWER);
  await text('Se parece a un grupo que ya tienes').first().waitFor();
  assert.equal(await page.locator('.model-chip.new').count(), 0); // los modelos ya existen
  await btn('Agregar 4 grupos y subir a la nube').click();
  await text('No se agregó nada').waitFor();
  assert.equal(Object.keys((await data()).groups).length, 4); // no se duplicó nada
  assert.equal(await page.locator('.warn-list li').count(), 4);
  await shot('repetido');
  log('si pegas lo mismo, no duplica y avisa qué ya existía');
  await btn('Pegar otra información').click();

  console.log('Texto que no se entiende');
  await pasteArea.fill('Hola, no pude encontrar esa información. ¿Quieres que busque otra cosa?');
  await text('No encontré información para agregar').waitFor();
  await text('Líneas ignoradas (1)').waitFor();
  assert.equal(await btn(/Agregar/).count(), 0);
  await shot('no-entendido');
  log('si no entiende el texto, no agrega nada y lo explica');

  console.log('Tabla');
  await pasteArea.fill(`| tipo | grupo | modelo | nota | marca | variante |
|---|---|---|---|---|---|
| Case | Case Samsung | A54 | | Samsung | |
| Case | Case Samsung | A55 | | Samsung | |
| Vidrio templado | Vidrio 9D Samsung | A54 | | Samsung | 9D |
| Vidrio templado | Vidrio 9D Samsung | A55 | | Samsung | 9D |`);
  await btn('Agregar 2 grupos y subir a la nube').click();
  await text('2 grupos agregados y 2 modelos nuevos').waitFor();
  d = await data();
  assert.ok(Object.values(d.groups).some((g) => g.name === 'Vidrio 9D Samsung' && g.variant === 'D9'));
  log('también entiende tablas (Markdown, CSV o Excel pegado)');
  await btn('Pegar otra información').click();

  console.log('Modo automático');
  await page.getByLabel(/Agregar y subir solo al pegar/).check();
  assert.equal(await page.evaluate(() => localStorage.getItem('gc_paste_auto')), '1');
  await page.evaluate(() => navigator.clipboard.writeText('Case: Galaxy A34/A35\nMarca: Samsung'));
  await btn('Pegar del portapapeles').click();
  await text('Listo, ya está agregado').waitFor();
  await text('1 grupo agregado y 2 modelos nuevos').waitFor();
  d = await data();
  assert.deepEqual(Object.values(d.models).filter((m) => /A3[45]/.test(m.name)).map((m) => [m.name, m.brand]).sort(), [['Galaxy A34', 'Samsung'], ['Galaxy A35', 'Samsung']]);
  await btn('Deshacer lo que agregué').click();
  await text('Esto es lo que voy a agregar').waitFor();
  assert.equal(Object.values((await data()).models).filter((m) => /A3[45]/.test(m.name)).length, 0);
  await btn('Borrar').click();
  // pegando con el gesto normal (evento "paste")
  await pasteArea.evaluate((ta) => {
    ta.value = 'Vidrio 9D: Galaxy A34, Galaxy A35\nMarca: Samsung';
    ta.dispatchEvent(new Event('paste', { bubbles: true }));
  });
  await text('Listo, ya está agregado').waitFor();
  d = await data();
  assert.ok(Object.values(d.groups).some((g) => g.type === 'GLASS' && g.variant === 'D9' && g.models.length === 2));
  // con un texto que no se entiende, el modo automático no agrega nada
  await btn('Deshacer lo que agregué').click();
  await btn('Borrar').click();
  await pasteArea.evaluate((ta) => {
    ta.value = 'No tengo datos de ese modelo';
    ta.dispatchEvent(new Event('paste', { bubbles: true }));
  });
  await text('No encontré información para agregar').waitFor();
  log('modo automático: al pegar se agrega y sube solo, con Deshacer; si no entiende, no agrega nada');

  console.log('Administrar datos y trabajador');
  await page.goto(url + '#/admin');
  await btn('Pegar información de una IA').waitFor();
  await page.goto(url + '#/settings');
  await btn('Cerrar sesión').first().click();
  await page.locator('.dialog').getByRole('button', { name: 'Cerrar sesión' }).click();
  await page.locator('input[type=password]').fill('trabajo-123');
  await btn('Entrar').click();
  await text('¿Qué modelo buscas?').waitFor();
  assert.equal(await btn(/Pegar información/).count(), 0);
  await page.goto(url + '#/paste');
  await page.reload();
  await text('¿Qué modelo buscas?').waitFor();
  log('el trabajador no ve el botón ni puede abrir la pantalla');

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
