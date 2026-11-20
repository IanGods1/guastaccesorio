// Lector de la información que responde una IA (o cualquier texto con el formato correcto).
// Entiende tres formas, mezcladas o por separado:
//   1) Líneas:   "Case: iPhone 13, iPhone 14 | Marca: Apple | Nota: cámara justa"
//   2) Bloques:  "Vidrio 9D: A54, A55" y debajo "Marca: Samsung" / "Nota: ..."
//   3) Tablas:   CSV, TSV o tabla de Markdown con columnas tipo, grupo, modelo, nota, marca, variante
// Es solo un lector: no inventa nada. Lo que no entiende lo muestra como "ignorado".
import { normalize, clean } from './text.js';
import { parseType, parseVariant, VARIANT_FULL, TYPE_LABEL } from './variants.js';
import { detect, OTHER, canonical } from './brands.js';
import { parseCsv } from './csv.js';
import { parseTable } from './importer.js';

const ATTRIBUTES = {
  brand: ['marca', 'brand', 'fabricante'],
  note: ['nota', 'notas', 'note', 'observacion', 'observaciones', 'advertencia', 'comentario'],
  name: ['nombre', 'nombredelgrupo', 'grupo', 'name'],
};
const attributeOf = (label) => {
  const n = normalize(label);
  return Object.keys(ATTRIBUTES).find((k) => ATTRIBUTES[k].includes(n)) ?? null;
};

// ---------------------------------------------------------------- Modelos de una lista

const MAX_MODEL_LENGTH = 40;
const hasDigit = (s) => /\d/.test(s);

/** Parte antes del primer número del nombre: "iPhone 13 Pro" -> "iPhone ", "Redmi Note 12" -> "Redmi Note ". */
function prefixOf(name) {
  const words = clean(name).split(' ');
  const i = words.findIndex((w) => hasDigit(w));
  return i > 0 ? words.slice(0, i).join(' ') + ' ' : '';
}

/** "13/14", "A55" o "14 Pro" heredan el prefijo del primero ("iPhone ", "Galaxy ") si no traen marca. */
const needsPrefix = (token) => /^(\d|[A-Za-z]{1,2}\d)/.test(token) && detect(token) === OTHER;

