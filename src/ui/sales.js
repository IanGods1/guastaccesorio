// Ventas del día: cada trabajador anota lo que vende en su caja (1 o 2) y al final cierra el día
// con el fondo que deja. Lo anotado no se puede editar ni borrar; solo el administrador corrige.
import { h, clear, icon, appBar, bigButton, choiceRow, emptyState, openDialog, toast } from './dom.js';
import { normalizeCode } from '../core/barcode.js';
import { openScanner, scanButton } from './scanner.js';
import { profitOf, money, parseMoney, parseQty, dayString, stockMap, daySales, byProduct, dayOverview, searchProducts, CAJAS, CAJA_NAMES, NO_CATEGORY } from '../core/shop.js';

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
  // Cada trabajador usa UNA sola caja: la que elige la primera vez queda fija en este teléfono
  // (solo el administrador puede cambiarla). El administrador puede ver y usar las dos.
  let fixed = !isAdmin && CAJAS.includes(app.storage.getItem('gc_caja_fixed')) ? app.storage.getItem('gc_caja_fixed') : null;
  const state = { productId: '', caja: fixed ?? (CAJAS.includes(app.storage.getItem('gc_caja')) ? app.storage.getItem('gc_caja') : '1'), dayOverride: null };
  const day = () => state.dayOverride ?? dayString();
  const isToday = () => day() === dayString();

  // Campos fijos (así no pierden el foco cuando llegan datos nuevos)
  // Buscador de productos: por nombre, precio, categoría o código. Un lector de códigos (USB o Bluetooth)
  // escribe el código y manda Enter, y eso elige el producto.
  const search = h('input', {
    class: 'input', type: 'search', placeholder: 'Nombre, precio o código', autocomplete: 'off', 'aria-label': 'Buscar producto',
    oninput: () => renderPicker(),
    onkeydown: (e) => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      onEnter(search.value.trim());
    },
  });
  const qty = h('input', { class: 'input qty', type: 'text', inputmode: 'numeric', value: '1', 'aria-label': 'Cantidad' });
  const price = h('input', { class: 'input', type: 'text', inputmode: 'decimal', placeholder: '0.00', 'aria-label': 'Precio de cada uno' });
  const dateInput = h('input', { class: 'input', type: 'date', value: dayString(), max: dayString(), onchange: (e) => ((state.dayOverride = e.target.value && e.target.value !== dayString() ? e.target.value : null), render()) });

  const cajaRow = choiceRow({
    options: CAJAS.map((c) => ({ value: c, label: `Caja ${c}` })),
    get: () => state.caja,
    onSelect: (v) => ((state.caja = v), app.storage.setItem('gc_caja', v), render()),
    sublabel: (c) => {
      const o = dayOverview(shop.moves, shop.closings, day()).cajas.find((x) => x.caja === c);
      return o.closed ? `${CAJA_NAMES[c]} · guardada ✓` : CAJA_NAMES[c];
    },
  });

  const chooserHost = h('div', { class: 'stack' });
  const bannerHost = h('div');
  const bothHost = h('div', { class: 'stack' });
  const overviewHost = h('div');
  const formHost = h('div');
  const statusHost = h('div');
  const listHost = h('div', { class: 'stack' });
  const summaryHost = h('div', { class: 'stack' });

  const stockOfProduct = (id) => stockMap(shop.moves)[id] ?? 0;

  const pickerHost = h('div', { class: 'stack' });

  function choose(p) {
    state.productId = p.id;
    price.value = String(p.price);
    qty.value = '1';
    search.value = '';
    renderPicker();
  }

  /** Enter en el buscador: un código de barras exacto, o el único resultado. */
  function onEnter(raw) {
    if (!raw) return;
    const byCode = shop.byBarcode(normalizeCode(raw) ?? raw);
    if (byCode) return choose(byCode), toast(`${byCode.name} · ${money(byCode.price)}`);
    const found = searchProducts(shop.productList(), raw);
    if (found.length === 1) return choose(found[0]);
    toast(found.length ? 'Toca el producto de la lista' : `No hay productos con "${raw}"`);
  }

  function renderPicker() {
    const stocks = stockMap(shop.moves);
    const chosen = shop.products[state.productId];
    if (state.productId && !chosen) state.productId = '';
    const q = search.value.trim();
    const found = searchProducts(shop.productList(), q).slice(0, 12);
    clear(
      pickerHost,
      chosen
        ? h(
            'div',
            { class: 'picked' },
            h('div', { class: 'grow' }, h('div', { class: 'li-title' }, chosen.name), h('div', { class: 'li-sub' }, `${chosen.category || NO_CATEGORY} · ${money(chosen.price)}${chosen.give ? ` · para dar ${money(chosen.give)}` : ''} · quedan ${stocks[chosen.id] ?? 0}`)),
            h('button', { class: 'link-btn', type: 'button', onclick: () => ((state.productId = ''), (price.value = ''), renderPicker(), search.focus()) }, 'Cambiar'),
          )
        : null,
      !chosen || q
        ? found.length
          ? h(
              'div',
              { class: 'card results' },
              found.map((p) =>
                h(
                  'button',
                  { class: 'list-item', type: 'button', onclick: () => choose(p) },
                  h('div', { class: 'grow' }, h('div', { class: 'li-title' }, p.name), h('div', { class: 'li-sub' }, `${p.category || NO_CATEGORY} · quedan ${stocks[p.id] ?? 0}`)),
                  h('div', { class: 'price-col' }, h('b', null, money(p.price)), p.give ? h('div', { class: 'li-sub' }, `dar ${money(p.give)}`) : null),
                ),
              ),
            )
          : h('p', { class: 'muted small center' }, shop.productList().length ? `No hay productos con "${q}"` : 'Todavía no hay productos. El administrador los agrega en Inventario.')
        : null,
    );
  }

  async function sell() {
    const product = shop.products[state.productId];
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
        product.give && pr < product.give ? h('p', { class: 'warn' }, `Ojo: el precio está por debajo de lo más bajo que se puede dar (${money(product.give)}).`) : null,
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
      title: `Guardar la cuenta · Caja ${state.caja}`,
      body: [
        h('p', null, `Vendido hoy: `, h('b', null, money(total)), ` (${plural(count, 'artículo', 'artículos')})`),
        h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Fondo que dejas en la caja (Q)'), fondo),
        h('p', { class: 'warn' }, 'Al guardar la cuenta, esta caja queda limpia y ya no se podrá anotar ni modificar nada de hoy. La cuenta se verá en el Historial; solo el administrador puede borrarla o reabrirla. Revisa bien.'),
        error,
      ],
      actions: [
        { label: 'Cancelar' },
        {
          label: 'Guardar cuenta',
          onClick: (close) => {
            const f = parseMoney(fondo.value);
            if (f === null) {
              error.textContent = 'Escribe el fondo, por ejemplo 300 o 250.50 (puede ser 0).';
              return;
            }
            close();
            shop.closeDay({ day: day(), caja: state.caja, fondo: f, sold: total, count, by }).catch(() => {});
            toast('Cuenta guardada ✓');
          },
        },
      ],
    });
    setTimeout(() => fondo.focus(), 60);
  }

  /** Abajo: las ventas del día de las DOS cajas, cada una con su total y su fondo. */
  function renderBoth(d) {
    const ov = dayOverview(shop.moves, shop.closings, d);
    clear(
      bothHost,
      h('div', { class: 'section-title' }, 'Ventas del día de las dos cajas'),
      ov.cajas.map((c) => {
        const { sales } = daySales(shop.moves, d, c.caja);
        return h(
          'div',
          { class: 'card' },
          h('div', { class: 'both-head' }, h('div', null, h('b', null, `Caja ${c.caja}`), h('span', { class: 'muted small' }, ` · ${CAJA_NAMES[c.caja]}`)), h('div', { class: 'both-total' }, money(c.total))),
          h('div', { class: 'small muted both-sub' }, c.closed ? `Cuenta guardada ✓ · fondo ${money(c.fondo)} · ya está en el Historial` : 'Abierta'),
          c.closed
            ? null
            : sales.length
            ? sales.map((s) => h('div', { class: 'list-item compact' }, h('div', { class: 'grow' }, `${s.qty} × ${s.productName}`, h('span', { class: 'muted small' }, `  ${fmtTime(s.at)}`)), h('b', null, money(s.qty * s.price))))
            : h('div', { class: 'list-item compact muted' }, 'Sin ventas todavía'),
        );
      }),
    );
  }

  /** Primera vez en un teléfono de trabajador: elegir la caja (queda fija). */
  function renderChooser() {
    clear(
      chooserHost,
      h(
        'div',
        { class: 'card step' },
        h('div', { class: 'step-title' }, '¿En qué caja trabajas con este teléfono?'),
        h('p', { class: 'small muted' }, 'Cada teléfono usa una sola caja y lleva sus propias ventas. Quedará fija: solo el administrador puede cambiarla.'),
        CAJAS.map((c) =>
          bigButton(`Caja ${c} · ${CAJA_NAMES[c]}`, async () => {
            const ok = await ask({ title: `¿Caja ${c}?`, body: h('p', null, `Este teléfono quedará fijo en la Caja ${c} (${CAJA_NAMES[c]}). No podrás cambiarla sin el administrador.`), confirmText: `Sí, Caja ${c}` });
            if (!ok) return;
            app.storage.setItem('gc_caja_fixed', c);
            fixed = c;
            state.caja = c;
            render();
          }, { outline: c !== '1' }),
        ),
      ),
    );
  }

  /** El administrador cambia la caja fija de este teléfono (se pide su contraseña). */
  function changeFixed() {
    const pw = h('input', { class: 'input', type: 'password', placeholder: 'Contraseña de administrador', autocomplete: 'off', 'aria-label': 'Contraseña de administrador' });
    const error = h('p', { class: 'error-text' });
    openDialog({
      title: 'Cambiar la caja de este teléfono',
      body: [h('p', null, 'Escribe la contraseña de administrador para elegir otra caja.'), pw, error],
      actions: [
        { label: 'Cancelar' },
        {
          label: 'Continuar',
          onClick: async (close) => {
            const ok = await app.backend.verifyAdminPassword(pw.value);
            if (ok === null) return void (error.textContent = 'No se pudo comprobar. Revisa tu conexión.');
            if (!ok) return void (error.textContent = 'Contraseña incorrecta.');
            app.storage.removeItem('gc_caja_fixed');
            fixed = null;
            state.productId = '';
            close();
            render();
          },
        },
      ],
    });
    setTimeout(() => pw.focus(), 60);
  }

  async function removeSale(s) {
    const ok = await ask({ title: 'Borrar esta venta', body: h('p', null, `${s.qty} × ${s.productName} (${money(s.qty * s.price)}). Se devolverá al inventario.`), confirmText: 'Borrar' });
    if (ok) shop.deleteMove(s.id).catch(() => {});
  }

  async function reopen() {
    const ok = await ask({ title: 'Reabrir el día', body: h('p', null, `Caja ${state.caja} volverá a aceptar ventas y se quitará el fondo anotado.`), confirmText: 'Reabrir' });
    if (ok) shop.reopenDay(day(), state.caja).catch(() => {});
  }

  /** Ganancia del día (venta − costo actual de cada producto). null si no hay costos anotados. */
  function profit(d) {
    const sales = daySales(shop.moves, d).sales;
    if (!sales.length) return null;
    return profitOf(sales, (id) => shop.costOf(id));
  }

  function render() {
    if (!isAdmin && !fixed) {
      for (const el of [overviewHost, bannerHost, statusHost, formHost, listHost, summaryHost, bothHost]) clear(el);
      return renderChooser();
    }
    clear(chooserHost);
    clear(bannerHost, isAdmin ? null : h('div', { class: 'picked' }, h('div', { class: 'grow' }, h('div', { class: 'li-title' }, `Este teléfono vende en la Caja ${state.caja}`), h('div', { class: 'li-sub' }, CAJA_NAMES[state.caja])), h('button', { class: 'link-btn', type: 'button', onclick: changeFixed }, 'Cambiar caja')));
    const d = day();
    const ov = dayOverview(shop.moves, shop.closings, d);
    const mine = ov.cajas.find((c) => c.caja === state.caja);
    const { sales } = daySales(shop.moves, d, state.caja);
    cajaRow.refresh();
    renderBoth(d);

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
            h('div', { class: `ov-box${c.closed ? ' closed' : ''}` }, h('div', { class: 'ov-t' }, `Caja ${c.caja}`), h('div', { class: 'ov-n' }, money(c.total)), h('div', { class: 'ov-s' }, c.closed ? `Fondo ${money(c.fondo)} · guardada ✓` : 'abierta')),
          ),
        ),
        h('div', { class: 'ov-total' }, h('span', null, 'Total vendido'), h('b', null, money(ov.total))),
        isAdmin && profit(d) !== null ? h('div', { class: 'ov-total' }, h('span', null, 'Ganancia aproximada'), h('b', null, money(profit(d)))) : null,
        ov.cajas.some((c) => c.closed) ? h('div', { class: 'ov-total' }, h('span', null, 'Fondo dejado'), h('b', null, money(ov.fondo))) : null,
      ),
    );

    renderPicker();
    clear(
      formHost,
      mine.closed
        ? null
        : h(
            'div',
            { class: 'card step' },
            h('div', { class: 'step-title' }, `Anotar una venta · Caja ${state.caja}`),
            h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'Producto'), h('div', { class: 'search-row' }, search, scanButton(() => openScanner({ onCode: (c) => onEnter(c) })))),
            pickerHost,
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
            h('div', { class: 'section-title big center' }, `Cuenta de la Caja ${state.caja} guardada ✓`),
            h('p', { class: 'center' }, `Vendido ${money(mine.total)} · Fondo ${money(mine.fondo)}`),
            h('p', { class: 'muted small center' }, 'Ya está en el Historial. La caja queda limpia y ya no se puede anotar ni modificar nada de este día.'),
            bigButton('Ver en el historial', () => app.router.go(`/history?day=${d}`), { outline: true, small: true, icon: 'list' }),
            isAdmin ? bigButton('Reabrir esta cuenta (quedar libre otra vez)', reopen, { outline: true, small: true }) : null,
          )
        : sales.length
          ? bigButton(`Guardar la cuenta de la Caja ${state.caja}`, closeDay, { icon: 'lock', outline: true })
          : null,
    );

    clear(
      listHost,
      mine.closed
        ? null
        : sales.length
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
        chooserHost,
        overviewHost,
        isAdmin ? cajaRow.el : bannerHost,
        statusHost,
        formHost,
        listHost,
        summaryHost,
        bothHost,
        bigButton('Ver el historial de cuentas', () => app.router.go('/history'), { outline: true, icon: 'list' }),
        isAdmin ? bigButton('Ver el inventario', () => app.router.go('/inventory'), { outline: true, icon: 'list' }) : null,
      ),
    ),
    update: render,
  };
}
