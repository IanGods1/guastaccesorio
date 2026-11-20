// Foto de una lista de compatibles: convierte el texto leído de la imagen (OCR) en líneas
// "Case: modelo, modelo, modelo" que entiende "Pegar información". Cada línea con varios modelos,
// o cada bloque de líneas separado por una línea en blanco, es un grupo de compatibles.

export const PHOTO_KINDS = [
  { id: 'case', label: 'Case', prefix: 'Case' },
  { id: 'normal', label: 'Vidrio normal', prefix: 'Vidrio normal' },
  { id: 'd9', label: 'Vidrio 9D', prefix: 'Vidrio 9D' },
  { id: 'privacy', label: 'Vidrio privacy', prefix: 'Vidrio privacy' },
];

const KIND_WORD = /^(case|funda|carcasa|vidrio|cristal|mica|protector|templado|9d|privacy)\b/i;

/** Quita viñetas, numeración, ruido de la lectura y espacios raros de una línea. */
function tidy(line) {
  return line
    .replace(/[ \t]+/g, ' ')
    .replace(/^[\s•·*\-–—▪■□●○>»]+/, '')
    .replace(/^\(?\d{1,2}[.)]\s+(?=\D)/, '') // "1. " / "2) " delante
    .replace(/[“”"`´]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Separadores que usan las listas: coma, punto y coma, +, =, |, y guiones o barras con espacios. */
const SEP = /\s*(?:[,;+=|]|\s[-–—/]\s)\s*/;

const splitLine = (line) => line.split(SEP).map((s) => s.trim()).filter(Boolean);

/** Un modelo plausible: tiene al menos un número o una letra, y no es solo ruido. */
const plausible = (s) => /[a-z0-9]/i.test(s) && s.length >= 2 && s.length <= 40 && /\d/.test(s);

/**
 * @param {string} ocr texto leído de la foto
 * @param {string} prefix "Case", "Vidrio 9D"…
 * @returns {{ text: string, groups: number, lines: number }}
 */
export function photoToText(ocr, prefix) {
  const raw = (ocr ?? '').split(/\r?\n/).map((l) => l.trim());
  const blocks = [];
  let cur = [];
  for (const l of raw) {
    const t = tidy(l);
    if (!t) {
      if (cur.length) blocks.push(cur), (cur = []);
    } else cur.push(t);
  }
  if (cur.length) blocks.push(cur);

  const kept = blocks.flat().filter((l) => !KIND_WORD.test(l) || /\d/.test(l));
  const lineMode = kept.some((l) => splitLine(l).filter(plausible).length >= 2);

  const groups = [];
  for (const block of blocks) {
    if (lineMode) {
      for (const l of block) {
        if (KIND_WORD.test(l) && !/\d/.test(l)) continue; // títulos como "Vidrio 9D"
        const models = splitLine(l.replace(/^[^:]{0,30}:\s*/, '')).filter(plausible);
        if (models.length >= 2) groups.push(models);
      }
    } else {
      const models = block.filter((l) => !(KIND_WORD.test(l) && !/\d/.test(l))).map((l) => l.replace(/^[^:]{0,30}:\s*/, '')).filter(plausible);
      if (models.length >= 2) groups.push(models);
    }
  }
  return { text: groups.map((g) => `${prefix}: ${g.join(', ')}`).join('\n'), groups: groups.length, lines: raw.filter(Boolean).length };
}
