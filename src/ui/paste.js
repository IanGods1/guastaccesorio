// Pegar información: le preguntas a una IA, copias su respuesta, la pegas aquí y se agrega
// (y se sube a la nube) con un toque, o solo al pegar si activas la opción. Siempre se puede deshacer.
import { h, clear, icon, appBar, bigButton, emptyState, toast, openDialog } from './dom.js';
import { modelsList } from '../core/data.js';
import { commitParsed, restoreSnapshot } from '../core/commit.js';
import { parsePasted, buildPrompt, kindLabel, similarExisting } from '../core/paste.js';
import { resolveModel } from '../core/naming.js';
import { photoToText, PHOTO_KINDS } from '../core/photo.js';
import { readPhoto } from './photo-ocr.js';

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

/** Copia texto al portapapeles (con alternativa para navegadores que lo limitan). */
async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = h('textarea', { style: { position: 'fixed', opacity: 0 } });
    ta.value = text;
    document.body.append(ta);
    ta.select();
    let ok = false;
    try {
      ok = document.execCommand('copy');
    } catch {
      ok = false;
    }
    ta.remove();
    return ok;
  }
}

export function PasteScreen(app) {
  const store = app.store;
  const state = { text: '', modelName: '', parsed: null, selected: [], phase: 'edit', result: null, snapshot: null };
  const autoOn = () => app.storage.getItem('gc_paste_auto') === '1';

  // ---------------------------------------------------------------- Elementos fijos

  const modelInput = h('input', {
    class: 'input',
    placeholder: 'ej. iPhone 13 o Galaxy A54',
    autocomplete: 'off',
    autocapitalize: 'words',
    spellcheck: 'false',
    oninput: (e) => {
      state.modelName = e.target.value;
      promptBox.textContent = buildPrompt(state.modelName);
    },
  });
  const promptBox = h('pre', { class: 'prompt-box' }, buildPrompt(''));
  const textarea = h('textarea', {
    class: 'input paste-area',
    rows: '7',
    placeholder: 'Pega aquí lo que respondió la IA…',
    autocapitalize: 'none',
    spellcheck: 'false',
    oninput: () => onChange(false),
    onpaste: () => setTimeout(() => onChange(true), 0),
  });
  const autoBox = h('input', {
    type: 'checkbox',
    checked: autoOn(),
    onchange: (e) => app.storage.setItem('gc_paste_auto', e.target.checked ? '1' : '0'),
  });
  const previewHost = h('div', { class: 'stack' });
  const resultHost = h('div', { class: 'stack' });
  const root = h('div', { class: 'screen' });

  // ---------------------------------------------------------------- Acciones

  async function copyPrompt() {
    const ok = await copyText(buildPrompt(state.modelName));
    toast(ok ? 'Copiada. Pégala en ChatGPT, Claude u otra IA' : 'No se pudo copiar: mantén presionado el texto y elige Copiar', 5000);
  }

  async function pasteFromClipboard() {
    try {
      const text = await navigator.clipboard.readText();
      if (!text.trim()) return toast('El portapapeles está vacío');
      textarea.value = text;
      onChange(true);
    } catch {
      toast('Mantén presionado el cuadro de abajo y elige Pegar', 5000);
      textarea.focus();
    }
  }

  /** Leer una lista de compatibles desde una foto: el texto leído queda en el cuadro para revisarlo. */
  function photoDialog() {
    const kind = h('select', { class: 'input' }, PHOTO_KINDS.map((k) => h('option', { value: k.id }, k.label)));
    const file = h('input', { type: 'file', accept: 'image/*', class: 'input' });
    const status = h('p', { class: 'muted small' });
    const bar = h('progress', { max: '1', value: '0', hidden: true, style: { width: '100%' } });
    let busy = false;
    const close = openDialog({
      title: 'Leer una lista desde una foto',
      body: [
        h('p', { class: 'small muted' }, 'Toma una foto de tu lista (o elígela de la galería). Cada renglón con modelos compatibles, o cada bloque separado por un espacio, será un grupo.'),
        h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'La lista es de'), kind),
        h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Foto'), file),
        bar,
        status,
      ],
      actions: [{ label: 'Cerrar' }],
    });
    file.onchange = async () => {
      const f = file.files?.[0];
      if (!f || busy) return;
      busy = true;
      bar.hidden = false;
      try {
        const text = await readPhoto(f, (p, msg) => {
          bar.value = p;
          status.textContent = msg;
        });
        const prefix = PHOTO_KINDS.find((k) => k.id === kind.value).prefix;
        const res = photoToText(text, prefix, { known: modelsList(store.data).map((m) => m.name) });
        if (res.groups === 0) {
          status.textContent = 'No encontré grupos de modelos en la foto. Prueba con una foto más cerca, recta y con buena luz.';
          bar.hidden = true;
          busy = false;
          return;
        }
        textarea.value = (textarea.value.trim() ? textarea.value.trim() + '\n' : '') + res.text;
        onChange(false);
        close();
        toast(`Leí ${plural(res.groups, 'grupo', 'grupos')}. Revisa que los nombres estén bien antes de agregar`, 6000);
        textarea.scrollIntoView({ behavior: 'smooth', block: 'center' });
      } catch (e) {
        status.textContent = e.message || 'No se pudo leer la foto.';
        bar.hidden = true;
        busy = false;
      }
    };
  }

  function onChange(fromPaste) {
    state.text = textarea.value;
    state.parsed = parsePasted(state.text);
    state.selected = state.parsed.groups.map(() => true);
    renderPreview();
    if (fromPaste && autoOn() && canAdd() && state.parsed.errors.length === 0) commit();
  }

  const selectedCount = () => state.selected.filter(Boolean).length;
  const canAdd = () => state.parsed && (selectedCount() > 0 || state.parsed.loose.length > 0);

  function known() {
    return modelsList(store.data).map((m) => ({ name: m.name, brand: m.brand }));
  }
  function commit() {
    const res = commitParsed(store, state.parsed, state.selected);
    if (!res) return;
    state.snapshot = res.snapshot;
    state.result = { added: res.added, newModels: res.newModels, problems: res.problems };
    state.phase = 'done';
    render();
  }

  function undo() {
    const snap = state.snapshot;
    if (!snap) return;
    restoreSnapshot(store, snap);
    state.snapshot = null;
    state.phase = 'edit';
    toast('Deshecho: se quitó lo que se había agregado');
    render();
  }

  function reset() {
    textarea.value = '';
    state.text = '';
    state.parsed = null;
    state.phase = 'edit';
    state.result = null;
    render();
    textarea.focus();
  }

  // ---------------------------------------------------------------- Vista previa

  function groupCard(g, i) {
    const list = known();
    const similar = similarExisting(g, store.data, (n) => resolveModel(n, g.models[0]?.brand ?? '', list)?.name ?? n);
    return h(
      'div',
      { class: `card paste-group ${g.type === 'GLASS' ? 'glass' : 'case'}` },
      h(
        'label',
        { class: 'check strong flat' },
        h('input', {
          type: 'checkbox',
          checked: state.selected[i],
          onchange: (e) => {
            state.selected[i] = e.target.checked;
            renderPreview();
          },
        }),
        h('span', { class: `badge${g.type === 'GLASS' ? ' glass' : ''}` }, kindLabel(g)),
        g.name ? h('span', { class: 'grow' }, g.name) : null,
      ),
      h(
        'div',
        { class: 'model-chips' },
        g.models.map((m) => {
          const exists = !!resolveModel(m.name, m.brand, list);
          return h('span', { class: `model-chip${exists ? '' : ' new'}` }, m.name, h('small', null, exists ? 'ya existe' : 'nuevo'));
        }),
      ),
      g.models[0]?.brand ? h('div', { class: 'small muted' }, `Marca: ${g.models[0].brand}`) : null,
      g.note ? h('div', { class: 'small' }, `Nota: ${g.note}`) : null,
      similar.length ? h('div', { class: 'small warn' }, `Se parece a un grupo que ya tienes: «${similar[0].name}» (${similar[0].shared} modelos en común).`) : null,
    );
  }

  function renderPreview() {
    const p = state.parsed;
    if (!p) return clear(previewHost);
    if (p.groups.length === 0 && p.loose.length === 0) {
      return clear(
        previewHost,
        emptyState(
          'No encontré información para agregar',
          'Pide la información con la pregunta de arriba: así la IA responde en el formato que esta pantalla entiende.',
        ),
        p.errors.length ? h('ul', { class: 'warn-list' }, p.errors.map((e) => h('li', null, e))) : null,
        p.ignored.length ? h('details', null, h('summary', null, `Líneas ignoradas (${p.ignored.length})`), p.ignored.map((l) => h('p', { class: 'small muted' }, l))) : null,
      );
    }
    const n = selectedCount();
    const modelCount = new Set(p.groups.filter((_, i) => state.selected[i]).flatMap((g) => g.models.map((m) => m.name.toLowerCase()))).size;
    clear(
      previewHost,
      h('div', { class: 'section-title big' }, 'Esto es lo que voy a agregar'),
      h('p', { class: 'muted small' }, 'Revisa que sea lo que pediste. La información viene de la IA que usaste: verifícala con el producto.'),
      p.groups.map(groupCard),
      p.loose.length ? h('div', { class: 'card', style: { padding: '14px 16px' } }, h('div', { class: 'bold' }, 'Modelos sin grupo (solo se registran)'), h('div', { class: 'small' }, p.loose.map((m) => m.name).join(', '))) : null,
      p.errors.length ? h('ul', { class: 'warn-list' }, p.errors.map((e) => h('li', null, e))) : null,
      p.warnings.length ? h('ul', { class: 'warn-list' }, p.warnings.map((e) => h('li', null, e))) : null,
      p.ignored.length ? h('details', null, h('summary', { class: 'small' }, `Líneas ignoradas (${p.ignored.length})`), p.ignored.map((l) => h('p', { class: 'small muted' }, l))) : null,
      bigButton(
        n === 0 && p.loose.length === 0 ? 'Marca un grupo para agregarlo' : `Agregar ${plural(n, 'grupo', 'grupos')} y subir a la nube`,
        commit,
        { icon: 'add', disabled: !canAdd() },
      ),
      n > 0 ? h('p', { class: 'muted small center' }, `${plural(modelCount, 'modelo', 'modelos')} en total. Se suben solos y los trabajadores los ven en segundos.`) : null,
    );
  }

  function renderResult() {
    const r = state.result;
    clear(
      resultHost,
      h(
        'div',
        { class: 'card result-card' },
        h('div', { class: 'result-ok' }, icon('check', 40)),
        h('div', { class: 'section-title big center' }, r.added > 0 ? 'Listo, ya está agregado' : 'No se agregó nada'),
        h(
          'p',
          { class: 'center' },
          r.added > 0
            ? `${plural(r.added, 'grupo agregado', 'grupos agregados')} y ${plural(r.newModels, 'modelo nuevo', 'modelos nuevos')}. Ya se están subiendo a la nube.`
            : 'Todo lo que pegaste ya existía o tenía problemas.',
        ),
        r.problems.length ? h('ul', { class: 'warn-list' }, r.problems.map((x) => h('li', null, x))) : null,
      ),
      bigButton('Pegar otra información', reset, { icon: 'paste' }),
      bigButton('Ver los grupos', () => app.router.go('/admin'), { outline: true, icon: 'list' }),
      bigButton('Deshacer lo que agregué', undo, { outline: true, danger: true }),
    );
  }

  // ---------------------------------------------------------------- Pantalla

  function render() {
    const editing = state.phase === 'edit';
    clear(
      root,
      appBar({ title: 'Pegar información', subtitle: 'De la IA a tu lista', onBack: () => app.router.back('/') }),
      h(
        'main',
        { class: 'content' },
        editing
          ? [
              h(
                'div',
                { class: 'card step' },
                h('div', { class: 'step-title' }, h('span', { class: 'step-n' }, '1'), 'Pide la información a una IA'),
                h('p', { class: 'small muted' }, 'Escribe el modelo, copia la pregunta y pégala en ChatGPT, Claude o la IA que uses.'),
                h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Modelo que quieres consultar'), modelInput),
                bigButton('Copiar la pregunta para la IA', copyPrompt, { icon: 'paste' }),
                h('details', null, h('summary', { class: 'small' }, 'Ver la pregunta'), promptBox),
              ),
              h(
                'div',
                { class: 'card step' },
                h('div', { class: 'step-title' }, h('span', { class: 'step-n' }, '2'), 'Pega la respuesta de la IA'),
                bigButton('Leer una lista desde una foto', photoDialog, { icon: 'phone', outline: true }),
                textarea,
                h('div', { class: 'row' }, bigButton('Pegar del portapapeles', pasteFromClipboard, { outline: true, small: true }), bigButton('Borrar', reset, { outline: true, small: true })),
                h('label', { class: 'check' }, autoBox, h('span', null, 'Agregar y subir solo al pegar, sin tocar el botón (siempre podrás deshacer)')),
              ),
              previewHost,
            ]
          : resultHost,
      ),
    );
    modelInput.value = state.modelName;
    textarea.value = state.text;
    autoBox.checked = autoOn();
    if (editing) renderPreview();
    else renderResult();
  }

  render();
  return { el: root };
}
