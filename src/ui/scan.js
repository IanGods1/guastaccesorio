// Escanear lista: tomas (o eliges) una foto de tu lista de compatibles y los grupos se agregan
// y se suben solos a su categoría (Case, Vidrio normal, 9D o privacy). Siempre se puede deshacer.
import { h, clear, icon, appBar, bigButton, choiceRow, toast } from './dom.js';
import { parsePasted, kindLabel } from '../core/paste.js';
import { photoToText, PHOTO_KINDS } from '../core/photo.js';
import { commitParsed, restoreSnapshot } from '../core/commit.js';
import { readPhoto } from './photo-ocr.js';
import { modelsList } from '../core/data.js';
import { readPhotoWithAI } from './photo-ai.js';
import { AI_MODELS, DEFAULT_AI_MODEL } from '../core/photo-ai.js';

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

export function ScanScreen(app) {
  const store = app.store;
  const state = { kind: app.storage.getItem('gc_scan_kind') || 'case', phase: 'start', progress: 0, msg: '', text: '', res: null, error: '' };
  const autoOn = () => app.storage.getItem('gc_scan_auto') === '1'; // por omisión se revisa antes de subir
  const root = h('div', { class: 'screen' });
  // La llave de IA se guarda solo en este dispositivo (no se sube a la nube).
  const aiKey = () => app.storage.getItem('gc_vision_key') || '';
  const aiModel = () => app.storage.getItem('gc_vision_model') || DEFAULT_AI_MODEL;
  const useAI = () => !!aiKey() && app.storage.getItem('gc_vision_on') !== '0';

  const camera = h('input', { type: 'file', accept: 'image/*', capture: 'environment', hidden: true, onchange: (e) => pick(e.target) });
  const gallery = h('input', { type: 'file', accept: 'image/*', hidden: true, onchange: (e) => pick(e.target) });

  async function pick(input) {
    const f = input.files?.[0];
    input.value = '';
    if (!f) return;
    state.phase = 'reading';
    state.progress = 0;
    state.error = '';
    render();
    try {
      const kind = PHOTO_KINDS.find((k) => k.id === state.kind);
      const onProgress = (p, msg) => {
        state.progress = p;
        state.msg = msg;
        updateProgress();
      };
      const out = useAI()
        ? await readPhotoWithAI(f, { key: aiKey(), model: aiModel(), kindLabel: kind.label, prefix: kind.prefix }, onProgress)
        : photoToText(await readPhoto(f, onProgress), kind.prefix, { known: modelsList(store.data).map((m) => m.name) });
      if (out.groups === 0) {
        state.phase = 'start';
        state.error = 'No encontré grupos de modelos en la foto. Prueba con la foto más cerca, recta y con buena luz, y que cada renglón tenga varios modelos.';
        return render();
      }
      state.text = out.text;
      if (autoOn()) return upload();
      state.phase = 'review';
      render();
    } catch (e) {
      state.phase = 'start';
      state.error = e.message || 'No se pudo leer la foto.';
      render();
    }
  }

  function upload() {
    const parsed = parsePasted(state.text);
    const res = commitParsed(store, parsed);
    if (!res) {
      state.phase = 'start';
      state.error = 'No se pudo armar ningún grupo con ese texto.';
      return render();
    }
    state.res = res;
    state.phase = 'done';
    render();
  }

  function undo() {
    if (!state.res) return;
    restoreSnapshot(store, state.res.snapshot);
    state.res = null;
    state.phase = 'start';
    toast('Deshecho: se quitó lo que se había agregado');
    render();
  }

  const progressEl = h('progress', { max: '1', value: '0', style: { width: '100%' } });
  const msgEl = h('p', { class: 'center muted' });
  function updateProgress() {
    progressEl.value = state.progress;
    msgEl.textContent = state.msg;
  }

  /** Tarjeta "Leer con IA": pegar la llave una vez, activar o quitar. */
  function aiCard() {
    if (!aiKey()) {
      const input = h('input', { class: 'input', type: 'password', placeholder: 'Pega aquí tu llave (sk-ant-…)', autocomplete: 'off', autocapitalize: 'none', spellcheck: 'false' });
      return h(
        'div',
        { class: 'card step' },
        h('div', { class: 'step-title' }, 'Leer con IA (mucho más preciso)'),
        h('p', { class: 'small muted' }, 'Con IA la foto se lee mucho mejor, incluso con diseño o ángulo. La foto se envía a Anthropic y cada una cuesta unos centavos. La llave se guarda solo en este teléfono. Ponle un límite de gasto en la consola de Anthropic.'),
        input,
        bigButton('Guardar llave y activar', () => {
          const k = input.value.trim();
          if (!/^sk-ant-/.test(k)) return toast('Esa no parece una llave de Anthropic (empieza con sk-ant-)', 5000);
          app.storage.setItem('gc_vision_key', k);
          app.storage.setItem('gc_vision_on', '1');
          toast('Llave guardada. Ya se leerán las fotos con IA');
          render();
        }, { outline: true, small: true }),
      );
    }
    const on = h('input', { type: 'checkbox', checked: useAI(), onchange: (e) => (app.storage.setItem('gc_vision_on', e.target.checked ? '1' : '0'), render()) });
    const sel = h('select', { class: 'input', onchange: (e) => app.storage.setItem('gc_vision_model', e.target.value) }, AI_MODELS.map((m) => h('option', { value: m.id, selected: m.id === aiModel() }, m.label)));
    return h(
      'div',
      { class: 'card step' },
      h('label', { class: 'check strong' }, on, h('span', null, 'Leer con IA')),
      useAI() ? h('p', { class: 'small muted' }, 'La foto se envía a Anthropic para leerla (unos centavos por foto).') : h('p', { class: 'small muted' }, 'Apagada: se usa el lector del teléfono, menos preciso.'),
      sel,
      bigButton('Quitar la llave de este teléfono', () => (app.storage.removeItem('gc_vision_key'), render()), { outline: true, small: true, danger: true }),
    );
  }

  function kindPicker() {
    const row = choiceRow({
      options: PHOTO_KINDS.map((k) => ({ value: k.id, label: k.label })),
      get: () => state.kind,
      onSelect: (v) => {
        state.kind = v;
        app.storage.setItem('gc_scan_kind', v);
        row.refresh();
      },
    });
    return row.el;
  }

  function render() {
    let body;
    if (state.phase === 'reading') {
      updateProgress();
      body = [h('div', { class: 'card step' }, h('div', { class: 'step-title' }, 'Leyendo la foto…'), progressEl, msgEl, h('p', { class: 'small muted center' }, 'La foto se lee en tu teléfono y no se envía a ningún lado.'))];
    } else if (state.phase === 'review') {
      const parsed = parsePasted(state.text);
      const ta = h('textarea', { class: 'input paste-area', rows: '8', spellcheck: 'false', oninput: (e) => (state.text = e.target.value) }, state.text);
      body = [
        h('div', { class: 'card step' }, h('div', { class: 'step-title' }, 'Revisa lo que leí'), h('p', { class: 'small muted' }, 'Corrige los nombres que la foto haya leído mal. Cada renglón es un grupo de compatibles.'), ta),
        bigButton('Agregar y subir a la nube', upload, { icon: 'add' }),
        bigButton('Cancelar', () => ((state.phase = 'start'), render()), { outline: true }),
      ];
      void parsed;
    } else if (state.phase === 'done') {
      const r = state.res;
      body = [
        h(
          'div',
          { class: 'card result-card' },
          h('div', { class: 'result-ok' }, icon('check', 40)),
          h('div', { class: 'section-title big center' }, r.added > 0 ? 'Listo, ya se subió' : 'No se agregó nada'),
          h('p', { class: 'center' }, `${plural(r.added, 'grupo agregado', 'grupos agregados')} y ${plural(r.newModels, 'modelo nuevo', 'modelos nuevos')}. Ya se están subiendo a la nube.`),
          r.problems.length ? h('ul', { class: 'warn-list' }, r.problems.map((x) => h('li', null, x))) : null,
        ),
        h(
          'div',
          { class: 'stack' },
          r.groups.map((g) =>
            h('div', { class: `card paste-group ${g.type === 'GLASS' ? 'glass' : 'case'}` }, h('span', { class: `badge${g.type === 'GLASS' ? ' glass' : ''}` }, kindLabel(g)), h('div', { class: 'model-chips' }, g.models.map((m) => h('span', { class: 'model-chip' }, m.name)))),
          ),
        ),
        bigButton('Escanear otra foto', () => ((state.phase = 'start'), (state.res = null), render()), { icon: 'phone' }),
        bigButton('Ver los grupos', () => app.router.go('/admin'), { outline: true, icon: 'list' }),
        bigButton('Deshacer lo que agregué', undo, { outline: true, danger: true }),
      ];
    } else {
      const autoBox = h('input', { type: 'checkbox', checked: autoOn(), onchange: (e) => app.storage.setItem('gc_scan_auto', e.target.checked ? '1' : '0') });
      body = [
        h('div', { class: 'card step' }, h('div', { class: 'step-title' }, h('span', { class: 'step-n' }, '1'), '¿Qué tipo de lista es?'), kindPicker()),
        h(
          'div',
          { class: 'card step' },
          h('div', { class: 'step-title' }, h('span', { class: 'step-n' }, '2'), 'Toma o elige la foto'),
          h('p', { class: 'small muted' }, 'Cada renglón con varios modelos compatibles (separados por coma, "/", "-" o "+") será un grupo en la categoría elegida.'),
          bigButton('Tomar foto', () => camera.click(), { icon: 'phone' }),
          bigButton('Elegir de la galería', () => gallery.click(), { outline: true, icon: 'list' }),
          h('label', { class: 'check' }, autoBox, h('span', null, 'Subir solo, sin revisar antes (solo si tus fotos se leen bien)')),
          state.error ? h('p', { class: 'warn' }, state.error) : null,
        ),
        aiCard(),
        h('p', { class: 'muted small center' }, 'Funciona mejor con la foto recta, cerca y con buena luz. La primera vez descarga el lector (unos 10 MB).'),
      ];
    }
    clear(root, appBar({ title: 'Escanear lista', subtitle: 'De la foto a tus categorías', onBack: () => app.router.back('/') }), h('main', { class: 'content' }, body, camera, gallery));
  }

  render();
  return { el: root };
}
