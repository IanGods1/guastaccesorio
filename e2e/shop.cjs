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
  const pickProduct = async (q, name) => {
    await page.getByLabel('Buscar producto').fill(q);
    await page.locator('.results').getByText(name, { exact: true }).click();
  };
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
    if (name === 'Ventilador') {
      await page.getByPlaceholder('ej. 80 (solo lo ves tú)').fill('80');
      await page.getByPlaceholder('ej. 100 (lo más bajo que se da)').fill('100');
    }
    await page.getByPlaceholder('ej. 20').fill(stock);
    await btn('Guardar').click();
    await text(name, { exact: true }).waitFor();
  }
  // Categorías: una de la lista y una nueva
  await text('Cargador', { exact: true }).click();
  await page.getByLabel('Categoría').selectOption('Cargadores');
  await btn('Guardar').click();
  await text('Cargadores · Q50.00').waitFor();
  await text('Ventilador', { exact: true }).click();
  await page.getByLabel('Categoría').selectOption({ label: 'Otra categoría…' });
  await page.getByPlaceholder('Escribe la categoría nueva').fill('Ventiladores');
  await btn('Guardar').click();
  await text('Ventiladores · Q120.00').waitFor();
  await btn('Ventiladores', { exact: true }).click();
  assert.equal(await text('Cargador', { exact: true }).count(), 0);
  await btn('Todas', { exact: true }).click();
  await page.getByLabel('Buscar por nombre, precio o código').or(page.getByPlaceholder('Buscar por nombre, precio o código')).first().fill('50');
  await text('Cargador', { exact: true }).waitFor(); // buscar por precio
  await page.getByPlaceholder('Buscar por nombre, precio o código').fill('');
  log('categorías (de la lista y nuevas), filtro por categoría y búsqueda por precio en el inventario');
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
  const searchBox = page.getByLabel('Buscar producto');
  await text('Caja 1', { exact: true }).first().waitFor();
  await text('Accesorios', { exact: true }).waitFor(); // letras pequeñas debajo de cada caja
  await text('Carros eléctricos', { exact: true }).waitFor();
  await searchBox.fill('zzz');
  await text('No hay productos con "zzz"').waitFor();
  await searchBox.fill('50'); // por precio
  await page.locator('.results').getByText('Cargador', { exact: true }).waitFor();
  await searchBox.fill('120');
  await page.locator('.results').getByText('Ventilador', { exact: true }).waitFor();
  log('en Ventas se busca por nombre y por precio; cada caja muestra su nombre');
  await searchBox.fill('0000000000000');
  await searchBox.press('Enter');
  await text('No hay productos con').first().waitFor();
  await searchBox.fill(prods.find((p) => p.name === 'Cargador').barcode);
  await searchBox.press('Enter'); // lector de códigos
  await text('Cargadores · Q50.00 · quedan 20').waitFor();
  assert.equal(await page.getByLabel('Precio de cada uno').inputValue(), '50');
  await page.getByRole('button', { name: 'Cambiar' }).click();
  log('un código escaneado elige el producto');
  await pickProduct('ventil', 'Ventilador');
  assert.equal(await page.getByLabel('Precio de cada uno').inputValue(), '120');
  await btn('Anotar venta').click();
  await text('1 × Ventilador a Q120.00 = Q120.00').waitFor();
  await btn('Sí, anotar').click();
  await text('1 × Ventilador', { exact: true }).waitFor();
  await pickProduct('ventil', 'Ventilador');
  await page.getByLabel('Cantidad').fill('2');
  await page.getByLabel('Precio de cada uno').fill('45');
  await btn('Anotar venta').click();
  await text('por debajo de lo más bajo que se puede dar (Q100.00)').waitFor(); // avisa si baja del precio para dar
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
  await pickProduct('ventil', 'Ventilador');
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
  await pickProduct('carga', 'Cargador');
  await page.getByLabel('Cantidad').fill('1');
  await btn('Anotar venta').click();
  await btn('Sí, anotar').click();
  await text('1 × Cargador', { exact: true }).waitFor();
  await text('Fondo Q300.00 · cerrada ✓').waitFor();
  log('la Caja 2 sigue abierta y ve el cierre de la Caja 1');

  // Inventario del trabajador: solo lectura, con lo vendido
  await page.goto(url + '#/inventory');
  await text('19 en existencia').waitFor();
  await text('17 en existencia').waitFor();
  assert.equal(await btn('Agregar producto').count(), 0);
  await shot('4-inventario-trabajador');
  log('el inventario baja con las ventas (19 y 17) y es de solo lectura para el trabajador');

  // Pantalla de precios (para decir "a cómo sale")
  await page.goto(url + '#/prices');
  await text('Ventilador', { exact: true }).waitFor();
  await text('Q120.00').waitFor();
  await text('Para dar: Q100.00').waitFor(); // el trabajador ve el precio para dar
  assert.equal(await text(/Costo Q/).count(), 0); // pero no el costo
  await page.getByLabel('Buscar precio').fill('50');
  await text('Cargador', { exact: true }).waitFor();
  assert.equal(await text('Ventilador', { exact: true }).count(), 0);
  await page.getByLabel('Buscar precio').fill('');
  await btn('Ventiladores', { exact: true }).click();
  assert.equal(await text('Cargador', { exact: true }).count(), 0);
  await shot('4b-precios');
  log('Precios: se busca por nombre, precio o categoría');

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
  await text('Ganancia aproximada').waitFor(); // el administrador ve su ganancia (venta − costo)
  await page.goto(url + '#/prices');
  await text('Costo Q80.00 · gana Q40.00').waitFor();
  await page.goBack();
  await text('Total vendido').waitFor();
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
