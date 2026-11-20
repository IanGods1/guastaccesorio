// Novedades: los últimos modelos que se agregaron a la lista (los de número más alto).
import { h, clear, icon, appBar, emptyState, avatar } from './dom.js';
import { modelsList } from '../core/data.js';

const SHOW = 30;

export function NewModelsScreen(app) {
  let brand = '';
  const chips = h('div', { class: 'brand-filter' });
  const list = h('div', { class: 'stack' });
  const title = appBar({ title: 'Modelos nuevos', subtitle: 'Los últimos que se agregaron', onBack: () => app.router.back('/') });

  function render() {
    if (!app.store.ready) return clear(list, h('div', { class: 'spinner' }));
    const all = modelsList(app.store.data).sort((a, b) => Number(b.id) - Number(a.id));
    const brands = [...new Set(all.map((m) => m.brand))].sort((a, b) => a.localeCompare(b, 'es'));
    if (brand && !brands.includes(brand)) brand = '';
    clear(
      chips,
      ['', ...brands].map((b) =>
        h('button', { class: `chip${b === brand ? ' on' : ''}`, type: 'button', onclick: () => ((brand = b), render()) }, b || 'Todas'),
      ),
    );
    const recent = all.filter((m) => !brand || m.brand === brand).slice(0, SHOW);
    if (recent.length === 0) return clear(list, emptyState('Todavía no hay modelos registrados', null));
    clear(
      list,
      h(
        'div',
        { class: 'card' },
        recent.map((m, i) =>
          h(
            'button',
            { class: 'list-item', type: 'button', onclick: () => app.router.go(`/m/${m.id}`) },
            avatar(m.brand),
            h('div', { class: 'grow' }, h('div', { class: 'li-title' }, m.name), h('div', { class: 'li-sub' }, m.brand)),
            i < 5 ? h('span', { class: 'badge' }, 'Nuevo') : null,
            icon('chevron'),
          ),
        ),
      ),
    );
  }

  render();
  return { el: h('div', { class: 'screen' }, title, h('main', { class: 'content' }, chips, list)), update: render };
}
