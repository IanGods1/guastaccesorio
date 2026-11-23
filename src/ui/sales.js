// Ventas del día: cada trabajador anota lo que vende en su caja (1 o 2) y al final cierra el día
// con el fondo que deja. Lo anotado no se puede editar ni borrar; solo el administrador corrige.
import { h, clear, icon, appBar, bigButton, choiceRow, emptyState, openDialog, toast } from './dom.js';
import { money, parseMoney, parseQty, dayString, stockMap, daySales, byProduct, dayOverview, productInCaja, CAJAS } from '../core/shop.js';

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const fmtDay = (day) => new Date(day + 'T12:00:00').toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long' });
const fmtTime = (at) => new Date(at).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' });

/** Diálogo de confirmación con botón principal normal (no rojo). */
function ask({ title, body, confirmText }) {
  return new Promise((resolve) => {
    openDialog({
      title,
      body,
      onClose: () => resolve(false),
      actions: [{ label: 'Cancelar' }, { label: confirmText, onClick: (close) => (resolve(true), close()) }],
    });
  });
}

export function SalesScreen(app) {
  const shop = app.shop;
  const isAdmin = app.auth.role === 'ADMIN';
  const by = isAdmin ? 'admin' : 'worker';
  const state = { caja: CAJAS.includes(app.storage.getItem('gc_caja')) ? app.storage.getItem('gc_caja') : '1', dayOverride: null };
  const day = () => state.dayOverride ?? dayString();
  const isToday = () => day() === dayString();

  // Campos fijos (así no pierden el foco cuando llegan datos nuevos)
  const select = h('select', { class: 'input', 'aria-label': 'Producto', onchange: () => onProduct() });
  const qty = h('input', { class: 'input qty', type: 'text', inputmode: 'numeric', value: '1', 'aria-label': 'Cantidad' });
  const price = h('input', { class: 'input', type: 'text', inputmode: 'decimal', placeholder: '0.00', 'aria-label': 'Precio de cada uno' });
  const dateInput = h('input', { class: 'input', type: 'date', value: dayString(), max: dayString(), onchange: (e) => ((state.dayOverride = e.target.value && e.target.value !== dayString() ? e.target.value : null), render()) });

  const cajaRow = choiceRow({
    options: CAJAS.map((c) => ({ value: c, label: `Caja ${c}` })),
    get: () => state.caja,
    onSelect: (v) => ((state.caja = v), app.storage.setItem('gc_caja', v), render()),
    sublabel: (c) => {
      const o = dayOverview(shop.moves, shop.closings, day()).cajas.find((x) => x.caja === c);
      return o.closed ? 'Cerrada ✓' : money(o.total);
    },
  });

  const overviewHost = h('div');
  const formHost = h('div');
  const statusHost = h('div');
  const listHost = h('div', { class: 'stack' });
  const summaryHost = h('div', { class: 'stack' });

  const stockOfProduct = (id) => stockMap(shop.moves)[id] ?? 0;

  function fillProducts() {
    const keep = select.value;
    const stocks = stockMap(shop.moves);
    const mine = shop.productList().filter((p) => productInCaja(p, state.caja));
    clear(
      select,
      h('option', { value: '' }, mine.length ? 'Elige el producto…' : `No hay productos para la Caja ${state.caja}`),
      mine.map((p) => h('option', { value: p.id }, `${p.name} · ${money(p.price)} (quedan ${stocks[p.id] ?? 0})`)),
    );
    if (keep && shop.products[keep]) select.value = keep;
  }

  function onProduct() {
    const p = shop.products[select.value];
    price.value = p ? String(p.price) : '';
  }

  async function sell() {
    const product = shop.products[select.value];
    const q = parseQty(qty.value);
    const pr = parseMoney(price.value);
    if (!product) return toast('Elige el producto');
    if (q === null) return toast('Escribe la cantidad (1 o más)');
    if (pr === null) return toast('Escribe el precio, por ejemplo 50 o 49.50');
    const left = stockOfProduct(product.id);
    const ok = await ask({
      title: '¿Anotar esta venta?',
      body: [
        h('p', { class: 'bold' }, `${q} × ${product.name} a ${money(pr)} = ${money(q * pr)}`),
        h('p', null, `Caja ${state.caja}. Después de anotarla no se puede cambiar ni borrar.`),
        q > left ? h('p', { class: 'warn' }, `Ojo: en el inventario ${left <= 0 ? 'no hay' : `solo hay ${left}`}. Revisa la cantidad.`) : null,
      ],
      confirmText: 'Sí, anotar',
    });
    if (!ok) return;
    shop.recordSale({ product, qty: q, price: pr, caja: state.caja, day: day(), by }).catch(() => {});
    qty.value = '1';
    toast(`Anotado: ${q} × ${product.name}`);
  }

  async function closeDay() {
    const { total, count } = daySales(shop.moves, day(), state.caja);
    const fondo = h('input', { class: 'input', type: 'text', inputmode: 'decimal', placeholder: '0.00', 'aria-label': 'Fondo que dejas en la caja' });
    const error = h('p', { class: 'error-text' });
    openDialog({
      title: `Cerrar el día · Caja ${state.caja}`,
      body: [
        h('p', null, `Vendido hoy: `, h('b', null, money(total)), ` (${plural(count, 'artículo', 'artículos')})`),
        h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Fondo que dejas en la caja (Q)'), fondo),
        h('p', { class: 'warn' }, 'Cuando cierres el día, ya no se podrá anotar ni modificar nada de esta caja. Revisa bien.'),
        error,
      ],
      actions: [
        { label: 'Cancelar' },
        {
          label: 'Cerrar el día',
          onClick: (close) => {
            const f = parseMoney(fondo.value);
            if (f === null) {
              error.textContent = 'Escribe el fondo, por ejemplo 300 o 250.50 (puede ser 0).';
              return;
            }
            close();
            shop.closeDay({ day: day(), caja: state.caja, fondo: f, sold: total, count, by }).catch(() => {});
            toast('Día cerrado ✓');
          },
        },
      ],
    });
    setTimeout(() => fondo.focus(), 60);
  }

  async function removeSale(s) {
    const ok = await ask({ title: 'Borrar esta venta', body: h('p', null, `${s.qty} × ${s.productName} (${money(s.qty * s.price)}). Se devolverá al inventario.`), confirmText: 'Borrar' });
    if (ok) shop.deleteMove(s.id).catch(() => {});
  }

  async function reopen() {
    const ok = await ask({ title: 'Reabrir el día', body: h('p', null, `Caja ${state.caja} volverá a aceptar ventas y se quitará el fondo anotado.`), confirmText: 'Reabrir' });
    if (ok) shop.reopenDay(day(), state.caja).catch(() => {});
  }

  function render() {
    const d = day();
    const ov = dayOverview(shop.moves, shop.closings, d);
    const mine = ov.cajas.find((c) => c.caja === state.caja);
    const { sales } = daySales(shop.moves, d, state.caja);
    cajaRow.refresh();

    clear(
      overviewHost,
      h(
        'div',
        { class: 'card step' },
        h('div', { class: 'step-title' }, isToday() ? 'Hoy, las dos cajas' : fmtDay(d)),
        h(
          'div',
          { class: 'ov-grid' },
          ov.cajas.map((c) =>
            h('div', { class: `ov-box${c.closed ? ' closed' : ''}` }, h('div', { class: 'ov-t' }, `Caja ${c.caja}`), h('div', { class: 'ov-n' }, money(c.total)), h('div', { class: 'ov-s' }, c.closed ? `Fondo ${money(c.fondo)} · cerrada ✓` : 'abierta')),
          ),
        ),
        h('div', { class: 'ov-total' }, h('span', null, 'Total vendido'), h('b', null, money(ov.total))),
        ov.cajas.some((c) => c.closed) ? h('div', { class: 'ov-total' }, h('span', null, 'Fondo dejado'), h('b', null, money(ov.fondo))) : null,
      ),
    );

    fillProducts();
    clear(
      formHost,
      mine.closed
        ? null
        : h(
            'div',
            { class: 'card step' },
            h('div', { class: 'step-title' }, `Anotar una venta · Caja ${state.caja}`),
            h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Producto'), select),
            h('div', { class: 'row' }, h('label', { class: 'field grow' }, h('span', { class: 'field-label' }, 'Cantidad'), qty), h('label', { class: 'field grow' }, h('span', { class: 'field-label' }, 'Precio de cada uno (Q)'), price)),
            bigButton('Anotar venta', sell, { icon: 'add' }),
          ),
    );

    clear(
      statusHost,
      mine.closed
        ? h(
            'div',
            { class: 'card result-card' },
            h('div', { class: 'result-ok' }, icon('lock', 36)),
            h('div', { class: 'section-title big center' }, `Caja ${state.caja} cerrada ✓`),
            h('p', { class: 'center' }, `Vendido ${money(mine.total)} · Fondo ${money(mine.fondo)}`),
            h('p', { class: 'muted small center' }, 'Ya no se puede anotar ni modificar nada de este día.'),
            isAdmin ? bigButton('Reabrir este día (administrador)', reopen, { outline: true, small: true }) : null,
          )
        : sales.length
          ? bigButton(`Cerrar el día de la Caja ${state.caja}`, closeDay, { icon: 'lock', outline: true })
          : null,
    );

    clear(
      listHost,
      sales.length
        ? [
            h('div', { class: 'section-title' }, `Lo anotado en la Caja ${state.caja}`),
            h(
              'div',
              { class: 'card' },
              sales.map((s) =>
                h(
                  'div',
                  { class: 'list-item' },
                  h('div', { class: 'grow' }, h('div', { class: 'li-title' }, `${s.qty} × ${s.productName}`), h('div', { class: 'li-sub' }, `${money(s.price)} c/u · ${fmtTime(s.at)}`)),
                  h('b', null, money(s.qty * s.price)),
                  isAdmin ? h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Borrar venta', style: { color: 'var(--error)' }, onclick: () => removeSale(s) }, icon('delete')) : null,
                ),
              ),
            ),
          ]
        : mine.closed
          ? null
          : emptyState('Todavía no hay ventas', 'Anota la primera con el formulario de arriba.'),
    );

    const all = daySales(shop.moves, d).sales;
    clear(
      summaryHost,
      isAdmin && all.length
        ? [
            h('div', { class: 'section-title' }, 'Lo que se vendió (las dos cajas)'),
            h('div', { class: 'card' }, byProduct(all).map((p) => h('div', { class: 'list-item' }, h('div', { class: 'grow li-title' }, p.name), h('span', { class: 'muted' }, `× ${p.qty}`), h('b', null, money(p.total))))),
          ]
        : null,
    );
  }

  render();
  return {
    el: h(
      'div',
      { class: 'screen' },
      appBar({ title: 'Ventas del día', subtitle: fmtDay(dayString()), onBack: () => app.router.back('/') }),
      h(
        'main',
        { class: 'content' },
        isAdmin ? h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Día'), dateInput) : null,
        overviewHost,
        cajaRow.el,
        statusHost,
        formHost,
        listHost,
        summaryHost,
        isAdmin ? bigButton('Ver el inventario', () => app.router.go('/inventory'), { outline: true, icon: 'list' }) : null,
      ),
    ),
    update: render,
  };
}
