// Precios: buscar un producto (por nombre, precio, categoría o código) para decir "a cómo sale".
import { h, clear, appBar, emptyState, toast } from './dom.js';
import { money, stockMap, searchProducts, categoriesIn, NO_CATEGORY } from '../core/shop.js';
import { normalizeCode } from '../core/barcode.js';
import { openScanner, scanButton } from './scanner.js';

export function PricesScreen(app) {
  const shop = app.shop;
  const isAdmin = app.auth.role === 'ADMIN';
  let query = '';
  let category = '';
  const chips = h('div', { class: 'brand-filter' });
  const list = h('div', { class: 'stack' });
  const input = h('input', {
    class: 'input', type: 'search', placeholder: 'Buscar por nombre, precio o código', autocomplete: 'off', 'aria-label': 'Buscar precio',
    oninput: (e) => ((query = e.target.value), render()),
    // Un lector de códigos escribe el código y manda Enter: se muestra solo ese producto.
    onkeydown: (e) => {
      if (e.key !== 'Enter') return;
      const p = shop.byBarcode(normalizeCode(input.value.trim()) ?? input.value.trim());
      if (p) ((query = p.name), (input.value = p.name), render());
    },
  });

  function render() {
    if (!shop.ready) return clear(list, h('div', { class: 'spinner' }));
    const all = shop.productList();
    const used = new Set(all.map((p) => p.category || NO_CATEGORY));
    const catList = [...categoriesIn(shop.products).filter((c) => used.has(c)), ...(used.has(NO_CATEGORY) ? [NO_CATEGORY] : [])];
    if (category && !catList.includes(category)) category = '';
    clear(chips, [['', 'Todas'], ...catList.map((c) => [c, c])].map(([v, label]) => h('button', { class: `chip${v === category ? ' on' : ''}`, type: 'button', onclick: () => ((category = v), render()) }, label)));
    const items = searchProducts(all, query, { category });
    if (!items.length) return clear(list, emptyState(all.length ? 'No se encontró ese producto' : 'Todavía no hay productos', all.length ? 'Prueba con otro nombre o con el precio.' : 'El administrador los agrega en Inventario.'));
    const stocks = stockMap(shop.moves);
    clear(
      list,
      h(
        'div',
        { class: 'card' },
        items.map((p) => {
          const n = stocks[p.id] ?? 0;
          return h(
            'div',
            { class: 'list-item' },
            h('div', { class: 'grow' }, h('div', { class: 'li-title' }, p.name), h('div', { class: 'li-sub' }, `${p.category || NO_CATEGORY} · ${n <= 0 ? 'agotado' : `hay ${n}`}`)),
            h('div', { class: 'price-col' }, h('b', { class: 'price-big' }, money(p.price)), p.give ? h('div', { class: 'li-sub' }, `Para dar: ${money(p.give)}`) : null, isAdmin && shop.costOf(p.id) ? h('div', { class: 'li-sub' }, `Costo ${money(shop.costOf(p.id))} · gana ${money(p.price - shop.costOf(p.id))}`) : null),
          );
        }),
      ),
      h('p', { class: 'muted small center' }, `${items.length} producto${items.length === 1 ? '' : 's'}`),
    );
  }

  render();
  return { el: h('div', { class: 'screen' }, appBar({ title: 'Precios', subtitle: 'A cómo sale cada producto', onBack: () => app.router.back('/') }), h('main', { class: 'content' }, h('div', { class: 'search-row' }, input, scanButton(() => openScanner({ onCode: (c) => { const p = shop.byBarcode(normalizeCode(c) ?? c); if (p) { query = p.name; input.value = p.name; render(); } else toast(`No existe el código ${c}`); } }))), chips, list)), update: render };
}
