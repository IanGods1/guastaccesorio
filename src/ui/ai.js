// "Buscar similares con IA": la IA investiga en sitios confiables y propone; tú revisas y apruebas.
// Nada se guarda sin tu aprobación.
import { h, clear, icon, appBar, bigButton, openDialog, confirmDialog, toast } from './dom.js';
import { modelsList, saveGroup } from '../core/data.js';
import { normalize, clean } from '../core/text.js';
import { resolveModel } from '../core/naming.js';
import { VARIANTS, VARIANT_LABEL, TYPE_LABEL } from '../core/variants.js';
import {
  AI_MODELS, TRUSTED_DOMAINS, buildRequest, runResearch, analyze, sumUsage, estimateCost, describeApiError, GRADES, AiError,
} from '../core/ai.js';
import { createAiClient } from '../ai-client.js';
import { isValidKeyFormat } from '../ai-settings.js';

const GRADE_TEXT = {
  [GRADES.confirmed]: ['Confirmada', 'Una fuente confiable lista estos modelos como compatibles y las medidas coinciden.'],
  [GRADES.probable]: ['Probable', 'Hay indicios en fuentes confiables, pero falta confirmación o hay diferencias. Verifica con el producto.'],
  [GRADES.unverified]: ['Por verificar', 'No hay evidencia suficiente. No lo guardes sin comprobarlo.'],
};

const fmtTime = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
const usd = (n) => `US$${n.toFixed(2)}`;
const today = () => new Date().toISOString().slice(0, 10);

export const KEY_HELP = [
  'Entra a console.anthropic.com e inicia sesión (o crea una cuenta).',
  'En Billing, carga saldo (por ejemplo US$5).',
  'En API keys, toca Create key y copia la llave (empieza con sk-ant-).',
  'En Limits, pon un límite de gasto mensual.',
];

/** Cuadro para pegar o cambiar la llave de Anthropic. */
export function keyDialog(app, onSaved) {
  const input = h('input', { class: 'input', type: 'password', placeholder: 'sk-ant-...', autocomplete: 'off', autocapitalize: 'none', spellcheck: 'false' });
  const error = h('p', { class: 'error-text', role: 'alert' });
  openDialog({
    title: 'Llave de Anthropic',
    body: [
      h('ol', { class: 'small', style: { margin: 0, paddingLeft: '20px' } }, KEY_HELP.map((t) => h('li', null, t))),
      h('p', { class: 'small muted' }, 'La llave se guarda solo en este dispositivo (no se sube a la nube ni a GitHub). Si pierdes el dispositivo, bórrala en console.anthropic.com → API keys.'),
      h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Pega aquí tu llave'), input),
      error,
    ],
    actions: [
      { label: 'Cancelar' },
      {
        label: 'Guardar',
        onClick: (close) => {
          if (!isValidKeyFormat(input.value)) {
            error.textContent = 'La llave debe empezar con sk-ant- y estar completa.';
            return;
          }
          app.aiSettings.key = input.value;
          close();
          toast('Llave guardada');
          onSaved?.();
        },
      },
    ],
  });
  setTimeout(() => input.focus(), 50);
}

