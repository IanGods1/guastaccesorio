// Inventario: existencias de cada producto (entradas − ventas). Todos lo ven en tiempo real;
// solo el administrador agrega productos, existencias y cambia precios.
import { h, clear, icon, appBar, emptyState, openDialog, toast, confirmDialog } from './dom.js';
import { money, parseMoney, stockMap, dayString, daySales, byProduct, parseCajas, productInCaja, cajasLabel, CAJAS } from '../core/shop.js';
import { normalize } from '../core/text.js';

export function InventoryScreen(app) {
  const shop = app.shop;
  const isAdmin = app.auth.role === 'ADMIN';
  let filter = '';
  // Cada caja ve solo sus productos: el trabajador empieza en su caja; el administrador, en todos.
  let view = isAdmin ? '' : CAJAS.includes(app.storage.getItem('gc_caja')) ? app.storage.getItem('gc_caja') : '1';
  const chips = h('div', { class: 'brand-filter' });
  const list = h('div', { class: 'stack' });
  const input = h('input', { class: 'input', type: 'search', placeholder: 'Buscar producto', autocomplete: 'off', oninput: (e) => ((filter = e.target.value), render()) });

  const int = (t) => (/^-?\d{1,5}$/.test(String(t).trim()) ? Number(t) : null);

  function productDialog(product) {
    const name = h('input', { class: 'input', value: product?.name ?? '', placeholder: 'ej. Ventilador', autocapitalize: 'sentences' });
    const price = h('input', { class: 'input', value: product ? String(product.price) : '', inputmode: 'decimal', placeholder: 'ej. 120 o 49.50' });
    const stock = h('input', { class: 'input', value: '', inputmode: 'numeric', placeholder: product ? 'ej. 10 (suma) o -2 (resta)' : 'ej. 20' });
    let cajas = parseCajas(product?.cajas);
    const cajaPick = h('div', { class: 'brand-filter' });
    const drawCajas = () =>
      clear(
        cajaPick,
        [['12', 'Las dos cajas', ['1', '2']], ['1', 'Solo Caja 1', ['1']], ['2', 'Solo Caja 2', ['2']]].map(([, label, value]) =>
          h('button', { class: `chip${cajas.join() === value.join() ? ' on' : ''}`, type: 'button', onclick: () => ((cajas = value), drawCajas()) }, label),
        ),
      );
    drawCajas();
    const error = h('p', { class: 'error-text' });
    const left = product ? (stockMap(shop.moves)[product.id] ?? 0) : 0;
    openDialog({
      title: product ? product.name : 'Agregar producto',
      body: [
        h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Nombre'), name),
        h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Precio (Q)'), price),
        h('div', { class: 'field' }, h('span', { class: 'field-label' }, '¿En qué caja se vende?'), cajaPick),
        h('label', { class: 'field' }, h('span', { class: 'field-label' }, product ? `Cambiar existencias (ahora hay ${left})` : 'Cuántos hay en existencia'), stock),
        product ? h('p', { class: 'small muted' }, 'Escribe cuántos llegaron para sumarlos, o un número negativo para restar (por ejemplo, si se dañaron). Déjalo vacío si no cambia.') : null,
        error,
      ],
      actions: [
        { label: 'Cancelar' },
        product ? { label: 'Eliminar', danger: true, onClick: async (close) => (close(), (await confirmDialog({ title: 'Eliminar producto', text: `¿Eliminar "${product.name}"? Las ventas ya anotadas se conservan.` })) && (shop.deleteProduct(product.id).catch(() => {}), toast('Producto eliminado'))) } : null,
        {
          label: 'Guardar',
          onClick: (close) => {
            const n = name.value.trim();
            const pr = parseMoney(price.value);
            const st = stock.value.trim() === '' ? 0 : int(stock.value);
            if (!n) return void (error.textContent = 'Escribe el nombre.');
            if (pr === null) return void (error.textContent = 'Escribe el precio, por ejemplo 50 o 49.50.');
            if (st === null) return void (error.textContent = 'Las existencias deben ser un número entero.');
            if (!product && Object.values(shop.products).some((p) => normalize(p.name) === normalize(n))) return void (error.textContent = 'Ya existe un producto con ese nombre.');
            if (product) {
              shop.saveProduct({ id: product.id, name: n, price: pr, cajas }).catch(() => {});
              if (st !== 0) shop.addStock({ id: product.id, name: n }, st).catch(() => {});
            } else shop.saveProduct({ name: n, price: pr, cajas, initialStock: Math.max(0, st) }).catch(() => {});
            close();
            toast(product ? 'Producto actualizado' : 'Producto agregado');
          },
        },
      ].filter(Boolean),
    });
    setTimeout(() => name.focus(), 60);
  }

  function render() {
    if (!shop.ready) return clear(list, h('div', { class: 'spinner' }), h('p', { class: 'muted small center' }, 'Cargando… Si no carga, falta publicar las reglas nuevas de Firebase (archivo firestore.rules).'));
    const stocks = stockMap(shop.moves);
    const today = byProduct(daySales(shop.moves, dayString()).sales);
    const soldToday = Object.fromEntries(today.map((p) => [p.productId, p.qty]));
    const everything = shop.productList();
    clear(chips, [['', 'Todos'], ...CAJAS.map((c) => [c, `Caja ${c}`])].map(([v, label]) => h('button', { class: `chip${v === view ? ' on' : ''}`, type: 'button', onclick: () => ((view = v), render()) }, label)));
    const all = view ? everything.filter((p) => productInCaja(p, view)) : everything;
    const items = filter.trim() ? all.filter((p) => normalize(p.name).includes(normalize(filter))) : all;
    if (items.length === 0) {
      return clear(list, emptyState(all.length ? 'No se encontró ese producto' : 'Todavía no hay productos', isAdmin && !all.length ? 'Agrega el primero con el botón de abajo.' : null));
    }
    const worth = all.reduce((s, p) => s + Math.max(0, stocks[p.id] ?? 0) * p.price, 0);
    clear(
      list,
      isAdmin ? h('p', { class: 'muted small center' }, `${all.length} productos · valor en existencia ${money(worth)}`) : null,
      h(
        'div',
        { class: 'card' },
        items.map((p) => {
          const n = stocks[p.id] ?? 0;
          const cls = n <= 0 ? 'out' : n <= 3 ? 'low' : 'ok';
          return h(
            isAdmin ? 'button' : 'div',
            { class: 'list-item', type: isAdmin ? 'button' : undefined, onclick: isAdmin ? () => productDialog(p) : undefined },
            h('div', { class: 'grow' }, h('div', { class: 'li-title' }, p.name), h('div', { class: 'li-sub' }, `${money(p.price)} · ${cajasLabel(p.cajas)}${soldToday[p.id] ? ` · hoy se vendieron ${soldToday[p.id]}` : ''}`)),
            h('span', { class: `stock ${cls}` }, n <= 0 ? 'Agotado' : `${n} en existencia`),
            isAdmin ? icon('chevron') : null,
          );
        }),
      ),
    );
  }

  render();
  return {
    el: h(
      'div',
      { class: 'screen' },
      appBar({ title: 'Inventario', subtitle: 'Lo que hay en existencia', onBack: () => app.router.back('/') }),
      h('main', { class: `content${isAdmin ? ' with-fab' : ''}` }, input, chips, list),
      isAdmin ? h('button', { class: 'btn fab', type: 'button', onclick: () => productDialog(null) }, icon('add', 22), 'Agregar producto') : null,
    ),
    update: render,
  };
}