export function splitModels(value) {
  const pieces = String(value)
    .replace(/[.。]+\s*$/, '')
    .split(/[,;，|/]/)
    .flatMap((p) => {
      // "iPhone 13 y iPhone 14": solo si cada lado tiene un número
      const parts = p.split(/\s+(?:y|and|e)\s+/i);
      return parts.length > 1 && parts.every(hasDigit) ? parts : [p];
    })
    .map((p) => clean(clean(p).replace(/^["'“”‘’]+|["'“”‘’]+$/g, '')))
    .filter(Boolean);

  const notes = [];
  const models = [];
  let prefix = '';
  for (let piece of pieces) {
    // "iPhone 14 (la cámara es más grande)": el paréntesis es una nota, no parte del nombre
    const m = /^(.*?)\s*\(([^)]*)\)\s*$/.exec(piece);
    if (m && /[A-Za-zÁÉÍÓÚáéíóúñÑ]{3,}/.test(m[2])) {
      notes.push(`${m[1]}: ${m[2]}`);
      piece = clean(m[1]);
    }
    if (!piece) continue;
    if (models.length > 0 && prefix && needsPrefix(piece)) piece = prefix + piece;
    if (models.length === 0) prefix = prefixOf(piece);
    models.push(piece);
  }
  const seen = new Set();
  return {
    models: models.filter((m) => {
      const k = normalize(m);
      if (!k || seen.has(k)) return false;
      seen.add(k);
      return true;
    }),
    notes,
  };
}

/** Un modelo tiene que parecer un modelo (si no, es una frase suelta de la IA). */
const isPlaceholder = (name) => /^(modelo|model)\s*\d*$/i.test(name) || /escribe aqu/i.test(name);
const looksLikeModel = (name) =>
  name.length >= 2 && name.length <= MAX_MODEL_LENGTH && !isPlaceholder(name) && (hasDigit(name) || detect(name) !== OTHER);

// ---------------------------------------------------------------- Texto en líneas o bloques

const BULLET = /^\s*(?:[-*•·▪◦]|\d+[.)])\s+/;

function parseLines(text) {
  const groups = [];
  const ignored = [];
  const globals = {};
  let cur = null;

  const addModels = (group, value) => {
    const { models, notes } = splitModels(value);
    for (const m of models) {
      if (looksLikeModel(m)) group.rawModels.push(m);
      else ignored.push(m);
    }
    group.parenNotes.push(...notes);
  };
  const setAttribute = (target, key, value) => {
    if (value) target[key] = value;
  };

  for (const raw of text.split(/\r?\n/)) {
    const bullet = BULLET.test(raw);
    const line = raw.replace(BULLET, '').replace(/[*_`#]/g, '').replace(/：/g, ':').trim();
    if (!line) {
      cur = null; // una línea en blanco termina el grupo
      continue;
    }
    // "Case: a, b | Marca: Apple | Nota: ..." -> trozos
    const segments = line.split('|').map((x) => x.trim());
    const first = segments[0];
    const colon = first.indexOf(':');
    const label = colon >= 0 ? first.slice(0, colon).trim() : first;
    const value = colon >= 0 ? first.slice(colon + 1).trim() : '';
    const wordCount = label.split(/\s+/).length;

    const attr = attributeOf(label);
    const type = !attr && label.length <= 36 && wordCount <= 4 ? parseType(label) : null;

    if (type && (colon >= 0 || segments.length === 1)) {
      cur = { type, variant: type === 'GLASS' ? parseVariant(label) ?? 'NORMAL' : 'NORMAL', name: '', note: '', brand: '', rawModels: [], parenNotes: [] };
      groups.push(cur);
      // cuando hay "|", los modelos son todo lo del primer trozo; los demás trozos son atributos
      addModels(cur, value);
      for (const seg of segments.slice(1)) {
        const i = seg.indexOf(':');
        const key = i >= 0 ? attributeOf(seg.slice(0, i)) : null;
        if (key) setAttribute(cur, key, seg.slice(i + 1).trim());
        else if (seg) addModels(cur, seg);
      }
      continue;
    }
    if (attr && colon >= 0) {
      setAttribute(cur ?? globals, attr, value);
      for (const seg of segments.slice(1)) {
        const i = seg.indexOf(':');
        const key = i >= 0 ? attributeOf(seg.slice(0, i)) : null;
        if (key) setAttribute(cur ?? globals, key, seg.slice(i + 1).trim());
      }
      continue;
    }
    if (bullet && cur) {
      addModels(cur, line);
      continue;
    }
    ignored.push(raw.trim());
  }

  const warnings = [];
  const result = [];
  for (const g of groups) {
    if (g.rawModels.length === 0) {
      warnings.push(`El grupo de ${g.type === 'CASE' ? 'case' : 'vidrio'} no tiene modelos y se omitió.`);
      continue;
    }
    const brand = canonical(g.brand || globals.brand || '');
    const note = clean(g.note || globals.note || '') || '';
    const extra = g.parenNotes.length ? g.parenNotes.join('. ') : '';
    result.push({
      type: g.type,
      variant: g.variant,
      name: clean(g.name || globals.name || ''),
      note: [note, extra].filter(Boolean).join(' · '),
      models: g.rawModels.map((name) => ({ name, brand })),
    });
  }
  return { groups: result, loose: [], ignored, errors: [], warnings };
}

// ---------------------------------------------------------------- Tablas

const SEPARATOR_ROW = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/;

function tableRows(text) {
  const body = text.replace(/```[a-zA-Z]*/g, '');
  const lines = body.split(/\r?\n/).filter((l) => l.trim());
  const pipes = lines.filter((l) => (l.match(/\|/g) ?? []).length >= 3);
  if (pipes.length >= 2) {
    const rows = pipes
      .filter((l) => !SEPARATOR_ROW.test(l))
      .map((l) => l.trim().replace(/^\||\|$/g, '').split('|').map((c) => clean(c.replace(/[*_`]/g, ''))));
    // Es una tabla de verdad si tiene la fila de rayas o un encabezado con "modelo".
    const hasRule = pipes.some((l) => SEPARATOR_ROW.test(l));
    const header = (rows[0] ?? []).map(normalize);
    if (hasRule || header.includes('modelo') || header.includes('model')) return rows;
  }
  const rows = parseCsv(body.trim());
  if (rows.length >= 2 && rows[0].length >= 3) {
    const header = rows[0].map(normalize);
    if (header.includes('modelo') || header.includes('model') || header.includes('modelos')) return rows;
  }
  return null;
}

function fromTable(rows) {
  const parsed = parseTable(rows);
  const map = new Map();
  const loose = [];
  for (const r of parsed.rows) {
    if (!r.type) {
      loose.push({ name: r.model, brand: canonical(r.brand) });
      continue;
    }
    const key = `${r.type}|${r.variant}|${normalize(r.group)}`;
    if (!map.has(key)) map.set(key, { type: r.type, variant: r.variant, name: r.group, note: '', models: [] });
    const g = map.get(key);
    if (r.note && !g.note) g.note = r.note;
    g.models.push({ name: r.model, brand: canonical(r.brand) });
  }
  return { groups: [...map.values()], loose, ignored: [], errors: parsed.errors, warnings: [] };
}

// ---------------------------------------------------------------- Entrada principal

/**
 * @returns {{groups: Array<{type, variant, name, note, models: Array<{name, brand}>}>, loose: Array, ignored: string[], errors: string[], warnings: string[]}}
 */
export function parsePasted(input) {
  const text = String(input ?? '').trim();
  if (!text) return { groups: [], loose: [], ignored: [], errors: [], warnings: [] };
  const rows = tableRows(text);
  const result = rows ? fromTable(rows) : parseLines(text);
  // Sin repetidos dentro de cada grupo
  for (const g of result.groups) {
    const seen = new Set();
    g.models = g.models.filter((m) => {
      const k = normalize(m.name);
      if (!k || seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  }
  result.groups = result.groups.filter((g) => g.models.length > 0);
  return result;
}

// ---------------------------------------------------------------- Ayudas para la pantalla

export const kindLabel = (g) => (g.type === 'GLASS' ? VARIANT_FULL[g.variant] : TYPE_LABEL.CASE);

/** Grupos que ya existen del mismo tipo y clase y comparten 2 o más modelos con este. */
export function similarExisting(group, data, resolveName = (n) => n) {
  const mine = new Set(group.models.map((m) => normalize(resolveName(m.name))));
  const out = [];
  for (const g of Object.values(data.groups)) {
    if (g.type !== group.type || g.variant !== group.variant) continue;
    const shared = g.models.map((id) => data.models[id]).filter((m) => m && mine.has(m.normalized)).length;
    if (shared >= 2) out.push({ name: g.name, shared });
  }
  return out;
}

/** Texto que se copia para pedírselo a cualquier IA, con el modelo ya escrito. */
export function buildPrompt(model) {
  const m = clean(model) || '[ESCRIBE AQUÍ EL MODELO, por ejemplo iPhone 13]';
  return `Necesito saber qué modelos de teléfono comparten el MISMO case (funda) y el MISMO vidrio templado que este modelo: ${m}

Busca en fuentes confiables (fichas oficiales de la marca, GSMArena y fabricantes de accesorios como Spigen o ESR). Responde SOLO con este formato, sin explicaciones antes ni después:

Case: modelo 1, modelo 2, modelo 3
Marca: marca de los modelos
Nota: advertencia corta si hay alguna (se puede omitir esta línea)

Vidrio normal: modelo 1, modelo 2
Marca: marca de los modelos

Vidrio 9D: modelo 1, modelo 2
Marca: marca de los modelos

Vidrio privacy: modelo 1, modelo 2
Marca: marca de los modelos

Reglas:
- Incluye siempre el modelo que te pedí dentro de cada grupo.
- Solo modelos con compatibilidad real (mismas medidas, misma cámara y misma pantalla). Si no estás seguro de un modelo, NO lo incluyas.
- Usa nombres completos y oficiales, uno por modelo (por ejemplo "iPhone 14" o "Galaxy A54"), separados por comas.
- Si no encuentras información de un tipo (por ejemplo vidrio privacy), omite ese grupo.
- Separa los grupos con una línea en blanco.`;
}
