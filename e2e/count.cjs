// Prueba de "Hacer inventario": buscar, sumar, resultado, WhatsApp y escaneo con la cámara (cámara simulada).
// Uso:  npm run build:test && NODE_PATH=$(npm root -g) node e2e/count.cjs [carpeta-de-capturas]   (necesita ffmpeg)
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path'), os = require('os'), assert = require('assert/strict');
const { execFileSync } = require('child_process');
const root = path.join(__dirname, '..', 'dist-test');
const shots = process.argv[2];
if (shots) fs.mkdirSync(shots, { recursive: true });
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };
const server = http.createServer((q, r) => {
  const u = q.url.split('?')[0];
  const f = path.join(root, u === '/' ? 'index.html' : u);
  fs.readFile(f, (e, d) => (e ? r.writeHead(404).end() : r.writeHead(200, { 'content-type': mime[path.extname(f)] || 'application/octet-stream' }).end(d)));
});
const log = (m) => console.log(`  ✓ ${m}`);
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'count-'));

async function setup(page, url) {
  await page.goto(url);
  const pw = page.locator('input[type=password]');
  for (let i = 0; i < 4; i++) await pw.nth(i).fill(i < 2 ? 'admin-secreta' : 'trabajo-123');
  await page.getByRole('button', { name: 'Crear contraseñas' }).click();
  await page.getByText('¿Qué modelo buscas?').waitFor();
  await page.evaluate(async () => {
    const s = window.__app.shop;
    await s.saveProduct({ name: 'Cargador', price: 50, category: 'Cargadores', barcode: '2000000000022', initialStock: 19 });
    await s.saveProduct({ name: 'Ventilador', price: 120, category: 'Otros', barcode: '2000000000039', initialStock: 5 });
    await s.saveProduct({ name: 'Gorra', price: 35, initialStock: 3 });
  });
}

