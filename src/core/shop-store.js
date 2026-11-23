// Copia local de productos, movimientos y cierres + escritura. Observable, como Store.
import { saleDoc, stockDoc, closingDoc, closingId, newId, parseCajas } from './shop.js';

export class ShopStore {
  constructor(backend) {
    this.backend = backend;
    this.products = {};
    this.moves = {};
    this.closings = {};
    this.loaded = { products: false, moves: false, closings: false };
    this.listeners = new Set();
    this.onWriteError = null;
  }

  get ready() {
    return this.loaded.products && this.loaded.moves && this.loaded.closings;
  }

  subscribe(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  emit() {
    for (const fn of [...this.listeners]) fn();
  }

  setProducts(docs) {
    this.products = Object.fromEntries(Object.entries(docs).map(([id, d]) => [id, { id, name: String(d.name ?? ''), price: Number(d.price ?? 0), cajas: parseCajas(d.cajas) }]));
    this.loaded.products = true;
    this.emit();
  }

  setMoves(docs) {
    this.moves = docs;
    this.loaded.moves = true;
    this.emit();
  }

  setClosings(docs) {
    this.closings = docs;
    this.loaded.closings = true;
    this.emit();
  }

  reset() {
    this.products = {};
    this.moves = {};
    this.closings = {};
    this.loaded = { products: false, moves: false, closings: false };
    this.emit();
  }

  /** Productos ordenados por nombre. */
  productList() {
    return Object.values(this.products).sort((a, b) => a.name.localeCompare(b.name, 'es'));
  }

  write(writes) {
    return Promise.resolve(this.backend.commit(writes)).catch((e) => {
      this.onWriteError?.(e);
      throw e;
    });
  }

  // Trabajadores y administrador
  recordSale(args) {
    const id = newId();
    return this.write([{ col: 'moves', id, doc: saleDoc(args) }]);
  }

  closeDay(args) {
    return this.write([{ col: 'closings', id: closingId(args.day, args.caja), doc: closingDoc(args) }]);
  }

  // Solo administrador
  saveProduct({ id = null, name, price, cajas = ['1', '2'], initialStock = 0, by = 'admin' }) {
    const pid = id ?? newId();
    const writes = [{ col: 'products', id: pid, doc: { name: name.trim(), price, cajas: parseCajas(cajas) } }];
    if (!id && initialStock > 0) writes.push({ col: 'moves', id: newId(), doc: stockDoc({ product: { id: pid, name: name.trim() }, qty: initialStock, kind: 'in', by }) });
    return this.write(writes);
  }

  addStock(product, qty, by = 'admin') {
    return this.write([{ col: 'moves', id: newId(), doc: stockDoc({ product, qty, kind: qty >= 0 ? 'in' : 'adjust', by }) }]);
  }

  deleteProduct(id) {
    return this.write([{ col: 'products', id, doc: null }]);
  }

  deleteMove(id) {
    return this.write([{ col: 'moves', id, doc: null }]);
  }

  reopenDay(day, caja) {
    return this.write([{ col: 'closings', id: closingId(day, caja), doc: null }]);
  }
}
