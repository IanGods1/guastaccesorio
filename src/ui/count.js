// Hacer inventario: buscar o escanear cada producto, escribir cuántos hay (se suma solo), y al terminar
// ver el resultado y mandarlo por WhatsApp. El conteo se guarda en este teléfono mientras no se termine.
import { h, clear, icon, appBar, bigButton, emptyState, openDialog, toast, confirmDialog } from './dom.js';
import { money, stockMap, searchProducts, NO_CATEGORY } from '../core/shop.js';
import { normalizeCode } from '../core/barcode.js';
import { emptyCount, addToCount, setCount, countRows, countTotals, uncountedProducts, whatsappText, whatsappUrl, normalizePhone } from '../core/count.js';
import { openScanner, scanButton } from './scanner.js';

const KEY = 'gc_count_v1';
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

export function CountScreen(app) {
  const shop = app.shop;
  const isAdmin = app.auth.role === 'ADMIN';
  const load = () => {
    try {
      const c = JSON.parse(app.storage.getItem(KEY) ?? 'null');
      return c && typeof c.items === 'object' && Array.isArray(c.order) ? c : emptyCount();
    } catch {
      return emptyCount();
    }
  };
  let count = load();
  const save = () => app.storage.setItem(KEY, JSON.stringify(count));
  const state = { productId: '', phase: 'count' };

  const search = h('input', {
    class: 'input', type: 'search', placeholder: 'Nombre, precio, código', autocomplete: 'off', 'aria-label': 'Buscar producto',
    oninput: () => renderPicker(),
    onkeydown: (e) => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      onEnter(search.value.trim());
    },
  });
  const qty = h('input', { class: 'input qty', type: 'text', inputmode: 'numeric', value: '1', 'aria-label': 'Cantidad contada', onkeydown: (e) => e.key === 'Enter' && (e.preventDefault(), addCounted()) });
  const waNumber = h('input', { class: 'input', type: 'tel', inputmode: 'tel', placeholder: 'Número de WhatsApp (opcional)', value: app.storage.getItem('gc_wa_number') ?? '', autocomplete: 'off', 'aria-label': 'Número de WhatsApp' });
  const pickerHost = h('div', { class: 'stack' });
  const listHost = h('div', { class: 'stack' });
  const main = h('main', { class: 'content' });

  const stocks = () => stockMap(shop.moves);

  function choose(p) {
    state.productId = p.id;
    search.value = '';
    qty.value = '1';
    renderPicker();
    qty.focus();
    qty.select();
  }

  function onEnter(raw) {
    if (!raw) return;
    const byCode = shop.byBarcode(normalizeCode(raw) ?? raw);
    if (byCode) return choose(byCode);
    const found = searchProducts(shop.productList(), raw);
    if (found.length === 1) return choose(found[0]);
    toast(found.length ? 'Toca el producto de la lista' : `No hay productos con "${raw}"`);
  }

  function addCounted() {
    const p = shop.products[state.productId];
    const n = /^\d{1,5}$/.test(qty.value.trim()) ? Number(qty.value.trim()) : 0;
    if (!p) return toast('Elige el producto');
    if (n < 1) return toast('Escribe cuántos hay (1 o más)');
    count = addToCount(count, p.id, n);
    save();
    toast(`${p.name}: ${count.items[p.id]} contados`);
    state.productId = '';
    qty.value = '1';
    renderPicker();
    renderList();
    search.focus();
  }

  /** Cámara: cada lectura suma 1 al producto (se puede seguir escaneando). */
  function camera() {
    openScanner({
      title: 'Escanear para contar',
      continuous: true,
      hint: 'Cada lectura suma 1. Para contar varios, escribe la cantidad en la lista.',
      onCode: (raw) => {
        const p = shop.byBarcode(normalizeCode(raw) ?? raw);
        if (!p) return `No existe el código ${raw}`;
        count = addToCount(count, p.id, 1);
        save();
        renderList();
        return `${p.name} · ${count.items[p.id]}`;
      },
    });
  }

  function editRow(r) {
    const input = h('input', { class: 'input qty', type: 'text', inputmode: 'numeric', value: String(r.counted), 'aria-label': 'Cantidad exacta' });
    const error = h('p', { class: 'error-text' });
    openDialog({
      title: r.name,
      body: [h('p', { class: 'small muted' }, `En el sistema hay ${r.system}. Escribe la cantidad exacta contada (0 para quitarlo de la lista).`), input, error],
      actions: [
        { label: 'Cancelar' },
        {
          label: 'Guardar',
          onClick: (close) => {
            if (!/^\d{1,5}$/.test(input.value.trim())) return void (error.textContent = 'Escribe un número entero.');
            count = setCount(count, r.id, Number(input.value.trim()));
            save();
            close();
            renderList();
          },
        },
      ],
    });
    setTimeout(() => (input.focus(), input.select()), 60);
  }

  function renderPicker() {
    const st = stocks();
    const chosen = shop.products[state.productId];
    if (state.productId && !chosen) state.productId = '';
    const q = search.value.trim();
    const found = searchProducts(shop.productList(), q).slice(0, 12);
    clear(
      pickerHost,
      chosen
        ? h(
            'div',
            { class: 'card step' },
            h('div', { class: 'row' }, h('div', { class: 'grow' }, h('div', { class: 'li-title' }, chosen.name), h('div', { class: 'li-sub' }, `${chosen.category || NO_CATEGORY} · ${money(chosen.price)} · en el sistema ${st[chosen.id] ?? 0}${count.items[chosen.id] ? ` · ya contaste ${count.items[chosen.id]}` : ''}`)), h('button', { class: 'link-btn', type: 'button', onclick: () => ((state.productId = ''), renderPicker(), search.focus()) }, 'Cambiar')),
            h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Cuántos hay (se suma a lo ya contado)'), qty),
            bigButton('Sumar', addCounted, { icon: 'add' }),
          )
        : null,
      !chosen && q
        ? found.length
          ? h('div', { class: 'card results' }, found.map((p) => h('button', { class: 'list-item', type: 'button', onclick: () => choose(p) }, h('div', { class: 'grow' }, h('div', { class: 'li-title' }, p.name), h('div', { class: 'li-sub' }, `${p.category || NO_CATEGORY} · sistema ${st[p.id] ?? 0}${count.items[p.id] ? ` · contados ${count.items[p.id]}` : ''}`)), h('b', null, money(p.price)))))
          : h('p', { class: 'muted small center' }, `No hay productos con "${q}"`)
        : !chosen && !shop.productList().length
          ? h('p', { class: 'muted small center' }, shop.ready ? 'Todavía no hay productos. El administrador los agrega en Inventario.' : 'Cargando productos…')
          : null,
    );
  }

  function renderList() {
    const rows = countRows(count, shop.products, stocks());
    const t = countTotals(rows);
    const sub = main.parentElement?.querySelector('.appbar-title .as');
    if (sub) sub.textContent = `${plural(t.units, 'unidad', 'unidades')} · ${plural(t.products, 'producto', 'productos')}`;
    clear(
      listHost,
      rows.length
        ? [
            h('div', { class: 'section-title' }, `Lo contado (${plural(t.products, 'producto', 'productos')} · ${plural(t.units, 'unidad', 'unidades')})`),
            h('div', { class: 'card' }, rows.map((r) => h('button', { class: 'list-item', type: 'button', onclick: () => editRow(r) }, h('div', { class: 'grow' }, h('div', { class: 'li-title' }, r.name), h('div', { class: 'li-sub' }, `En el sistema: ${r.system}`)), h('b', { class: 'price-big' }, String(r.counted)), icon('edit')))),
            bigButton('Terminar y ver el resultado', () => ((state.phase = 'result'), render()), { icon: 'check' }),
            bigButton('Empezar de cero', async () => (await confirmDialog({ title: 'Empezar de cero', text: 'Se borra todo lo contado hasta ahora. ¿Seguro?', confirmText: 'Borrar' })) && ((count = emptyCount()), save(), renderList()), { outline: true, danger: true, small: true }),
          ]
        : emptyState('Todavía no has contado nada', 'Busca un producto o escanea su código, escribe cuántos hay y toca Sumar.'),
    );
  }

  function renderResult() {
    const st = stocks();
    const rows = countRows(count, shop.products, st);
    const t = countTotals(rows);
    const uncounted = uncountedProducts(count, shop.productList(), st);
    const text = whatsappText({ rows, uncounted });
    const send = () => {
      const n = normalizePhone(waNumber.value);
      if (waNumber.value.trim() && !n) return toast('El número de WhatsApp no parece válido. Escríbelo con código de país, ej. 502 5555 1234', 6000);
      app.storage.setItem('gc_wa_number', n);
      window.open(whatsappUrl(text, n), '_blank', 'noopener');
    };
    const copy = async () => {
      try {
        await navigator.clipboard.writeText(text);
        toast('Resultado copiado');
      } catch {
        toast('No se pudo copiar', 4000);
      }
    };
    const adjust = async () => {
      const diffs = rows.filter((r) => r.diff !== 0 && !r.gone);
      if (!diffs.length) return toast('No hay diferencias que ajustar');
      const ok = await confirmDialog({ title: 'Ajustar el inventario', text: `El inventario de ${plural(diffs.length, 'producto', 'productos')} cambiará a lo que contaste. Los productos que no contaste no se tocan. ¿Seguro?`, confirmText: 'Sí, ajustar' });
      if (!ok) return;
      for (const r of diffs) shop.addStock({ id: r.id, name: r.name }, r.diff, 'admin').catch(() => {});
      toast(`Inventario ajustado (${plural(diffs.length, 'producto', 'productos')})`);
    };
    clear(
      main,
      h(
        'div',
        { class: 'card step' },
        h('div', { class: 'step-title' }, 'Resultado del inventario'),
        h('div', { class: 'ov-total' }, h('span', null, 'Productos contados'), h('b', null, String(t.products))),
        h('div', { class: 'ov-total' }, h('span', null, 'Unidades contadas'), h('b', null, String(t.units))),
        h('div', { class: 'ov-total' }, h('span', null, 'Con diferencia'), h('b', null, String(t.different))),
      ),
      h(
        'div',
        { class: 'card' },
        [...rows].sort((a, b) => a.name.localeCompare(b.name, 'es')).map((r) =>
          h('div', { class: 'list-item compact' }, h('div', { class: 'grow' }, r.name, r.diff !== 0 ? h('span', { class: 'small muted' }, `  sistema ${r.system}`) : null), r.diff !== 0 ? h('span', { class: `stock ${r.diff < 0 ? 'out' : 'low'}` }, r.diff > 0 ? `+${r.diff}` : String(r.diff)) : h('span', { class: 'small muted' }, 'igual'), h('b', null, String(r.counted))),
        ),
      ),
      uncounted.length ? h('details', { class: 'card step' }, h('summary', null, `Sin contar (${uncounted.length})`), h('p', { class: 'small muted' }, uncounted.map((p) => p.name).join(', '))) : null,
      h('div', { class: 'card step' }, h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Enviar a este WhatsApp'), waNumber), bigButton('Enviar por WhatsApp', send, { icon: 'phone' }), bigButton('Copiar el resultado', copy, { outline: true, small: true })),
      isAdmin ? bigButton('Ajustar existencias a lo contado', adjust, { outline: true, icon: 'edit' }) : null,
      bigButton('Seguir contando', () => ((state.phase = 'count'), render()), { outline: true }),
      bigButton('Empezar un inventario nuevo', async () => (await confirmDialog({ title: 'Inventario nuevo', text: 'Se borra el conteo actual. Manda el resultado antes si lo necesitas. ¿Seguro?', confirmText: 'Empezar de cero' })) && ((count = emptyCount()), save(), (state.phase = 'count'), render()), { outline: true, danger: true, small: true }),
    );
  }

  function render() {
    if (state.phase === 'result') return renderResult();
    clear(
      main,
      h('div', { class: 'card step' }, h('div', { class: 'step-title' }, 'Buscar o escanear el producto'), h('div', { class: 'search-row' }, search, scanButton(camera)), h('p', { class: 'small muted' }, 'Por nombre, precio o código de barras.')),
      pickerHost,
      listHost,
    );
    renderPicker();
    renderList();
  }

  const bar = appBar({ title: 'Hacer inventario', subtitle: 'Cuenta lo que hay', onBack: () => app.router.back('/') });
  const el = h('div', { class: 'screen' }, bar, main);
  render();
  return { el, update: () => (state.phase === 'count' ? (renderPicker(), renderList()) : renderResult()) };
}
