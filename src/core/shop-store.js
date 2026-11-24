// Copia local de productos, movimientos y cierres + escritura. Observable, como Store.
import { nextBarcode } from './barcode.js';
import { saleDoc, stockDoc, closingDoc, closingId, newId, parseCajas } from './shop.js';

export class ShopStore {
  constructor(backend) {
    this.backend = backend;
    this.products = {};
    this.moves = {};
    this.closings = {};
    this.costs = {}; // solo el administrador la recibe: { productId: { cost } }
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
    this.products = Object.fromEntries(Object.entries(docs).map(([id, d]) => [id, { id, name: String(d.name ?? ''), price: Number(d.price ?? 0), cajas: parseCajas(d.cajas), give: Number(d.give) > 0 ? Number(d.give) : 0, barcode: typeof d.barcode === 'string' ? d.barcode : '', category: typeof d.category === 'string' ? d.category : '' }]));
    this.loaded.products = true;
    this.emit();
  }

  setMoves(docs) {
    this.moves = docs;
    this.loaded.moves = true;
    this.emit();
  }

  setCosts(docs) {
    this.costs = docs;
    this.emit();
  }

  /** Precio de costo de un producto (0 si no se ha anotado o si no eres administrador). */
  costOf(id) {
    return Number(this.costs[id]?.cost) > 0 ? Number(this.costs[id].cost) : 0;
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
    this.costs = {};
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
  /** Todos los códigos de barras que ya existen. */
  barcodes() {
    return Object.values(this.products).map((p) => p.barcode).filter(Boolean);
  }

  /** Producto que tiene ese código (o undefined). */
  byBarcode(code) {
    return Object.values(this.products).find((p) => p.barcode && p.barcode === code);
  }

  /**
   * Guarda un producto. `barcode` es el código nuevo ('' = sin código). Si cambia, se registra el nuevo en
   * "barcodes" (la nube rechaza un código repetido) y se libera el anterior.
   */
  saveProduct({ id = null, name, price, cajas = ['1', '2'], category = '', give = 0, cost = 0, initialStock = 0, barcode = '', by = 'admin' }) {
    const pid = id ?? newId();
    const old = id ? (this.products[id]?.barcode ?? '') : '';
    const writes = [{ col: 'products', id: pid, doc: { name: name.trim(), price, cajas: parseCajas(cajas), ...(category ? { category } : {}), ...(give > 0 ? { give } : {}), ...(barcode ? { barcode } : {}) } }];
    // El costo va aparte y solo lo lee el administrador.
    if (cost > 0) writes.push({ col: 'costs', id: pid, doc: { cost } });
    else if (id && this.costs[id]) writes.push({ col: 'costs', id: pid, doc: null });
    if (barcode && barcode !== old) writes.push({ col: 'barcodes', id: barcode, doc: { productId: pid } });
    if (old && old !== barcode) writes.push({ col: 'barcodes', id: old, doc: null });
    if (!id && initialStock > 0) writes.push({ col: 'moves', id: newId(), doc: stockDoc({ product: { id: pid, name: name.trim() }, qty: initialStock, kind: 'in', by }) });
    return this.write(writes);
  }

  addStock(product, qty, by = 'admin') {
    return this.write([{ col: 'moves', id: newId(), doc: stockDoc({ product, qty, kind: qty >= 0 ? 'in' : 'adjust', by }) }]);
  }

  deleteProduct(id) {
    const code = this.products[id]?.barcode;
    return this.write([{ col: 'products', id, doc: null }, ...(this.costs[id] ? [{ col: 'costs', id, doc: null }] : []), ...(code ? [{ col: 'barcodes', id: code, doc: null }] : [])]);
  }

  /** Cuántos productos todavía no tienen código. */
  missingBarcodes() {
    return Object.values(this.products).filter((p) => !p.barcode);
  }

  /** Le pone un código interno único a cada producto que no tiene. Devuelve cuántos. */
  assignMissingBarcodes() {
    const used = this.barcodes();
    const writes = [];
    for (const p of this.missingBarcodes().sort((a, b) => a.name.localeCompare(b.name, 'es'))) {
      const code = nextBarcode(used);
      used.push(code);
      writes.push({ col: 'products', id: p.id, doc: { name: p.name, price: p.price, cajas: p.cajas, ...(p.category ? { category: p.category } : {}), ...(p.give > 0 ? { give: p.give } : {}), barcode: code } });
      writes.push({ col: 'barcodes', id: code, doc: { productId: p.id } });
    }
    return writes.length ? this.write(writes).then(() => writes.length / 2) : Promise.resolve(0);
  }

  deleteMove(id) {
    return this.write([{ col: 'moves', id, doc: null }]);
  }

  reopenDay(day, caja) {
    return this.write([{ col: 'closings', id: closingId(day, caja), doc: null }]);
  }
}
