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