export function AiScreen(app, { modelId }) {
  const settings = app.aiSettings;
  const root = h('div', { class: 'screen' });
  const state = { phase: 'form', name: '', kinds: { case: true, glass: true }, error: '', analysis: null, usage: null, cost: 0, prefilled: false };
  let timer = null;
  let controller = null;
  let selection = [];

  // ---------------------------------------------------------------- Formulario

  const nameInput = h('input', {
    class: 'input',
    placeholder: 'ej. iPhone 13 o Galaxy A54',
    autocomplete: 'off',
    autocapitalize: 'words',
    autocorrect: 'off',
    spellcheck: 'false',
    list: 'ai-models',
    oninput: (e) => (state.name = e.target.value),
    onkeydown: (e) => e.key === 'Enter' && start(),
  });
  const datalist = h('datalist', { id: 'ai-models' });

  function refreshDatalist() {
    clear(datalist, modelsList(app.store.data).slice(0, 500).map((m) => h('option', { value: m.name })));
  }

  function prefill() {
    if (state.prefilled || !modelId) return;
    const m = app.store.data.models[modelId];
    if (!m) return;
    state.prefilled = true;
    state.name = m.name;
    nameInput.value = m.name;
  }

  function kindToggle(kind, label) {
    return h(
      'label',
      { class: 'check' },
      h('input', { type: 'checkbox', checked: state.kinds[kind], onchange: (e) => (state.kinds[kind] = e.target.checked) }),
      label,
    );
  }

  function renderForm() {
    refreshDatalist();
    const model = AI_MODELS.find((m) => m.id === settings.model);
    clear(
      root,
      appBar({ title: 'Buscar similares con IA', onBack: () => app.router.back('/') }),
      h(
        'main',
        { class: 'content' },
        !settings.hasKey
          ? h(
              'div',
              { class: 'card', style: { padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' } },
              h('div', { class: 'bold' }, 'Falta la llave de Anthropic'),
              h('p', { class: 'small' }, 'La IA necesita una llave de tu cuenta de Anthropic. Se guarda solo en este dispositivo.'),
              bigButton('Poner llave', () => keyDialog(app, renderForm), { icon: 'lock' }),
            )
          : null,
        h('p', { class: 'muted' }, 'Escribe un modelo. La IA busca solo en sitios confiables, te muestra las fuentes y las medidas, y tú decides qué guardar. No se guarda nada sin tu aprobación.'),
        h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Modelo'), nameInput, datalist),
        h('div', { class: 'section-title' }, 'Qué buscar'),
        kindToggle('case', 'Case (funda)'),
        kindToggle('glass', 'Vidrio templado'),
        bigButton('Buscar con IA', start, { icon: 'sparkle', disabled: !settings.hasKey }),
        h(
          'p',
          { class: 'muted small' },
          `Modelo de IA: ${model.label}. Cada consulta cuesta aprox. entre US$0.05 y US$0.60 (tokens + hasta ${settings.maxUses} búsquedas web a US$0.01). Al terminar verás el costo real. Puede tardar de 30 segundos a 3 minutos: no cierres la pantalla.`,
        ),
        h(
          'details',
          { class: 'small' },
          h('summary', null, `Sitios confiables que usa (${TRUSTED_DOMAINS.length})`),
          h('p', { class: 'muted' }, TRUSTED_DOMAINS.join(' · ')),
        ),
        state.error ? h('p', { class: 'error-text', role: 'alert' }, state.error) : null,
      ),
    );
    nameInput.value = state.name;
  }

  // ---------------------------------------------------------------- Búsqueda

  async function start() {
    const name = clean(state.name);
    state.error = '';
    if (!settings.hasKey) return renderForm();
    if (!name) {
      state.error = 'Escribe el modelo que quieres buscar.';
      return renderForm();
    }
    const kinds = ['case', 'glass'].filter((k) => state.kinds[k]);
    if (kinds.length === 0) {
      state.error = 'Elige qué buscar: Case, Vidrio templado o los dos.';
      return renderForm();
    }
    const registered = modelsList(app.store.data).find((m) => normalize(m.name) === normalize(name));
    const request = buildRequest({ model: settings.model, targetName: registered?.name ?? name, targetBrand: registered?.brand ?? '', kinds, maxUses: settings.maxUses, today: today() });

    controller = new AbortController();
    state.phase = 'running';
    const startedAt = Date.now();
    const status = h('p', { class: 'muted center' }, 'Conectando con la IA…');
    const clock = h('p', { class: 'bold center' }, '0:00');
    renderRunning(name, status, clock);
    timer = setInterval(() => (clock.textContent = fmtTime(Math.floor((Date.now() - startedAt) / 1000))), 1000);

    try {
      const client = await createAiClient(settings.key);
      const { responses, text } = await runResearch(client, request, {
        signal: controller.signal,
        onProgress: ({ turn, searches }) => (status.textContent = turn === 1 ? 'Buscando en sitios confiables…' : `Siguiendo la búsqueda (paso ${turn}) · ${searches} búsquedas hechas`),
      });
      const analysis = analyze(responses, text);
      state.usage = sumUsage(responses);
      state.cost = estimateCost(settings.model, state.usage);
      if (!analysis) throw new AiError('parse', 'La IA no devolvió una respuesta que se pueda leer. Inténtalo de nuevo.');
      state.analysis = analysis;
      state.registeredTarget = registered ?? null;
      selection = analysis.clusters.map((c) => ({
        on: c.grade === GRADES.confirmed,
        models: new Set(c.models.map((m) => m.name)),
        variants: new Set(['NORMAL']),
        note: defaultNote(c),
      }));
      state.phase = 'result';
      stop();
      renderResult();
    } catch (e) {
      stop();
      const err = describeApiError(e);
      state.phase = 'form';
      state.error = err.kind === 'abort' ? '' : err.message;
      if (err.kind === 'abort') toast('Búsqueda cancelada');
      renderForm();
    }
  }

  function stop() {
    if (timer) clearInterval(timer);
    timer = null;
    controller = null;
  }

  function renderRunning(name, status, clock) {
    clear(
      root,
      appBar({ title: 'Buscando…', subtitle: name }),
      h(
        'main',
        { class: 'content' },
        h('div', { class: 'spinner', 'aria-label': 'Buscando' }),
        clock,
        status,
        h('p', { class: 'muted small center' }, 'La IA está leyendo fichas técnicas y listas de compatibilidad. Puede tardar unos minutos.'),
        bigButton('Cancelar', () => controller?.abort(), { outline: true }),
      ),
    );
  }

  // ---------------------------------------------------------------- Resultado

  function defaultNote(c) {
    const domains = [...new Set(c.sources.filter((s) => s.verified).map((s) => s.domain))].slice(0, 3);
    const from = domains.length ? ` Fuentes: ${domains.join(', ')}.` : '';
    if (c.grade === GRADES.confirmed) return `Confirmado con fuentes (${today()}).${from}`;
    const first = c.warnings.find((w) => !/^Se descartó|^Se descartaron|^No se pudo comprobar/.test(w));
    return `${GRADE_TEXT[c.grade][0]}: verificar con el producto (${today()}).${from}${first ? ` ${first}` : ''}`;
  }

  const selectedCount = () => selection.filter((s) => s.on && s.models.size > 0).length;

  function renderResult() {
    const a = state.analysis;
    const t = a.target;
    const saveBtn = bigButton('', save);
    const refreshSave = () => {
      const n = selectedCount();
      saveBtn.textContent = n === 0 ? 'Marca un grupo para guardarlo' : `Guardar ${n} grupo${n === 1 ? '' : 's'} seleccionado${n === 1 ? '' : 's'}`;
      saveBtn.disabled = n === 0;
    };

    const clusterCard = (c, i) => {
      const sel = selection[i];
      const [gradeLabel, gradeHelp] = GRADE_TEXT[c.grade];
      const onToggle = (e) => {
        sel.on = e.target.checked;
        refreshSave();
      };
      return h(
        'div',
        { class: `card ai-card ${c.grade}` },
        h(
          'div',
          { class: 'ai-head' },
          h('span', { class: `grade ${c.grade}` }, c.grade === GRADES.confirmed ? icon('check', 18) : c.grade === GRADES.probable ? icon('warning', 18) : icon('info', 18), gradeLabel),
          h('span', { class: 'muted small' }, TYPE_LABEL[c.kind === 'case' ? 'CASE' : 'GLASS']),
        ),
        h('p', { class: 'small muted' }, gradeHelp),
        h('div', { class: 'section-title' }, `${t.name} también usa lo mismo que:`),
        h(
          'div',
          null,
          c.models.map((m) =>
            h(
              'label',
              { class: 'check' },
              h('input', {
                type: 'checkbox',
                checked: true,
                onchange: (e) => {
                  e.target.checked ? sel.models.add(m.name) : sel.models.delete(m.name);
                  refreshSave();
                },
              }),
              h('span', { class: 'grow' }, h('span', { class: 'li-title' }, m.name), h('span', { class: 'li-sub' }, specLine(m))),
            ),
          ),
        ),
        c.summary ? h('p', null, c.summary) : null,
        c.warnings.length ? h('ul', { class: 'warn-list' }, c.warnings.map((w) => h('li', null, w))) : null,
        c.sources.length
          ? h(
              'div',
              { class: 'stack' },
              h('div', { class: 'section-title small' }, 'Fuentes (toca para verificar tú mismo)'),
              c.sources.map((s) =>
                h(
                  'div',
                  { class: 'source' },
                  h('a', { href: s.url, target: '_blank', rel: 'noopener noreferrer' }, `${s.verified ? '✓ ' : ''}${s.domain}`),
                  h('span', { class: 'muted small' }, s.kind === 'explicit' ? ' · lista de compatibilidad' : ' · medidas'),
                  s.quote ? h('div', { class: 'quote' }, `“${s.quote}”`) : null,
                ),
              ),
            )
          : h('p', { class: 'small muted' }, 'Sin fuentes confiables verificadas.'),
        c.kind === 'glass'
          ? h(
              'div',
              null,
              h('div', { class: 'section-title small' }, 'Guardar como clase de vidrio'),
              h(
                'div',
                { class: 'chips' },
                VARIANTS.map((v) =>
                  h('button', {
                    class: `chip${sel.variants.has(v) ? ' on' : ''}`,
                    type: 'button',
                    onclick: (e) => {
                      sel.variants.has(v) ? sel.variants.delete(v) : sel.variants.add(v);
                      if (sel.variants.size === 0) sel.variants.add(v);
                      e.currentTarget.classList.toggle('on', sel.variants.has(v));
                    },
                  }, VARIANT_LABEL[v]),
                ),
              ),
              h('p', { class: 'small muted' }, 'La compatibilidad suele ser igual en las tres clases, pero confírmalo antes de marcar 9D o Privacy.'),
            )
          : null,
        h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Nota que verán los trabajadores'), h('textarea', { class: 'input', rows: '2', value: sel.note, oninput: (e) => (sel.note = e.target.value) })),
        h('label', { class: 'check strong' }, h('input', { type: 'checkbox', checked: sel.on, onchange: onToggle }), 'Guardar este grupo'),
      );
    };

    const byKind = (kind) => a.clusters.map((c, i) => [c, i]).filter(([c]) => c.kind === kind);
    const section = (kind, title) => {
      const list = byKind(kind);
      return h(
        'div',
        { class: 'stack' },
        h('div', { class: 'section-title big' }, title),
        list.length ? list.map(([c, i]) => clusterCard(c, i)) : h('p', { class: 'muted' }, state.kinds[kind] ? 'La IA no encontró modelos compatibles con evidencia suficiente.' : 'No se buscó.'),
      );
    };

    refreshSave();
    clear(
      root,
      appBar({ title: t.name || state.name, subtitle: [t.brand, 'resultado de la IA'].filter(Boolean).join(' · '), onBack: () => { state.phase = 'form'; renderForm(); } }),
      h(
        'main',
        { class: 'content' },
        h(
          'div',
          { class: 'card', style: { padding: '14px 16px' } },
          h('div', { class: 'bold' }, 'Modelo buscado'),
          h('div', { class: 'li-title' }, t.name || state.name),
          h('div', { class: 'li-sub' }, targetSpec(t)),
          !t.found ? h('p', { class: 'error-text small' }, 'La IA no encontró fichas confiables de este modelo.') : null,
        ),
        h('div', { class: 'banner' }, 'La IA propone; tú decides. Ningún resultado es 100% seguro: verifica con el producto la primera vez que lo vendas.'),
        state.kinds.case || a.clusters.some((c) => c.kind === 'case') ? section('case', 'Case') : null,
        state.kinds.glass || a.clusters.some((c) => c.kind === 'glass') ? section('glass', 'Vidrio templado') : null,
        a.rejected.length
          ? h('details', null, h('summary', { class: 'bold' }, `Descartados (${a.rejected.length})`), a.rejected.map((r) => h('p', { class: 'small' }, h('b', null, `${r.name}: `), r.reason || 'sin datos suficientes')))
          : null,
        a.notes ? h('div', { class: 'card', style: { padding: '12px 16px' } }, h('div', { class: 'bold small' }, 'Notas de la IA'), h('p', { class: 'small' }, a.notes)) : null,
        saveBtn,
        h(
          'p',
          { class: 'muted small center' },
          `Costo de esta búsqueda: ≈ ${usd(state.cost)} (${state.usage.searches} búsquedas web, ${state.usage.input.toLocaleString('es')} tokens leídos y ${state.usage.output.toLocaleString('es')} escritos).`,
        ),
        bigButton('Nueva búsqueda', () => { state.phase = 'form'; renderForm(); }, { outline: true }),
      ),
    );
  }

  const specLine = (m) => [m.brand, m.dimensions ? `${m.dimensions.height} × ${m.dimensions.width}${m.dimensions.depth ? ` × ${m.dimensions.depth}` : ''} mm` : 'sin medidas', m.screen ? `${m.screen}"` : null].filter(Boolean).join(' · ');
  const targetSpec = (t) => [t.brand, t.dimensions ? `${t.dimensions.height} × ${t.dimensions.width}${t.dimensions.depth ? ` × ${t.dimensions.depth}` : ''} mm` : 'sin medidas', t.screen ? `${t.screen}"` : null].filter(Boolean).join(' · ');

  // ---------------------------------------------------------------- Guardar

  async function save() {
    const a = state.analysis;
    const chosen = a.clusters.map((c, i) => ({ c, s: selection[i] })).filter(({ s }) => s.on && s.models.size > 0);
    if (chosen.length === 0) return;
    const weak = chosen.filter(({ c }) => c.grade !== GRADES.confirmed);
    if (weak.length > 0) {
      const ok = await confirmDialog({
        title: 'Hay grupos sin confirmar',
        text: `${weak.length === 1 ? 'Un grupo marcado no está confirmado' : `${weak.length} grupos marcados no están confirmados`} por fuentes. Los trabajadores lo verán como compatible. ¿Guardar de todos modos?`,
        confirmText: 'Guardar',
      });
      if (!ok) return;
    }

    const known = modelsList(app.store.data).map((m) => ({ name: m.name, brand: m.brand }));
    const pick = (name, brand) => {
      const r = resolveModel(name, brand, known);
      return { name: r?.name ?? name, brand: r?.brand ?? brand };
    };
    const targetName = state.registeredTarget?.name ?? a.target.name ?? clean(state.name);
    const targetInput = pick(targetName, state.registeredTarget?.brand ?? a.target.brand);

    const problems = [];
    let saved = 0;
    app.store.apply((draft) => {
      for (const { c, s } of chosen) {
        const members = c.models.filter((m) => s.models.has(m.name)).map((m) => pick(m.name, m.brand));
        const variants = c.kind === 'glass' ? [...s.variants] : ['NORMAL'];
        for (const variant of variants) {
          const res = saveGroup(draft, { id: null, type: c.kind === 'case' ? 'CASE' : 'GLASS', variant, name: '', note: s.note, models: [targetInput, ...members] });
          if (res.error) problems.push(res.error);
          else saved++;
        }
      }
      return {};
    });
    if (saved > 0) toast(`${saved} grupo${saved === 1 ? '' : 's'} guardado${saved === 1 ? '' : 's'}${problems.length ? ` (${problems.length} ya existía${problems.length === 1 ? '' : 'n'})` : ''}`, 5000);
    else toast(problems[0] ?? 'No se guardó nada', 6000);
    app.router.go('/admin');
  }

  // ---------------------------------------------------------------- Ciclo de vida

  prefill();
  renderForm();
  return {
    el: root,
    update: () => {
      if (state.phase !== 'form') return;
      prefill();
      refreshDatalist();
    },
    dispose: () => {
      controller?.abort();
      stop();
    },
  };
}
