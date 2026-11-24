// Ventas, inventario y cierre de caja: lógica pura (sin pantalla ni red).
//
// Todo se guarda como "movimientos" que solo se agregan (nunca se editan):
//   products/{id}  → { name, price }                      (lo administra el administrador)
//   moves/{id}     → { productId, productName, kind: 'sale'|'in'|'adjust', qty, price?, caja?, day, by, at }
//   closings/{day_caja} → { day, caja, fondo, sold, count, by, at }   (cierre del día de una caja)
// Las existencias se calculan: entradas + ajustes − ventas. Así dos cajas (dos teléfonos) venden
// al mismo tiempo sin pisarse y nadie puede cambiar una venta ya anotada.

export const CAJAS = ['1', '2'];

/** Letras pequeñas debajo de cada caja. */
export const CAJA_NAMES = { 1: 'Accesorios', 2: 'Carros eléctricos' };

/** Categorías de producto (el administrador puede escribir otra al agregar un producto). */
export const CATEGORIES = ['Protectores', 'Cargadores', 'Cables', 'Bocinas', 'Gorras', 'Accesorios infantil', 'Accesorios para hombres', 'Carros eléctricos'];
export const NO_CATEGORY = 'Sin categoría';

/** Categorías que se muestran: las de siempre más las que se hayan usado. */
export function categoriesIn(products) {
  const used = new Set(Object.values(products).map((p) => p.category).filter(Boolean));
  return [...CATEGORIES, ...[...used].filter((c) => !CATEGORIES.includes(c)).sort((a, b) => a.localeCompare(b, 'es'))];
}

const fold = (s) => String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

/**
 * Busca productos por nombre, categoría, código de barras o PRECIO.
 * "50" o "Q50" o "50.00" encuentra los de ese precio (y los que empiezan así, como 500); el texto, los nombres.
 * @param {object[]} products lista de productos
 * @param {string} query lo que se escribió
 * @param {{category?: string}} opts category: '' = todas, o el nombre (NO_CATEGORY = sin categoría)
 */
export function searchProducts(products, query, { category = '' } = {}) {
  const q = fold(query).trim();
  const num = q.replace(/^q/, '').replace(',', '.');
  const isNum = /^\d+(\.\d{0,2})?$/.test(num);
  const price = (p) => Math.round(Number(p.price) * 100) / 100;
  return products
    .filter((p) => !category || (category === NO_CATEGORY ? !p.category : p.category === category))
    .filter((p) => {
      if (!q) return true;
      if (fold(p.name).includes(q) || fold(p.category).includes(q) || (p.barcode ?? '').includes(q)) return true;
      if (isNum) {
        const s = String(price(p));
        return s === String(Number(num)) || s.startsWith(num.replace(/\.$/, ''));
      }
      return false;
    })
    .sort((a, b) => {
      const exact = (p) => (isNum && price(p) === Number(num) ? 0 : 1);
      return exact(a) - exact(b) || a.name.localeCompare(b.name, 'es');
    });
}

/** Cajas donde se vende un producto (por omisión, las dos). */
export function parseCajas(v) {
  const list = Array.isArray(v) ? v.filter((c) => CAJAS.includes(c)) : [];
  return list.length ? CAJAS.filter((c) => list.includes(c)) : [...CAJAS];
}

export const productInCaja = (p, caja) => parseCajas(p.cajas).includes(caja);

/** "Las dos cajas" / "Solo Caja 1" / "Solo Caja 2" */
export function cajasLabel(cajas) {
  const c = parseCajas(cajas);
  return c.length === CAJAS.length ? 'Las dos cajas' : `Solo Caja ${c[0]}`;
}

const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

/** 1234.5 → "Q1,234.50" */
export function money(n) {
  const v = round2(Number.isFinite(Number(n)) ? Number(n) : 0);
  const neg = v < 0;
  const [int, dec] = Math.abs(v).toFixed(2).split('.');
  return `${neg ? '-' : ''}Q${int.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}.${dec}`;
}

/** "50", "50.5", "1,200.50", "Q50", "50,5" → número; null si no se entiende o es negativo. */
export function parseMoney(text) {
  let s = String(text ?? '').replace(/[Qq\s]/g, '');
  if (!s) return null;
  if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) s = s.replace(/,/g, '');
  else s = s.replace(',', '.');
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 && n < 10_000_000 ? round2(n) : null;
}

/** Cantidad entera positiva ("3" → 3); null si no sirve. */
export function parseQty(text) {
  const s = String(text ?? '').trim();
  if (!/^\d{1,4}$/.test(s)) return null;
  const n = Number(s);
  return n >= 1 ? n : null;
}

/** Fecha local AAAA-MM-DD (la del día de trabajo, no la de UTC). */
export function dayString(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export const closingId = (day, caja) => `${day}_${caja}`;

export const newId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

/** Existencias de un producto. */
export function stockOf(productId, moves) {
  let n = 0;
  for (const m of Object.values(moves)) {
    if (m.productId !== productId) continue;
    n += m.kind === 'sale' ? -m.qty : m.qty;
  }
  return n;
}

/** { productId: existencias } de todos de una vez. */
export function stockMap(moves) {
  const out = {};
  for (const m of Object.values(moves)) out[m.productId] = (out[m.productId] ?? 0) + (m.kind === 'sale' ? -m.qty : m.qty);
  return out;
}

/** Ventas de un día (y de una caja, si se indica), más nuevas primero, con totales. */
export function daySales(moves, day, caja = null) {
  const sales = Object.entries(moves)
    .map(([id, m]) => ({ id, ...m }))
    .filter((m) => m.kind === 'sale' && m.day === day && (caja === null || m.caja === caja))
    .sort((a, b) => b.at - a.at);
  const total = round2(sales.reduce((s, m) => s + m.qty * m.price, 0));
  const count = sales.reduce((s, m) => s + m.qty, 0);
  return { sales, total, count };
}

/** Ventas agrupadas por producto: [{ name, qty, total }] de mayor a menor total. */
export function byProduct(sales) {
  const map = new Map();
  for (const s of sales) {
    const cur = map.get(s.productId) ?? { productId: s.productId, name: s.productName, qty: 0, total: 0 };
    cur.qty += s.qty;
    cur.total = round2(cur.total + s.qty * s.price);
    map.set(s.productId, cur);
  }
  return [...map.values()].sort((a, b) => b.total - a.total);
}

/** Resumen del día de las dos cajas: totales, fondos y si cada caja ya cerró. */
export function dayOverview(moves, closings, day) {
  const cajas = CAJAS.map((caja) => {
    const { total, count } = daySales(moves, day, caja);
    const closing = closings[closingId(day, caja)] ?? null;
    return { caja, total, count, closed: !!closing, fondo: closing?.fondo ?? null, closing };
  });
  return { cajas, total: round2(cajas.reduce((s, c) => s + c.total, 0)), count: cajas.reduce((s, c) => s + c.count, 0), fondo: round2(cajas.reduce((s, c) => s + (c.fondo ?? 0), 0)) };
}

// ---------------------------------------------------------------- Documentos a guardar

export function saleDoc({ product, qty, price, caja, day, by, at = Date.now() }) {
  return { productId: product.id, productName: product.name, kind: 'sale', qty, price: round2(price), caja, day, by, at };
}

export function stockDoc({ product, qty, kind, by, at = Date.now() }) {
  return { productId: product.id, productName: product.name, kind, qty, day: dayString(new Date(at)), by, at };
}

export function closingDoc({ day, caja, fondo, sold, count, by, at = Date.now() }) {
  return { day, caja, fondo: round2(fondo), sold: round2(sold), count, by, at };
}
