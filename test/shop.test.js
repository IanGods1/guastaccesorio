import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCajas, productInCaja, cajasLabel, money, parseMoney, parseQty, dayString, stockOf, stockMap, daySales, byProduct, dayOverview, saleDoc, stockDoc, closingDoc, closingId } from '../src/core/shop.js';
import { ShopStore } from '../src/core/shop-store.js';
import { MemoryBackend, newCloud } from '../src/backend-memory.js';

test('shop: dinero y cantidades', () => {
  assert.equal(money(1234.5), 'Q1,234.50');
  assert.equal(money(0), 'Q0.00');
  assert.equal(money(-5), '-Q5.00');
  assert.equal(parseMoney('Q50'), 50);
  assert.equal(parseMoney('1,200.50'), 1200.5);
  assert.equal(parseMoney('50,5'), 50.5);
  assert.equal(parseMoney('abc'), null);
  assert.equal(parseMoney('-3'), null);
  assert.equal(parseMoney('1.234'), null);
  assert.equal(parseQty('3'), 3);
  assert.equal(parseQty('0'), null);
  assert.equal(parseQty('2.5'), null);
  assert.equal(dayString(new Date(2026, 10, 3, 23, 59)), '2026-11-03');
});

const fan = { id: 'p1', name: 'Ventilador', price: 120 };
const charger = { id: 'p2', name: 'Cargador', price: 50 };

test('shop: existencias = entradas + ajustes − ventas', () => {
  const moves = {
    a: stockDoc({ product: fan, qty: 20, kind: 'in', by: 'admin', at: 1 }),
    b: saleDoc({ product: fan, qty: 1, price: 120, caja: '1', day: '2026-11-23', by: 'worker', at: 2 }),
    c: stockDoc({ product: charger, qty: 20, kind: 'in', by: 'admin', at: 3 }),
    d: saleDoc({ product: charger, qty: 1, price: 50, caja: '2', day: '2026-11-23', by: 'worker', at: 4 }),
    e: stockDoc({ product: charger, qty: -2, kind: 'adjust', by: 'admin', at: 5 }),
  };
  assert.equal(stockOf('p1', moves), 19);
  assert.equal(stockOf('p2', moves), 17);
  assert.deepEqual(stockMap(moves), { p1: 19, p2: 17 });
});

test('shop: ventas del día por caja, por producto y resumen de las dos cajas', () => {
  const moves = {
    a: saleDoc({ product: fan, qty: 1, price: 120, caja: '1', day: '2026-11-23', by: 'worker', at: 1 }),
    b: saleDoc({ product: charger, qty: 2, price: 45.5, caja: '1', day: '2026-11-23', by: 'worker', at: 2 }),
    c: saleDoc({ product: charger, qty: 1, price: 50, caja: '2', day: '2026-11-23', by: 'worker', at: 3 }),
    d: saleDoc({ product: fan, qty: 1, price: 120, caja: '1', day: '2026-11-22', by: 'worker', at: 4 }), // otro día
  };
  const c1 = daySales(moves, '2026-11-23', '1');
  assert.equal(c1.total, 211);
  assert.equal(c1.count, 3);
  assert.deepEqual(c1.sales.map((s) => s.at), [2, 1]); // más nueva primero
  assert.deepEqual(byProduct(c1.sales).map((p) => [p.name, p.qty, p.total]), [['Ventilador', 1, 120], ['Cargador', 2, 91]]);
  const closings = { [closingId('2026-11-23', '1')]: closingDoc({ day: '2026-11-23', caja: '1', fondo: 300, sold: 211, count: 3, by: 'worker' }) };
  const ov = dayOverview(moves, closings, '2026-11-23');
  assert.equal(ov.total, 261);
  assert.equal(ov.fondo, 300);
  assert.deepEqual(ov.cajas.map((c) => [c.caja, c.total, c.closed]), [['1', 211, true], ['2', 50, false]]);
});

