// Prueba de ventas, inventario y cierre de caja (administrador y trabajador) con la nube simulada.
// Uso:  npm run build:test && NODE_PATH=$(npm root -g) node e2e/shop.cjs [carpeta-de-capturas]
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path'), assert = require('assert/strict');
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
(async () => {
  await new Promise((r) => server.listen(0, r));
  const url = `http://localhost:${server.address().port}/`;
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
  const shot = async (n) => shots && (await page.waitForTimeout(450), page.screenshot({ path: path.join(shots, `ventas-${n}.png`) }));
  const btn = (n, o) => page.getByRole('button', { name: n, ...o });
  const text = (t, o) => page.getByText(t, o);
  const cloud = () => page.evaluate(() => window.__app.backend.cloud);

  // --- Administrador: crea contraseñas y productos
  await page.goto(url);
  const pw = page.locator('input[type=password]');
  for (let i = 0; i < 4; i++) await pw.nth(i).fill(i < 2 ? 'admin-secreta' : 'trabajo-123');
  await btn('Crear contraseñas').click();
  await text('¿Qué modelo buscas?').waitFor();
  await btn('Inventario').click();
  await text('Todavía no hay productos').waitFor();
  for (const [name, price, stock] of [['Ventilador', '120', '20'], ['Cargador', '50', '20']]) {
    await btn('Agregar producto').click();
    await page.getByPlaceholder('ej. Ventilador').fill(name);
    await page.getByPlaceholder('ej. 120 o 49.50').fill(price);
    await page.getByPlaceholder('ej. 20').fill(stock);
    await btn('Guardar').click();
    await text(name, { exact: true }).waitFor();
  }
  // El cargador es solo de la Caja 2
  await text('Cargador', { exact: true }).click();
  await btn('Solo Caja 2').click();
  await btn('Guardar').click();
  await text('Solo Caja 2').first().waitFor();
  await text('20 en existencia').first().waitFor();
  await shot('1-inventario-admin');
  assert.equal(Object.keys((await cloud()).products).length, 2);
  log('el administrador agrega productos con precio y existencias');

  // Códigos de barras únicos y automáticos
  const prods = Object.values((await cloud()).products);
  const codes = prods.map((p) => p.barcode);
  assert.ok(codes.every((c) => /^2\d{12}$/.test(c)) && new Set(codes).size === 2);
  assert.deepEqual(Object.keys((await cloud()).barcodes).sort(), [...codes].sort());
  await text('Ventilador', { exact: true }).click();
  await page.getByLabel('Código de barras (único)').or(page.locator('input[inputmode=numeric]').nth(1)).first();
  const bcInput = page.locator('.dialog input[placeholder="Se genera solo"]');
  await bcInput.fill(prods.find((p) => p.name === 'Cargador').barcode);
  await btn('Guardar').click();
  await text('Ese código ya lo tiene "Cargador"').waitFor();
  await btn('Cancelar').click();
  await shot('1b-codigos');
  log('cada producto recibe un código único y no deja repetirlo');

  // Etiquetas
  await btn('Etiquetas para imprimir').click();
  await text('Compartir / guardar imagen').first().waitFor();
  assert.equal(await page.locator('canvas').count(), 2);
  await shot('1c-etiquetas');
  log('las etiquetas se dibujan con su código de barras');
  await page.goBack();


  // --- Trabajador
  await page.goto(url + '#/settings');
  await btn('Cerrar sesión').first().click();
  await page.locator('.dialog').getByRole('button', { name: 'Cerrar sesión' }).click();
  await page.locator('input[type=password]').fill('trabajo-123');
  await btn('Entrar').click();
  await text('¿Qué modelo buscas?').waitFor();
  assert.equal(await btn('Agregar producto').count(), 0);
  await btn('Ventas del día').click();
  await text('Anotar una venta · Caja 1').waitFor();
  // Escanear: el lector escribe el código y manda Enter
  await page.getByLabel('Código de barras', { exact: true }).fill(prods.find((p) => p.name === 'Cargador').barcode);
  await page.getByLabel('Código de barras', { exact: true }).press('Enter');
  await text('no se vende en la Caja 1').waitFor(); // el cargador es solo de la Caja 2
  await page.getByLabel('Código de barras', { exact: true }).fill('0000000000000');
  await page.getByLabel('Código de barras', { exact: true }).press('Enter');
  await text('No existe el código').waitFor();
  await page.getByLabel('Código de barras', { exact: true }).fill(prods.find((p) => p.name === 'Ventilador').barcode);
  await page.getByLabel('Código de barras', { exact: true }).press('Enter');
  assert.equal(await page.getByLabel('Precio de cada uno').inputValue(), '120');
  log('escanear un código elige el producto (y respeta la caja)');
  await page.getByLabel('Producto').selectOption({ label: 'Ventilador · Q120.00 (quedan 20)' });
  assert.equal(await page.getByLabel('Precio de cada uno').inputValue(), '120');
  await btn('Anotar venta').click();
  await text('1 × Ventilador a Q120.00 = Q120.00').waitFor();
  await btn('Sí, anotar').click();
  await text('1 × Ventilador', { exact: true }).waitFor();
  assert.deepEqual(await page.getByLabel('Producto').locator('option').allInnerTexts(), ['Elige el producto…', 'Ventilador · Q120.00 (quedan 19)']); // el cargador es solo de la Caja 2
  await page.getByLabel('Producto').selectOption({ label: 'Ventilador · Q120.00 (quedan 19)' });
  await page.getByLabel('Cantidad').fill('2');
  await page.getByLabel('Precio de cada uno').fill('45');
  await btn('Anotar venta').click();
  await btn('Sí, anotar').click();
  await text('2 × Ventilador', { exact: true }).waitFor();
  await text('Q210.00').first().waitFor();
  await shot('2-caja1');
  const moves = Object.values((await cloud()).moves).filter((m) => m.kind === 'sale');
  assert.equal(moves.length, 2);
  assert.ok(moves.every((m) => m.caja === '1' && m.by === 'worker'));
  assert.equal(await page.locator('[aria-label="Borrar venta"]').count(), 0); // el trabajador no puede borrar
  log('el trabajador anota ventas (con confirmación) y no puede borrarlas');

  // Cantidad mayor al inventario: avisa
  await page.getByLabel('Producto').selectOption({ label: 'Ventilador · Q120.00 (quedan 17)' });
  await page.getByLabel('Cantidad').fill('30');
  await btn('Anotar venta').click();
  await text('solo hay 17').waitFor();
  await btn('Cancelar').click();
  log('avisa si se quiere vender más de lo que hay');

  // Cierre del día con fondo
  await btn('Cerrar el día de la Caja 1').click();
  await page.getByLabel('Fondo que dejas en la caja').fill('abc');
  await btn('Cerrar el día', { exact: true }).click();
  await text('Escribe el fondo').waitFor();
  await page.getByLabel('Fondo que dejas en la caja').fill('300');
  await btn('Cerrar el día', { exact: true }).click();
  await text('Caja 1 cerrada ✓').waitFor();
  assert.equal(await btn('Anotar venta').count(), 0);
  assert.equal(await btn('Reabrir este día (administrador)').count(), 0);
  await shot('3-cerrada');
  const closing = Object.values((await cloud()).closings)[0];
  assert.deepEqual([closing.caja, closing.fondo, closing.sold, closing.by], ['1', 300, 210, 'worker']);
  log('cierra el día con el fondo y la caja queda bloqueada');

  // La otra caja sigue abierta
  await btn(/Caja 2/).click();
  await text('Anotar una venta · Caja 2').waitFor();
  await page.getByLabel('Producto').selectOption({ label: 'Cargador · Q50.00 (quedan 20)' });
  await page.getByLabel('Cantidad').fill('1');
  await btn('Anotar venta').click();
  await btn('Sí, anotar').click();
  await text('1 × Cargador', { exact: true }).waitFor();
  await text('Fondo Q300.00 · cerrada ✓').waitFor();
  log('la Caja 2 sigue abierta y ve el cierre de la Caja 1');

  // Inventario del trabajador: solo lectura, con lo vendido
  await page.goto(url + '#/inventory');
  await text('19 en existencia').waitFor(); // abre en su caja (la 2)
  await btn('Caja 1', { exact: true }).click();
  assert.equal(await text('Cargador', { exact: true }).count(), 0); // el cargador no es de la Caja 1
  await btn('Todos').click();
  await text('17 en existencia').waitFor();
  assert.equal(await btn('Agregar producto').count(), 0);
  await shot('4-inventario-trabajador');
  log('el inventario baja con las ventas (19 y 17) y es de solo lectura para el trabajador');

  // --- Administrador revisa y corrige
  // otro teléfono: se conserva solo la "nube" simulada
  await page.evaluate(() => { const c = localStorage.getItem('mem_cloud_v1'); localStorage.clear(); localStorage.setItem('mem_cloud_v1', c); });
  await page.goto(url);
  await page.reload();
  const adminPw = page.locator('input[type=password]');
  await adminPw.fill('admin-secreta');
  await btn('Entrar').click();
  await text('¿Qué modelo buscas?').waitFor();
  await btn('Ventas del día').click();
  await text('Total vendido').waitFor();
  await text('Q260.00').first().waitFor();
  await text('Lo que se vendió (las dos cajas)').waitFor();
  await shot('5-admin');
  await btn(/Caja 1/).click();
  await btn('Reabrir este día (administrador)').click();
  await btn('Reabrir', { exact: true }).click();
  await text('Anotar una venta · Caja 1').waitFor();
  await page.locator('[aria-label="Borrar venta"]').first().click();
  await btn('Borrar', { exact: true }).click();
  await page.waitForTimeout(300);
  assert.equal(Object.values((await cloud()).moves).filter((m) => m.kind === 'sale').length, 2);
  assert.equal(Object.keys((await cloud()).closings).length, 0);
  log('el administrador ve el resumen, reabre un día y corrige una venta');

  assert.deepEqual(errs, [], errs.join('\n'));
  log('sin errores en la consola\n\nTODO BIEN');
  await browser.close();
  server.close();
})().catch((e) => { console.error('\nFALLÓ:', e.message); server.close(); process.exit(1); });
