// Etiquetas con código de barras: se ven y se comparten como imagen (por ejemplo a Labelife para imprimirlas).
import { h, clear, icon, appBar, bigButton, emptyState, toast } from './dom.js';
import { money } from '../core/shop.js';
import { normalize } from '../core/text.js';
import { drawLabel, labelFile, LABEL_SIZES } from './label-image.js';

export function LabelsScreen(app) {
  const shop = app.shop;
  let filter = '';
  let size = LABEL_SIZES.find((s) => s.id === app.storage.getItem('gc_label_size')) ?? LABEL_SIZES[0];
  const list = h('div', { class: 'stack' });
  const input = h('input', { class: 'input', type: 'search', placeholder: 'Buscar producto', autocomplete: 'off', oninput: (e) => ((filter = e.target.value), render()) });
  const sizeRow = h('div', { class: 'brand-filter' });

  async function share(p) {
    const file = await labelFile({ name: p.name, price: p.price, code: p.barcode, size });
    if (navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: p.name });
        return;
      } catch (e) {
        if (e?.name === 'AbortError') return;
      }
    }
    const a = h('a', { href: URL.createObjectURL(file), download: file.name });
    document.body.append(a);
    a.click();
    a.remove();
    toast('Etiqueta guardada como imagen');
  }

  function render() {
    clear(sizeRow, LABEL_SIZES.map((s) => h('button', { class: `chip${s.id === size.id ? ' on' : ''}`, type: 'button', onclick: () => ((size = s), app.storage.setItem('gc_label_size', s.id), render()) }, s.label)));
    if (!shop.ready) return clear(list, h('div', { class: 'spinner' }));
    const all = shop.productList().filter((p) => p.barcode);
    const items = filter.trim() ? all.filter((p) => normalize(p.name).includes(normalize(filter)) || p.barcode.includes(filter.trim())) : all;
    const missing = shop.missingBarcodes().length;
    clear(
      list,
      missing ? h('p', { class: 'warn' }, `${missing} producto${missing === 1 ? '' : 's'} sin código. Genera los códigos en Inventario.`) : null,
      items.length
        ? items.map((p) => {
            const canvas = drawLabel({ name: p.name, price: p.price, code: p.barcode, size });
            canvas.style.cssText = 'width:100%;max-width:320px;border:1px solid #ccc;border-radius:6px;background:#fff';
            return h('div', { class: 'card step' }, h('div', { class: 'li-title' }, p.name, h('span', { class: 'muted small' }, `  ·  ${money(p.price)}`)), canvas, bigButton('Compartir / guardar imagen', () => share(p), { icon: 'phone', small: true, outline: true }));
          })
        : emptyState(all.length ? 'No se encontró ese producto' : 'Todavía no hay productos con código', 'Los códigos se generan solos al agregar un producto, o con el botón de Inventario.'),
    );
  }

  render();
  return {
    el: h('div', { class: 'screen' }, appBar({ title: 'Etiquetas', subtitle: 'Código de barras para imprimir', onBack: () => app.router.back('/inventory') }), h('main', { class: 'content' }, h('p', { class: 'muted small' }, 'Toca "Compartir" y elige Labelife (o guarda la imagen) para imprimirla en tu impresora de etiquetas. Elige el tamaño del rollo que usas.'), sizeRow, input, list)),
    update: render,
  };
}