test('shop: reglas — el trabajador solo anota ventas y cierra; nunca edita ni borra', async () => {
  const cloud = newCloud();
  const admin = new MemoryBackend(cloud);
  await admin.createOrSignInAdmin('adm');
  await admin.writeInitialConfig('tok', 'salt', 1);
  const worker = new MemoryBackend(cloud);
  await worker.startWorkerSession('tok');
  const a = new ShopStore(admin);
  const w = new ShopStore(worker);
  for (const [b, s] of [[admin, a], [worker, w]]) b.listen({ onProducts: (d) => s.setProducts(d), onMoves: (d) => s.setMoves(d), onClosings: (d) => s.setClosings(d), onError: () => {} });
  await new Promise((r) => setTimeout(r, 5));

  // El administrador crea el producto con 20 en existencia
  await a.saveProduct({ name: 'Ventilador', price: 120, initialStock: 20 });
  const product = a.productList()[0];
  assert.equal(stockOf(product.id, w.moves), 20); // el otro teléfono lo ve al instante

  // El trabajador no puede crear productos ni sumar existencias
  await assert.rejects(() => w.saveProduct({ name: 'Otro', price: 1 }), /permission|denied/i);
  await assert.rejects(() => w.addStock(product, 5, 'worker'));

  // Anota una venta: las dos cajas ven 19
  await w.recordSale({ product, qty: 1, price: 120, caja: '1', day: '2026-11-23', by: 'worker' });
  assert.equal(stockOf(product.id, a.moves), 19);
  assert.equal(daySales(a.moves, '2026-11-23', '1').total, 120);

  // No puede borrar ni cambiar lo anotado
  const [saleId] = Object.keys(w.moves).filter((id) => w.moves[id].kind === 'sale');
  await assert.rejects(() => w.deleteMove(saleId));
  await assert.rejects(() => worker.commit([{ col: 'moves', id: saleId, doc: { ...w.moves[saleId], qty: 0 + 1, price: 1 } }]));

  // Datos inválidos
  await assert.rejects(() => w.recordSale({ product, qty: -1, price: 10, caja: '1', day: '2026-11-23', by: 'worker' }));
  await assert.rejects(() => w.recordSale({ product, qty: 1, price: 10, caja: '3', day: '2026-11-23', by: 'worker' }));
  await assert.rejects(() => w.recordSale({ product, qty: 1, price: 10, caja: '1', day: '2026-11-23', by: 'admin' }));

  // Cierra el día de la caja 1 con fondo; ya no puede anotar ni cerrar otra vez; la caja 2 sigue abierta
  await w.closeDay({ day: '2026-11-23', caja: '1', fondo: 300, sold: 120, count: 1, by: 'worker' });
  assert.equal(a.closings['2026-11-23_1'].fondo, 300);
  await assert.rejects(() => w.recordSale({ product, qty: 1, price: 120, caja: '1', day: '2026-11-23', by: 'worker' }));
  await assert.rejects(() => w.closeDay({ day: '2026-11-23', caja: '1', fondo: 999, sold: 0, count: 0, by: 'worker' }));
  await assert.rejects(() => w.reopenDay('2026-11-23', '1'));
  await w.recordSale({ product, qty: 2, price: 120, caja: '2', day: '2026-11-23', by: 'worker' });
  assert.equal(stockOf(product.id, w.moves), 17);

  // El administrador sí puede corregir
  await a.deleteMove(saleId);
  assert.equal(stockOf(product.id, a.moves), 18);
  await a.reopenDay('2026-11-23', '1');
  assert.equal(a.closings['2026-11-23_1'], undefined);
});

test('shop: cada producto se vende en una caja o en las dos', () => {
  assert.deepEqual(parseCajas(undefined), ['1', '2']);
  assert.deepEqual(parseCajas(['2']), ['2']);
  assert.deepEqual(parseCajas(['x']), ['1', '2']);
  assert.equal(productInCaja({ cajas: ['1'] }, '2'), false);
  assert.equal(productInCaja({}, '2'), true);
  assert.equal(cajasLabel(['2']), 'Solo Caja 2');
  assert.equal(cajasLabel(['1', '2']), 'Las dos cajas');
});

test('shop: el código de barras nunca se repite (la nube lo rechaza)', async () => {
  const cloud = newCloud();
  const admin = new MemoryBackend(cloud);
  await admin.createOrSignInAdmin('adm');
  const a = new ShopStore(admin);
  admin.listen({ onProducts: (d) => a.setProducts(d), onMoves: (d) => a.setMoves(d), onClosings: (d) => a.setClosings(d), onError: () => {} });
  await new Promise((r) => setTimeout(r, 5));
  const { nextBarcode } = await import('../src/core/barcode.js');
  const c1 = nextBarcode(a.barcodes());
  await a.saveProduct({ name: 'Cargador A', price: 50, barcode: c1 });
  assert.equal(a.byBarcode(c1).name, 'Cargador A');
  // otro producto con el mismo código: se rechaza y no queda nada guardado
  await assert.rejects(() => a.saveProduct({ name: 'Cargador B', price: 60, barcode: c1 }), /permission|denied/i);
  assert.equal(a.productList().length, 1);
  // productos sin código: se les asigna uno distinto a cada uno
  await a.saveProduct({ name: 'Bocina', price: 200 });
  await a.saveProduct({ name: 'Audífonos', price: 80 });
  assert.equal(a.missingBarcodes().length, 2);
  assert.equal(await a.assignMissingBarcodes(), 2);
  const codes = a.barcodes();
  assert.equal(codes.length, 3);
  assert.equal(new Set(codes).size, 3);
  assert.equal(a.missingBarcodes().length, 0);
  // cambiar el código libera el anterior; borrar el producto libera el suyo
  const bocina = a.productList().find((p) => p.name === 'Bocina');
  const oldCode = bocina.barcode;
  const fresh = nextBarcode(a.barcodes());
  await a.saveProduct({ id: bocina.id, name: 'Bocina', price: 200, barcode: fresh });
  assert.equal(a.byBarcode(fresh).name, 'Bocina');
  assert.equal(oldCode in cloud.barcodes, false);
  await a.deleteProduct(bocina.id);
  assert.equal(fresh in cloud.barcodes, false);
});

