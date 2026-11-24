// Historial de cuentas: las ventas de cualquier día (hoy, ayer…), con las dos cajas, su total y su fondo.
// Todos pueden ver; solo el administrador puede borrar una venta o reabrir una cuenta guardada.
import { h, clear, icon, appBar, bigButton, emptyState, toast, confirmDialog } from './dom.js';
import { money, dayString, daySales, byProduct, dayOverview, profitOf, CAJAS, CAJA_NAMES } from '../core/shop.js';

const fmtDay = (day) => new Date(day + 'T12:00:00').toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const fmtTime = (at) => new Date(at).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' });
const shiftDay = (day, n) => {
  const d = new Date(day + 'T12:00:00');
  d.setDate(d.getDate() + n);
  return dayString(d);
};
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

export function HistoryScreen(app, query = {}) {
  const shop = app.shop;
  const isAdmin = app.auth.role === 'ADMIN';
  const today = () => dayString();
  let day = /^\d{4}-\d{2}-\d{2}$/.test(query.day ?? '') ? query.day : today();
  const host = h('div', { class: 'stack' });
  const dateInput = h('input', { class: 'input', type: 'date', value: day, max: today(), 'aria-label': 'Día', onchange: (e) => e.target.value && go(e.target.value) });
  const title = h('div', { class: 'section-title big' });

  function go(d) {
    day = d > today() ? today() : d;
    dateInput.value = day;
    render();
  }

  async function removeSale(s) {
    if (await confirmDialog({ title: 'Borrar esta venta', text: `${s.qty} × ${s.productName} (${money(s.qty * s.price)}). Se devolverá al inventario.`, confirmText: 'Borrar' })) {
      shop.deleteMove(s.id).catch(() => {});
      toast('Venta borrada');
    }
  }

  async function reopen(caja) {
    if (await confirmDialog({ title: 'Reabrir la cuenta', text: `La Caja ${caja} de ese día quedará libre otra vez: se podrá anotar y se quitará el fondo guardado.`, confirmText: 'Reabrir' })) {
      shop.reopenDay(day, caja).catch(() => {});
      toast('Cuenta reabierta');
    }
  }

  function render() {
    clear(title, day === today() ? 'Hoy' : day === shiftDay(today(), -1) ? 'Ayer' : fmtDay(day));
    if (!shop.ready) return clear(host, h('div', { class: 'spinner' }));
    const ov = dayOverview(shop.moves, shop.closings, day);
    const all = daySales(shop.moves, day).sales;
    const profit = isAdmin ? profitOf(all, (id) => shop.costOf(id)) : null;
    clear(
      host,
      !all.length && !ov.cajas.some((c) => c.closed)
        ? emptyState('No hay ventas ese día', 'Cambia el día con las flechas o el calendario.')
        : [
            h(
              'div',
              { class: 'card step' },
              h('div', { class: 'ov-grid' }, ov.cajas.map((c) => h('div', { class: `ov-box${c.closed ? ' closed' : ''}` }, h('div', { class: 'ov-t' }, `Caja ${c.caja}`), h('div', { class: 'ov-n' }, money(c.total)), h('div', { class: 'ov-s' }, c.closed ? `Fondo ${money(c.fondo)} · guardada ✓` : 'sin guardar')))),
              h('div', { class: 'ov-total' }, h('span', null, 'Total vendido'), h('b', null, money(ov.total))),
              ov.cajas.some((c) => c.closed) ? h('div', { class: 'ov-total' }, h('span', null, 'Fondo dejado'), h('b', null, money(ov.fondo))) : null,
              profit !== null ? h('div', { class: 'ov-total' }, h('span', null, 'Ganancia aproximada'), h('b', null, money(profit))) : null,
            ),
            ov.cajas.map((c) => {
              const { sales } = daySales(shop.moves, day, c.caja);
              return h(
                'div',
                { class: 'card' },
                h('div', { class: 'both-head' }, h('div', null, h('b', null, `Caja ${c.caja}`), h('span', { class: 'muted small' }, ` · ${CAJA_NAMES[c.caja]}`)), h('div', { class: 'both-total' }, money(c.total))),
                h('div', { class: 'small muted both-sub' }, c.closed ? `Cuenta guardada ✓ · fondo ${money(c.fondo)} · ${fmtTime(c.closing.at)}` : 'Sin guardar'),
                sales.length
                  ? sales.map((s) =>
                      h(
                        'div',
                        { class: 'list-item compact' },
                        h('div', { class: 'grow' }, `${s.qty} × ${s.productName}`, h('span', { class: 'muted small' }, `  ${money(s.price)} c/u · ${fmtTime(s.at)}`)),
                        h('b', null, money(s.qty * s.price)),
                        isAdmin ? h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Borrar venta', style: { color: 'var(--error)' }, onclick: () => removeSale(s) }, icon('delete')) : null,
                      ),
                    )
                  : h('div', { class: 'list-item compact muted' }, 'Sin ventas'),
                isAdmin && c.closed ? h('div', { style: { padding: '8px 12px 12px' } }, bigButton('Reabrir esta cuenta (quedar libre otra vez)', () => reopen(c.caja), { outline: true, small: true })) : null,
              );
            }),
            all.length
              ? [
                  h('div', { class: 'section-title' }, `Lo que se vendió (${plural(all.reduce((s, x) => s + x.qty, 0), 'artículo', 'artículos')})`),
                  h('div', { class: 'card' }, byProduct(all).map((p) => h('div', { class: 'list-item compact' }, h('div', { class: 'grow' }, p.name), h('span', { class: 'muted' }, `× ${p.qty}`), h('b', null, money(p.total))))),
                ]
              : null,
          ],
    );
  }

  render();
  return {
    el: h(
      'div',
      { class: 'screen' },
      appBar({ title: 'Historial de cuentas', subtitle: 'Lo que se vendió cada día', onBack: () => app.router.back('/') }),
      h(
        'main',
        { class: 'content' },
        h('div', { class: 'row' }, bigButton('‹ Día anterior', () => go(shiftDay(day, -1)), { outline: true, small: true }), bigButton('Día siguiente ›', () => go(shiftDay(day, 1)), { outline: true, small: true, disabled: false })),
        h('div', { class: 'row' }, bigButton('Hoy', () => go(today()), { outline: true, small: true }), bigButton('Ayer', () => go(shiftDay(today(), -1)), { outline: true, small: true })),
        dateInput,
        title,
        host,
      ),
    ),
    update: render,
  };
}
