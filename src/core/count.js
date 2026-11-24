// Conteo de inventario: lo que se cuenta se va sumando por producto; al terminar se compara con el
// sistema y se puede mandar el resultado por WhatsApp. Lógica pura (sin pantalla).

export const emptyCount = () => ({ items: {}, order: [], startedAt: Date.now() });

/** Suma `qty` a lo ya contado de ese producto (la segunda vez que cuentas el mismo, se suma). */
export function addToCount(count, id, qty) {
  const items = { ...count.items, [id]: (count.items[id] ?? 0) + qty };
  return { ...count, items, order: [id, ...count.order.filter((x) => x !== id)] };
}

/** Pone una cantidad exacta (0 o menos = quitar de la lista). */
export function setCount(count, id, qty) {
  if (!(qty > 0)) return removeFromCount(count, id);
  return { ...count, items: { ...count.items, [id]: qty }, order: count.order.includes(id) ? count.order : [id, ...count.order] };
}

export function removeFromCount(count, id) {
  const { [id]: _gone, ...items } = count.items;
  return { ...count, items, order: count.order.filter((x) => x !== id) };
}

/** Filas del conteo (más reciente primero) comparadas con las existencias del sistema. */
export function countRows(count, products, stocks) {
  return count.order
    .filter((id) => count.items[id] > 0)
    .map((id) => {
      const p = products[id];
      const system = stocks[id] ?? 0;
      return { id, name: p?.name ?? '(producto eliminado)', category: p?.category ?? '', counted: count.items[id], system, diff: count.items[id] - system, gone: !p };
    });
}

export function countTotals(rows) {
  return { products: rows.length, units: rows.reduce((s, r) => s + r.counted, 0), different: rows.filter((r) => r.diff !== 0).length };
}

/** Productos con existencias en el sistema que no se contaron. */
export function uncountedProducts(count, productList, stocks) {
  return productList.filter((p) => !(count.items[p.id] > 0) && (stocks[p.id] ?? 0) > 0);
}

const sign = (n) => (n > 0 ? `+${n}` : String(n));

/** Texto del resultado para WhatsApp (con *negritas* de WhatsApp). */
export function whatsappText({ rows, uncounted = [], date = new Date(), title = 'Inventario' }) {
  const t = countTotals(rows);
  const when = date.toLocaleString('es', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  const lines = [`*${title}* · Guastaccesorio`, when, '', `Contados: ${t.products} producto${t.products === 1 ? '' : 's'} · ${t.units} unidad${t.units === 1 ? '' : 'es'}`];
  if (t.different) lines.push(`Con diferencia: ${t.different}`);
  lines.push('');
  for (const r of [...rows].sort((a, b) => a.name.localeCompare(b.name, 'es'))) {
    lines.push(`• ${r.name}: *${r.counted}*${r.diff !== 0 ? ` (sistema ${r.system}, ${sign(r.diff)})` : ''}`);
  }
  if (uncounted.length) {
    lines.push('', `Sin contar (${uncounted.length}): ${uncounted.slice(0, 40).map((p) => p.name).join(', ')}${uncounted.length > 40 ? '…' : ''}`);
  }
  return lines.join('\n');
}

/** Número de WhatsApp solo con dígitos (con código de país); '' si no sirve. */
export function normalizePhone(text) {
  const d = String(text ?? '').replace(/\D/g, '');
  return d.length >= 8 && d.length <= 15 ? d : '';
}

/** Enlace de WhatsApp: con número, abre ese chat; sin número, deja elegir a quién. */
export function whatsappUrl(text, number = '') {
  const n = normalizePhone(number);
  return `https://wa.me/${n}?text=${encodeURIComponent(text)}`;
}