import { searchProducts, categoriesIn, CATEGORIES, NO_CATEGORY } from '../src/core/shop.js';

test('shop: buscar por nombre, precio, categoría o código', () => {
  const list = [
    { id: '1', name: 'Cargador rápido', price: 50, category: 'Cargadores', barcode: '2000000000015' },
    { id: '2', name: 'Cable USB-C', price: 25.5, category: 'Cables' },
    { id: '3', name: 'Bocina grande', price: 500, category: 'Bocinas' },
    { id: '4', name: 'Gorra azul', price: 50, category: '' },
    { id: '5', name: 'Protector 9D', price: 15, category: 'Protectores' },
  ];
  const names = (q, o) => searchProducts(list, q, o).map((p) => p.name);
  assert.deepEqual(names('cargador'), ['Cargador rápido']);
  assert.deepEqual(names('CARGADOR'), ['Cargador rápido']);
  assert.deepEqual(names('50'), ['Cargador rápido', 'Gorra azul', 'Bocina grande']); // exactos primero; luego los que empiezan con 50
  assert.deepEqual(names('Q50'), ['Cargador rápido', 'Gorra azul', 'Bocina grande']);
  assert.deepEqual(names('25.50'), ['Cable USB-C']);
  assert.deepEqual(names('25,5'), ['Cable USB-C']);
  assert.deepEqual(names('bocinas'), ['Bocina grande']); // por categoría
  assert.deepEqual(names('2000000000015'), ['Cargador rápido']); // por código
  assert.deepEqual(names('', { category: 'Cables' }), ['Cable USB-C']);
  assert.deepEqual(names('', { category: NO_CATEGORY }), ['Gorra azul']);
  assert.deepEqual(names('zzz'), []);
  assert.equal(searchProducts(list, '').length, 5);
  assert.deepEqual(CATEGORIES.slice(0, 7), ['Protectores', 'Cargadores', 'Cables', 'Bocinas', 'Gorras', 'Accesorios infantil', 'Accesorios para hombres']);
  assert.ok(categoriesIn({ x: { category: 'Juguetes' } }).includes('Juguetes'));
});

test('shop: el costo es solo del administrador; el precio para dar lo ven todos', async () => {
  const cloud = newCloud();
  const admin = new MemoryBackend(cloud);
  await admin.createOrSignInAdmin('adm');
  await admin.writeInitialConfig('tok', 'salt', 1);
  const worker = new MemoryBackend(cloud);
  await worker.startWorkerSession('tok');
  const a = new ShopStore(admin);
  const w = new ShopStore(worker);
  let workerSawCosts = false;
  admin.listen({ onProducts: (d) => a.setProducts(d), onMoves: (d) => a.setMoves(d), onClosings: (d) => a.setClosings(d), onCosts: (d) => a.setCosts(d), onError: () => {} });
  worker.listen({ onProducts: (d) => w.setProducts(d), onMoves: (d) => w.setMoves(d), onClosings: (d) => w.setClosings(d), onCosts: () => (workerSawCosts = true), onError: () => {} });
  await new Promise((r) => setTimeout(r, 5));
  await a.saveProduct({ name: 'Cargador', price: 50, give: 45, cost: 30 });
  const p = a.productList()[0];
  assert.equal(a.costOf(p.id), 30);
  assert.equal(p.give, 45);
  assert.equal(w.productList()[0].give, 45); // el trabajador ve el precio para dar
  assert.equal(workerSawCosts, false); // y no recibe los costos
  assert.equal(w.costOf(p.id), 0);
  // el trabajador no puede escribir costos ni cambiar precios
  await assert.rejects(() => worker.commit([{ col: 'costs', id: p.id, doc: { cost: 1 } }]));
  // editar el producto conserva el precio para dar; quitar el costo lo borra
  await a.saveProduct({ id: p.id, name: 'Cargador', price: 55, give: 45, cost: 0 });
  assert.equal(a.productList()[0].give, 45);
  assert.equal(a.costOf(p.id), 0);
  assert.equal(p.id in (cloud.costs ?? {}), false);
});
