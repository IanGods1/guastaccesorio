// Búsqueda de modelos similares con IA (Claude + búsqueda web).
//
// La IA investiga y PROPONE; esta lógica (código propio, sin IA) revisa lo que devuelve:
//  - solo cuenta fuentes de sitios de la lista confiable;
//  - la URL debe provenir de la búsqueda real (no inventada);
//  - la cita debe nombrar al modelo objetivo y a los demás modelos;
//  - las medidas deben coincidir (tolerancia en mm).
// Con eso calcula el grado: "confirmada", "probable" o "por verificar". Nunca se guarda nada
// sin que el administrador lo apruebe.
import { normalize, clean } from './text.js';
import { canonical } from './brands.js';

// ---------------------------------------------------------------- Sitios confiables

/** Búsqueda restringida a estos dominios (incluyen sus subdominios). */
export const TRUSTED_DOMAINS = [
  // Fichas oficiales de las marcas
  'apple.com', 'samsung.com', 'mi.com', 'xiaomi.com', 'motorola.com', 'store.google.com', 'support.google.com',
  'huawei.com', 'honor.com', 'oppo.com', 'realme.com', 'vivo.com', 'oneplus.com', 'hmd.com',
  // Bases de especificaciones
  'gsmarena.com', 'kimovil.com', 'phonearena.com',
  // Fabricantes de accesorios con listas de compatibilidad
  'spigen.com', 'esrgear.com', 'otterbox.com', 'ringke.com', 'caseology.com', 'urbanarmorgear.com',
  'zagg.com', 'belkin.com', 'panzerglass.com', 'nillkin.com', 'speckproducts.com', 'tech21.com',
  'casetify.com', 'supcase.com',
];

export function hostOf(url) {
  try {
    const u = new URL(url);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
    return u.hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return null;
  }
}

export function isTrusted(url) {
  const host = hostOf(url);
  return !!host && TRUSTED_DOMAINS.some((d) => host === d || host.endsWith(`.${d}`));
}