(async () => {
  await new Promise((r) => server.listen(0, r));
  const url = `http://localhost:${server.address().port}/`;

  // 1) Se dibuja la etiqueta del cargador y se convierte en el "video" de la cámara simulada
  const b0 = await chromium.launch();
  const p0 = await b0.newPage({ viewport: { width: 390, height: 844 } });
  await setup(p0, url);
  await p0.evaluate(() => localStorage.setItem('gc_label_size', '60x40'));
  await p0.goto(url + '#/labels');
  await p0.locator('canvas').first().waitFor();
  const dataUrl = await p0.evaluate(() => [...document.querySelectorAll('canvas')].map((c) => c.toDataURL('image/png'))[0]);
  await b0.close();
  const png = path.join(tmp, 'etiqueta.png');
  fs.writeFileSync(png, Buffer.from(dataUrl.split(',')[1], 'base64'));
  const mjpeg = path.join(tmp, 'camara.y4m');
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-loop', '1', '-i', png, '-t', '4', '-r', '10', '-vf', 'scale=640:480:force_original_aspect_ratio=decrease,pad=640:480:(ow-iw)/2:(oh-ih)/2:white', '-pix_fmt', 'yuv420p', '-f', 'yuv4mpegpipe', mjpeg]);

  // 2) La prueba, con la cámara simulada
  const browser = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-video-capture=${mjpeg}`] });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, permissions: ['camera', 'clipboard-read', 'clipboard-write'] });
  const page = await context.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); if (m.type() === 'warning') console.log('WARN', m.text()); });
  const shot = async (n) => shots && (await page.waitForTimeout(450), page.screenshot({ path: path.join(shots, `inventario-${n}.png`) }));
  const btn = (n, o) => page.getByRole('button', { name: n, ...o });
  const text = (t, o) => page.getByText(t, o);
  await page.addInitScript(() => { window.__opened = []; window.open = (u) => (window.__opened.push(u), null); });
  await setup(page, url);

  await btn('Hacer inventario').click();
  await text('Buscar o escanear el producto').waitFor();
  assert.ok(await btn('Escanear').count());
  await shot('1-inicio');
  log('el menú tiene "Hacer inventario" con buscador y botón de escanear');

  const search = page.getByLabel('Buscar producto');
  const pick = async (q, name) => { await search.fill(q); await page.locator('.results').getByText(name, { exact: true }).click(); };
  await pick('carg', 'Cargador');
  await page.getByLabel('Cantidad contada').fill('5');
  await btn('Sumar').click();
  await text('Cargador: 5 contados').waitFor();
  await pick('carg', 'Cargador'); // el mismo producto: se suma
  await page.getByLabel('Cantidad contada').fill('15');
  await btn('Sumar').click();
  await text('Cargador: 20 contados').waitFor();
  await pick('120', 'Ventilador'); // por precio
  await page.getByLabel('Cantidad contada').fill('3');
  await btn('Sumar').click();
  await text('Lo contado (2 productos · 23 unidades)').waitFor();
  await shot('2-contando');
  log('busca por nombre y por precio, y lo contado del mismo producto se suma solo (5 + 15 = 20)');

  // La cámara: el cargador aparece en el "video" y cada lectura suma 1
  await btn('Escanear').click();
  await text(/Cargador · 21/).waitFor({ timeout: 30000 });
  await shot('3-camara');
  await btn('Listo').click();
  await text('Lo contado (2 productos · 24 unidades)').waitFor();
  log('el escáner con la cámara lee el código de barras y suma 1');

  // Corregir una cantidad
  await page.locator('.list-item', { hasText: 'En el sistema: 5' }).click();
  await page.getByLabel('Cantidad exacta').fill('4');
  await btn('Guardar').click();
  await text('Lo contado (2 productos · 25 unidades)').waitFor();

  // Resultado y WhatsApp
  await btn('Terminar y ver el resultado').click();
  await text('Resultado del inventario').waitFor();
  await text('Sin contar (1)').waitFor(); // la gorra
  await shot('4-resultado');
  await page.getByLabel('Número de WhatsApp').fill('+502 5555 1234');
  await btn('Enviar por WhatsApp').click();
  const opened = await page.evaluate(() => window.__opened);
  assert.equal(opened.length, 1);
  assert.match(opened[0], /^https:\/\/wa\.me\/50255551234\?text=/);
  const msg = decodeURIComponent(opened[0].split('?text=')[1]);
  assert.match(msg, /Contados: 2 productos · 25 unidades/);
  assert.match(msg, /• Cargador: \*21\* \(sistema 19, \+2\)/);
  assert.match(msg, /• Ventilador: \*4\* \(sistema 5, -1\)/);
  assert.match(msg, /Sin contar \(1\): Gorra/);
  log('el resultado se envía por WhatsApp con lo contado, las diferencias y lo que falta contar');

  // Ajustar existencias (administrador)
  await btn('Ajustar existencias a lo contado').click();
  await btn('Sí, ajustar').click();
  await page.waitForTimeout(300);
  const stocks = await page.evaluate(() => { const s = window.__app.shop; const st = {}; for (const m of Object.values(s.moves)) st[m.productId] = (st[m.productId] ?? 0) + (m.kind === 'sale' ? -m.qty : m.qty); return Object.values(s.products).map((p) => [p.name, st[p.id]]).sort(); });
  assert.deepEqual(stocks, [['Cargador', 21], ['Gorra', 3], ['Ventilador', 4]]);
  log('el administrador puede ajustar el inventario a lo contado');

  // El conteo se guarda aunque se cierre la app
  await page.reload();
  await text('Lo contado (2 productos · 25 unidades)').waitFor();
  log('el conteo queda guardado en el teléfono');
  await btn('Empezar de cero').click();
  await btn('Borrar', { exact: true }).click();
  await text('Todavía no has contado nada').waitFor();

  assert.deepEqual(errs, [], errs.join('\n'));
  log('sin errores en la consola\n\nTODO BIEN');
  await browser.close();
  server.close();
})().catch((e) => { console.error('\nFALLÓ:', e.message); server.close(); process.exit(1); });
