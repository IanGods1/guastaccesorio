// Pantalla principal: buscador con sugerencias y accesos rápidos.
import { h, clear, icon, appBar, emptyState, avatar } from './dom.js';
import { searchModels } from '../core/search.js';
import { modelsList } from '../core/data.js';
import { openAppearance } from './appearance.js';

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

/** Mosaico de acceso rápido. */
function tile({ title, sub, icon: name, onclick, primary = false }) {
  return h(
    'button',
    { class: `tile${primary ? ' primary' : ''}`, type: 'button', onclick },
    h('span', { class: 'tile-icon' }, icon(name, 26)),
    h('span', { class: 'grow' }, h('span', { class: 'tile-title' }, title), h('br'), h('span', { class: 'tile-sub' }, sub)),
    primary ? h('span', { class: 'chev' }, icon('chevron', 28)) : null,
  );
}

export function HomeScreen(app) {
  const isAdmin = app.auth.role === 'ADMIN';
  let query = '';

  const input = h('input', {
    class: 'input',
    type: 'search',
    placeholder: 'Buscar modelo…',
    autocomplete: 'off',
    autocapitalize: 'none',
    autocorrect: 'off',
    spellcheck: 'false',
    enterkeyhint: 'search',
    'aria-label': 'Buscar modelo',
    oninput: (e) => {
      query = e.target.value;
      renderBody();
    },
    onkeydown: (e) => {
      if (e.key !== 'Enter') return;
      const first = searchModels(modelsList(app.store.data), query, 1)[0];
      if (first) {
        input.blur();
        app.router.go(`/m/${first.id}`);
      }
    },
  });
  const clearBtn = h(
    'button',
    {
      class: 'icon-btn clear',
      type: 'button',
      'aria-label': 'Borrar búsqueda',
      hidden: true,
      onclick: () => {
        query = '';
        input.value = '';
        renderBody();
        input.focus();
      },
    },
    icon('close'),
  );
  const body = h('div', { class: 'stack' });

  function renderBody() {
    clearBtn.hidden = query === '';
    const models = modelsList(app.store.data);
    if (query.trim() === '') {
      const nGroups = Object.keys(app.store.data.groups).length;
      const ready = app.store.ready;
      clear(
        body,
        h(
          'div',
          { class: 'tiles' },
          tile({
            primary: true,
            icon: 'list',
            title: 'Lista de modelos',
            sub: ready ? plural(models.length, 'modelo registrado', 'modelos registrados') : 'Cargando datos…',
            onclick: () => app.router.go('/models'),
          }),
          isAdmin
            ? tile({ icon: 'edit', title: 'Administrar datos', sub: ready ? plural(nGroups, 'grupo', 'grupos') : '…', onclick: () => app.router.go('/admin') })
            : null,
          isAdmin ? tile({ icon: 'settings', title: 'Configuración', sub: 'Contraseñas y más', onclick: () => app.router.go('/settings') }) : null,
        ),
        h('p', { class: 'muted small center' }, 'Escribe un modelo arriba para ver qué otros teléfonos usan el mismo case o el mismo vidrio templado.'),
      );
      return;
    }
    const results = searchModels(models, query, 30);
    if (results.length === 0) {
      clear(
        body,
        emptyState(
          app.store.ready ? 'No se encontró ningún modelo' : 'Cargando datos…',
          app.store.ready ? (isAdmin ? 'Revisa cómo está escrito o agrégalo desde "Administrar datos".' : 'Revisa cómo está escrito.') : null,
        ),
      );
      return;
    }
    clear(
      body,
      results.map((m) =>
        h(
          'button',
          { class: 'list-item suggestion', type: 'button', onclick: () => app.router.go(`/m/${m.id}`) },
          avatar(m.brand),
          h('div', { class: 'grow' }, h('div', { class: 'li-title' }, m.name), h('div', { class: 'li-sub' }, m.brand)),
          icon('chevron'),
        ),
      ),
    );
  }

  const actions = [h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Apariencia', onclick: () => openAppearance(app) }, icon('palette'))];
  if (isAdmin) actions.push(h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Configuración', onclick: () => app.router.go('/settings') }, icon('settings')));

  renderBody();
  return {
    el: h(
      'div',
      { class: 'screen' },
      h(
        'div',
        { class: 'hero-wrap' },
        appBar({ title: 'Guastaccesorio', subtitle: 'Cases y vidrios templados', withLogo: true, flat: true, actions }),
        h(
          'div',
          { class: 'hero' },
          h('div', null, h('h2', null, '¿Qué modelo buscas?'), h('p', null, 'Mira qué case y qué vidrio le quedan.')),
          h('div', { class: 'search-wrap' }, icon('search'), input, clearBtn),
        ),
      ),
      h('main', { class: 'content' }, body),
    ),
    update: renderBody,
  };
}