/** Para comparar enlaces: sin www, sin # ni parámetros, sin "/" final. */
export function normalizeUrl(url) {
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase().replace(/^www\./, '');
    return `${host}${u.pathname.replace(/\/+$/, '')}`;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------- Modelos de IA y costo

export const AI_MODELS = [
  { id: 'claude-opus-5-5', label: 'Claude Opus 5.5 — el más preciso', inPerM: 4, outPerM: 20 },
  { id: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5 — más económico', inPerM: 2, outPerM: 10 },
  { id: 'claude-haiku-5-5', label: 'Claude Haiku 5.5 — el más barato', inPerM: 0.1, outPerM: 0.5 },
];
export const DEFAULT_AI_MODEL = 'claude-opus-5-5';
/** Cada búsqueda web cuesta US$10 por cada 1,000. */
export const SEARCH_USD = 0.01;

export function sumUsage(responses) {
  const t = { input: 0, output: 0, searches: 0 };
  for (const r of responses) {
    const u = r.usage ?? {};
    t.input += (u.input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0);
    t.output += u.output_tokens ?? 0;
    t.searches += u.server_tool_use?.web_search_requests ?? 0;
  }
  return t;
}

/** Costo estimado en dólares (tokens + búsquedas web). */
export function estimateCost(modelId, usage) {
  const m = AI_MODELS.find((x) => x.id === modelId) ?? AI_MODELS[0];
  return (usage.input * m.inPerM + usage.output * m.outPerM) / 1e6 + usage.searches * SEARCH_USD;
}

// ---------------------------------------------------------------- Pedido a Claude

const SYSTEM_PROMPT = `Eres el asistente de una tienda de accesorios para celulares. Tu trabajo es investigar en la web qué modelos de teléfono comparten el MISMO case (funda) o el MISMO vidrio templado, para que el vendedor no se equivoque al vender.

REGLAS (obligatorias):
1. Busca con la herramienta web_search (está limitada a sitios confiables: fichas oficiales de marcas, bases de especificaciones y fabricantes de accesorios). No uses tu memoria como fuente: todo dato que reportes debe salir de lo que encontraste en esas páginas.
2. Nunca inventes ni supongas. Si no hay evidencia suficiente, deja el dato en null o no incluyas el modelo, y explícalo en "notes".
3. Medidas: alto, ancho y grosor en milímetros, y tamaño de pantalla en pulgadas, tal como figuran en la fuente, para el modelo objetivo y para cada modelo que propongas.
4. Un "cluster" es un conjunto de modelos para los que UN MISMO case (o vidrio) sirve a TODOS entre sí. El modelo objetivo se sobreentiende y NO va en "models". Si dos modelos solo son parecidos pero tienen distinta posición de cámara, botones, grosor, módulo de cámara, curvatura o muesca, NO los pongas en el mismo cluster: sepáralos o descártalos.
5. El parecido de nombre o de generación NO es evidencia. Evidencia válida: (a) una página de una marca o de un fabricante de accesorios que lista explícitamente los modelos como compatibles con el mismo producto; (b) medidas y diseño que coinciden en fichas oficiales.
6. "explicit_compat_sources": solo páginas que realmente encontraste y que nombran los modelos como compatibles con el mismo producto. Pon la URL exacta y una cita corta (máximo 200 caracteres) copiada de la página que nombre al modelo objetivo y a los modelos del cluster. Si no hay, déjalo vacío.
7. "spec_sources": URLs exactas de las fichas de medidas que usaste.
8. "differences": cualquier diferencia que pueda afectar el ajuste (cámara más grande, botón en otra posición, grosor, bordes curvos, muesca...). Si no hay ninguna, lista vacía.
9. Vidrio templado: depende del tamaño de pantalla, del borde y del recorte de la cámara frontal. Case: depende del cuerpo, del módulo de cámara, de los botones y de los puertos.
10. Es mejor devolver pocos resultados correctos que muchos dudosos.

FORMATO: responde SOLO con un objeto JSON válido (puedes envolverlo en un bloque \`\`\`json), sin texto antes ni después, con exactamente este esquema:
{
  "target": {
    "name": "nombre oficial del modelo objetivo",
    "brand": "marca",
    "found": true,
    "dimensions_mm": { "height": 0, "width": 0, "depth": 0 },
    "screen_inches": 0,
    "sources": ["https://..."]
  },
  "clusters": [
    {
      "kind": "case" | "glass",
      "models": [
        { "name": "...", "brand": "...", "dimensions_mm": { "height": 0, "width": 0, "depth": 0 }, "screen_inches": 0 }
      ],
      "explicit_compat_sources": [ { "url": "https://...", "quote": "texto copiado de la página" } ],
      "spec_sources": ["https://..."],
      "differences": ["..."],
      "summary": "una frase en español que explique por qué son compatibles"
    }
  ],
  "not_compatible_or_unknown": [ { "name": "...", "reason": "en español" } ],
  "notes": "advertencias o datos que no se pudieron confirmar, en español"
}`;

/** Arma el pedido a la API de Claude (se envía con el SDK oficial). */
export function buildRequest({ model, targetName, targetBrand = '', kinds, maxUses = 6, today = new Date().toISOString().slice(0, 10) }) {
  const wants = [];
  if (kinds.includes('case')) wants.push('- CASE (funda): qué otros modelos usan el mismo case.');
  if (kinds.includes('glass')) wants.push('- VIDRIO TEMPLADO: qué otros modelos usan el mismo vidrio templado.');
  const prompt = [
    `Modelo objetivo: ${targetName}${targetBrand ? ` (marca: ${targetBrand})` : ''}`,
    `Fecha de hoy: ${today}`,
    '',
    'Investiga y devuelve el JSON para:',
    ...wants,
    '',
    'Recuerda: solo lo que puedas respaldar con fuentes encontradas; incluye los modelos que NO son compatibles pero se parecen en "not_compatible_or_unknown".',
  ].join('\n');
  return {
    model,
    max_tokens: 16000,
    system: SYSTEM_PROMPT,
    tools: [{ type: 'web_search_20260209', name: 'web_search', max_uses: maxUses, allowed_domains: TRUSTED_DOMAINS }],
    messages: [{ role: 'user', content: prompt }],
  };
}

// ---------------------------------------------------------------- Errores

export class AiError extends Error {
  constructor(kind, message) {
    super(message);
    this.kind = kind;
  }
}

/** Convierte los errores del SDK de Anthropic en mensajes claros en español. */
export function describeApiError(e) {
  if (e instanceof AiError) return e;
  const status = e?.status;
  const text = String(e?.message ?? '');
  if (e?.name === 'APIUserAbortError' || e?.name === 'AbortError') return new AiError('abort', 'Búsqueda cancelada.');
  if (status === 401) return new AiError('auth', 'La llave de Anthropic no es válida. Revísala en Configuración → Inteligencia artificial.');
  if (status === 403) return new AiError('permission', 'Tu cuenta de Anthropic no tiene permiso para usar este modelo o esta función.');
  if (status === 429) return new AiError('rate', 'Demasiadas consultas seguidas. Espera un minuto e inténtalo de nuevo.');
  if (status === 529 || /overloaded/i.test(text)) return new AiError('overloaded', 'Anthropic está saturado en este momento. Inténtalo en un minuto.');
  if (status === 400 && /credit balance/i.test(text)) return new AiError('credits', 'Tu cuenta de Anthropic no tiene saldo. Carga saldo en console.anthropic.com → Billing.');
  if (status === 400 && /web search/i.test(text)) return new AiError('websearch', 'La búsqueda web está desactivada en tu cuenta de Anthropic (console.anthropic.com → Settings → Privacy).');
  if (status === 404) return new AiError('model', 'Tu cuenta no tiene acceso a ese modelo. Elige otro en Configuración → Inteligencia artificial.');
  if (status === undefined && /fetch|network|connection|Failed/i.test(`${e?.name} ${text}`)) {
    return new AiError('network', 'No se pudo conectar con Anthropic. Revisa tu internet.');
  }
  return new AiError('api', `Error de la IA: ${text || e}`);
}

// ---------------------------------------------------------------- Ejecución

/**
 * Hace la consulta. Una búsqueda larga puede pausarse ("pause_turn"): se reenvía lo que dijo
 * Claude, sin cambios, para que continúe. `client` es el cliente del SDK oficial de Anthropic.
 * @returns {{responses: object[], text: string}}
 */
export async function runResearch(client, request, { onProgress, signal, maxTurns = 6 } = {}) {
  const messages = [...request.messages];
  const responses = [];
  for (let turn = 1; turn <= maxTurns; turn++) {
    onProgress?.({ turn, ...sumUsage(responses) });
    let response;
    try {
      response = await client.messages.create({ ...request, messages }, { signal });
    } catch (e) {
      throw describeApiError(e);
    }
    responses.push(response);
    if (response.stop_reason === 'pause_turn') {
      messages.push({ role: 'assistant', content: response.content });
      continue;
    }
    if (response.stop_reason === 'refusal') throw new AiError('refusal', 'La IA se negó a responder esta consulta. Prueba con otro modelo.');
    if (response.stop_reason === 'max_tokens') throw new AiError('truncated', 'La respuesta de la IA quedó incompleta. Inténtalo de nuevo (o prueba solo Case o solo Vidrio).');
    const text = response.content
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join('');
    return { responses, text };
  }
  throw new AiError('too-long', 'La búsqueda tardó demasiado. Inténtalo de nuevo con un solo tipo (Case o Vidrio).');
}

// ---------------------------------------------------------------- Lectura de la respuesta

function tryParseObject(s) {
  const t = s.trim();
  try {
    const v = JSON.parse(t);
    if (v && typeof v === 'object' && !Array.isArray(v)) return v;
  } catch {
    // se intenta con el objeto que está entre llaves
  }
  const a = t.indexOf('{');
  const b = t.lastIndexOf('}');
  if (a >= 0 && b > a) {
    try {
      const v = JSON.parse(t.slice(a, b + 1));
      if (v && typeof v === 'object' && !Array.isArray(v)) return v;
    } catch {
      return null;
    }
  }
  return null;
}

/** Saca el objeto JSON de la respuesta (con o sin bloque ```json). */
export function extractJson(text) {
  const fenced = [...String(text).matchAll(/```(?:json)?\s*([\s\S]*?)```/g)].map((m) => m[1]).reverse();
  for (const c of [...fenced, String(text)]) {
    const o = tryParseObject(c);
    if (o) return o;
  }
  return null;
}

const num = (v) => {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? '').replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? n : null;
};

function dims(d) {
  if (!d || typeof d !== 'object') return null;
  const height = num(d.height);
  const width = num(d.width);
  return height && width ? { height, width, depth: num(d.depth) } : null;
}

function modelEntry(m) {
  const name = clean(m?.name);
  if (!name) return null;
  return { name, brand: canonical(m?.brand ?? ''), dimensions: dims(m?.dimensions_mm), screen: num(m?.screen_inches) };
}

const strings = (v) => (Array.isArray(v) ? v.map((x) => clean(x)).filter(Boolean) : []);

/** Ordena y valida lo que devolvió la IA (no se confía en la forma). */
export function normalizeResult(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const t = raw.target ?? {};
  const target = {
    name: clean(t.name),
    brand: canonical(t.brand ?? ''),
    found: t.found !== false,
    dimensions: dims(t.dimensions_mm),
    screen: num(t.screen_inches),
    sources: strings(t.sources),
  };
  const clusters = [];
  for (const c of Array.isArray(raw.clusters) ? raw.clusters : []) {
    if (c?.kind !== 'case' && c?.kind !== 'glass') continue;
    const seen = new Set();
    const models = [];
    for (const m of Array.isArray(c.models) ? c.models : []) {
      const e = modelEntry(m);
      const key = e && normalize(e.name);
      if (!e || !key || seen.has(key) || key === normalize(target.name)) continue;
      seen.add(key);
      models.push(e);
    }
    if (models.length === 0) continue;
    clusters.push({
      kind: c.kind,
      models,
      explicit: (Array.isArray(c.explicit_compat_sources) ? c.explicit_compat_sources : [])
        .map((s) => ({ url: clean(s?.url), quote: clean(s?.quote).slice(0, 300) }))
        .filter((s) => hostOf(s.url)),
      specSources: strings(c.spec_sources).filter((u) => hostOf(u)),
      differences: strings(c.differences),
      summary: clean(c.summary),
    });
  }
  const rejected = (Array.isArray(raw.not_compatible_or_unknown) ? raw.not_compatible_or_unknown : [])
    .map((x) => ({ name: clean(x?.name), reason: clean(x?.reason) }))
    .filter((x) => x.name);
  return { target, clusters, rejected, notes: clean(raw.notes) };
}

// ---------------------------------------------------------------- Evidencia y grado de confianza

/** Enlaces que de verdad aparecieron en la búsqueda (resultados y citas). */
export function collectEvidence(responses) {
  const urls = new Set();
  const add = (u) => {
    const n = normalizeUrl(u);
    if (n) urls.add(n);
  };
  for (const r of responses) {
    for (const b of r.content ?? []) {
      if (b.type === 'web_search_tool_result' && Array.isArray(b.content)) for (const x of b.content) x?.url && add(x.url);
      if (b.type === 'text' && Array.isArray(b.citations)) for (const c of b.citations) c?.url && add(c.url);
    }
  }
  return { urls, canVerify: urls.size > 0, has: (u) => urls.has(normalizeUrl(u)) };
}

const TOLERANCE = {
  case: { height: 0.3, width: 0.3, depth: 0.4, screen: null },
  glass: { height: 0.5, width: 0.5, depth: null, screen: 0.05 },
};

export const GRADES = { confirmed: 'confirmed', probable: 'probable', unverified: 'unverified' };

/**
 * Grado de un cluster:
 *  - confirmed: una fuente confiable (de la búsqueda real) nombra los modelos como compatibles Y las medidas coinciden Y no hay diferencias.
 *  - probable: las medidas coinciden con fuentes confiables, o el fabricante lo lista pero hay diferencias/medidas distintas.
 *  - unverified: todo lo demás.
 */
export function gradeCluster(cluster, target, evidence) {
  const tol = TOLERANCE[cluster.kind];
  const warnings = [];
  const mm = (v) => `${Math.round(v * 100) / 100} mm`;

  // Medidas
  let dimsOk = !!target.dimensions;
  if (!target.dimensions) warnings.push(`No se encontraron las medidas de ${target.name || 'el modelo'}.`);
  for (const m of cluster.models) {
    if (!target.dimensions) break;
    if (!m.dimensions) {
      dimsOk = false;
      warnings.push(`Faltan las medidas de ${m.name}.`);
      continue;
    }
    for (const [key, label] of [['height', 'alto'], ['width', 'ancho'], ['depth', 'grosor']]) {
      const limit = tol[key];
      if (limit === null) continue;
      const a = target.dimensions[key];
      const b = m.dimensions[key];
      if (a == null || b == null) {
        dimsOk = false;
        warnings.push(`Falta el ${label} de ${a == null ? target.name : m.name}.`);
      } else if (Math.abs(a - b) > limit) {
        dimsOk = false;
        warnings.push(`${m.name}: el ${label} difiere ${mm(Math.abs(a - b))} (${mm(b)} contra ${mm(a)}).`);
      }
    }
    if (tol.screen !== null) {
      if (target.screen == null || m.screen == null) {
        dimsOk = false;
        warnings.push(`Falta el tamaño de pantalla de ${m.screen == null ? m.name : target.name}.`);
      } else if (Math.abs(target.screen - m.screen) > tol.screen) {
        dimsOk = false;
        warnings.push(`${m.name}: la pantalla es de ${m.screen}" y la de ${target.name} es de ${target.screen}".`);
      }
    }
  }

  // Fuentes
  const sources = [];
  const names = [target.name, ...cluster.models.map((m) => m.name)].map(normalize);
  let explicitOk = 0;
  let dropped = 0;
  for (const s of cluster.explicit) {
    if (!isTrusted(s.url)) {
      dropped++;
      continue;
    }
    const q = normalize(s.quote);
    const namesTarget = !!names[0] && q.includes(names[0]);
    const namesMember = names.slice(1).some((n) => n && q.includes(n));
    const real = evidence.canVerify ? evidence.has(s.url) : false;
    const verified = namesTarget && namesMember && real;
    if (verified) explicitOk++;
    else if (!real) warnings.push(`Se descartó un enlace que no apareció en la búsqueda real (${hostOf(s.url)}).`);
    else warnings.push(`La cita de ${hostOf(s.url)} no nombra a los modelos.`);
    sources.push({ url: s.url, domain: hostOf(s.url), quote: s.quote, kind: 'explicit', verified });
  }
  let specCount = 0;
  for (const u of cluster.specSources) {
    if (!isTrusted(u)) {
      dropped++;
      continue;
    }
    const real = evidence.canVerify ? evidence.has(u) : false;
    if (real) specCount++;
    sources.push({ url: u, domain: hostOf(u), quote: '', kind: 'spec', verified: real });
  }
  if (dropped) warnings.push(`Se descartaron ${dropped} fuente(s) por no estar en la lista de sitios confiables.`);
  if (!evidence.canVerify) warnings.push('No se pudo comprobar que los enlaces vinieran de la búsqueda.');
  for (const d of cluster.differences) warnings.push(`Diferencia: ${d}`);

  let grade = GRADES.unverified;
  if (explicitOk >= 1 && dimsOk && cluster.differences.length === 0) grade = GRADES.confirmed;
  else if ((dimsOk && (specCount >= 1 || explicitOk >= 1)) || explicitOk >= 1) grade = GRADES.probable;

  return { grade, dimsOk, explicitOk, sources, warnings };
}

/** Resultado completo con el grado de cada cluster, listo para mostrar. */
export function analyze(responses, text) {
  const json = extractJson(text);
  const result = normalizeResult(json);
  if (!result) return null;
  const evidence = collectEvidence(responses);
  const clusters = result.clusters.map((c) => ({ ...c, ...gradeCluster(c, result.target, evidence) }));
  const order = { confirmed: 0, probable: 1, unverified: 2 };
  clusters.sort((a, b) => order[a.grade] - order[b.grade]);
  return { ...result, clusters };
}
