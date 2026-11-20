// Teléfonos nuevos: lanzamientos de las marcas populares (se actualizan solos cada día desde Wikidata).
// El administrador puede agregarlos a la lista de modelos con un toque.
import { h, clear, icon, appBar, emptyState, avatar, bigButton, toast } from './dom.js';
import { modelsList } from '../core/data.js';
import { resolveModel } from '../core/naming.js';

const fmt = (iso) => new Date(iso + 'T12:00:00').toLocaleDateString('es', { day: 'numeric', month: 'short', year: 'numeric' });

export function ReleasesScreen(app) {
  const isAdmin = app.auth.role === 'ADMIN';
  let feed = null; // null = cargando, false = error
  let brand = '';
  const chips = h('div', { class: 'brand-filter' });
  const list = h('div', { class: 'stack' });
  const title = appBar({ title: 'Teléfonos nuevos', subtitle: 'Lanzamientos por marca', onBack: () => app.router.back('/') });

  fetch('./novedades.json', { cache: 'no-store' })
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
    .then((j) => (feed = j))
    .catch(() => (feed = false))
    .finally(render);

  const known = () => modelsList(app.store.data).map((m) => ({ name: m.name, brand: m.brand }));
  const exists = (p, list) => !!resolveModel(p.name, p.brand, list);

  function add(phones) {
    const k = known();
    const todo = phones.filter((p) => !exists(p, k));
    if (!todo.length) return toast('Ya están en tu lista');
    app.store.apply((d) => {
      for (const p of todo) d.getOrCreateModel(p.name, p.brand, false);
      return {};
    });
    toast(todo.length === 1 ? `"${todo[0].name}" agregado a tu lista` : `${todo.length} modelos agregados a tu lista`);
  }

  function render() {
    if (feed === null) return clear(list, h('div', { class: 'spinner' }));
    if (feed === false) return clear(list, emptyState('No se pudo cargar', 'Revisa tu conexión e inténtalo de nuevo.'));
    const phones = feed.phones ?? [];
    if (!phones.length) return clear(list, emptyState('Todavía no hay lanzamientos', 'Se buscan solos cada día.'));
    const brands = [...new Set(phones.map((p) => p.brand))];
    if (brand && !brands.includes(brand)) brand = '';
    clear(chips, ['', ...brands].map((b) => h('button', { class: `chip${b === brand ? ' on' : ''}`, type: 'button', onclick: () => ((brand = b), render()) }, b || 'Todas')));
    const shown = phones.filter((p) => !brand || p.brand === brand);
    const k = known();
    const pending = shown.filter((p) => !exists(p, k));
    clear(
      list,
      isAdmin && pending.length ? bigButton(`Agregar los ${pending.length} a mi lista`, () => add(pending), { icon: 'add' }) : null,
      h(
        'div',
        { class: 'card' },
        shown.map((p) =>
          h(
            'div',
            { class: 'list-item' },
            avatar(p.brand),
            h('div', { class: 'grow' }, h('div', { class: 'li-title' }, p.name), h('div', { class: 'li-sub' }, `${p.brand} · ${fmt(p.date)}`)),
            exists(p, k)
              ? h('span', { class: 'badge glass' }, 'En tu lista')
              : isAdmin
                ? h('button', { class: 'icon-btn', type: 'button', 'aria-label': `Agregar ${p.name}`, onclick: () => add([p]) }, icon('add'))
                : null,
          ),
        ),
      ),
      feed.updated ? h('p', { class: 'muted small center' }, `Actualizado el ${fmt(feed.updated)} · Fuente: ${feed.source ?? 'Wikidata'}. Puede faltar algún modelo muy reciente.`) : null,
    );
  }

  render();
  return { el: h('div', { class: 'screen' }, title, h('main', { class: 'content' }, chips, list)), update: render };
}
