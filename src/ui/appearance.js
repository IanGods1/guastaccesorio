// Apariencia: elegir el color de la app (de la lista o cualquiera) y el modo claro/oscuro.
// Se guarda en este dispositivo; cada persona puede elegir el suyo.
import { h, icon, openDialog, choiceRow, bigButton } from './dom.js';
import { PALETTES, swatchColor } from '../core/theme.js';

const MODES = [
  { value: 'system', label: 'Sistema' },
  { value: 'light', label: 'Claro' },
  { value: 'dark', label: 'Oscuro' },
];

export function openAppearance(app) {
  const theme = app.theme;
  const isPalette = (v) => PALETTES.some((p) => p.id === v);

  // ---- Modo
  const modeRow = choiceRow({
    options: MODES,
    get: () => theme.mode,
    onSelect: (v) => {
      theme.setMode(v);
      modeRow.refresh();
    },
  });

  // ---- Colores de la lista
  const items = PALETTES.map((p) => {
    const dot = h('span', { class: 'swatch-dot', style: { background: swatchColor(p.id) } });
    const item = h(
      'button',
      {
        type: 'button',
        class: 'swatch-item',
        'aria-label': p.name,
        onclick: () => {
          theme.setColor(p.id);
          refresh();
        },
      },
      dot,
      p.name,
    );
    return { id: p.id, item, dot };
  });

  // ---- Color personalizado (rueda de colores del teléfono)
  const startColor = isPalette(theme.color) ? '#2f80ed' : theme.color;
  const picker = h('input', {
    type: 'color',
    value: startColor,
    'aria-label': 'Elegir otro color',
    oninput: (e) => {
      theme.setColor(e.target.value);
      refresh();
    },
  });
  const customDot = h('span', { class: 'swatch-dot custom' });
  const customItem = h('label', { class: 'swatch-item' }, customDot, 'Otro', picker);

  function refresh() {
    const current = theme.color;
    for (const { id, item, dot } of items) {
      const on = current === id;
      item.classList.toggle('on', on);
      item.setAttribute('aria-pressed', String(on));
      dot.replaceChildren(...(on ? [icon('check', 26)] : []));
    }
    const custom = !isPalette(current);
    customItem.classList.toggle('on', custom);
    customDot.replaceChildren(...(custom ? [icon('check', 26)] : []));
  }

  // ---- Vista previa (usa los mismos colores que la app, así que cambia en vivo)
  const preview = h(
    'div',
    { class: 'preview', 'aria-hidden': 'true' },
    h('header', { class: 'appbar' }, h('div', { class: 'appbar-title' }, h('div', { class: 'at' }, 'Así se verá'))),
    h('div', { class: 'preview-body' }, bigButton('Botón', () => {}, { small: true }), bigButton('Otro', () => {}, { small: true, outline: true })),
  );

  refresh();
  openDialog({
    title: 'Apariencia',
    body: [
      preview,
      h('div', { class: 'section-title' }, 'Color de la app'),
      h('div', { class: 'swatches' }, items.map((x) => x.item), customItem),
      h('div', { class: 'section-title' }, 'Modo'),
      modeRow.el,
      h('p', { class: 'small muted' }, 'Se guarda en este dispositivo: cada persona puede elegir su color.'),
    ],
    actions: [{ label: 'Listo' }],
  });
}
