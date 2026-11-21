// Leer una lista de compatibles con visión de Claude: arma la petición y entiende la respuesta.
// (La llamada de red está en src/ui/photo-ai.js; aquí solo hay lógica pura y comprobable.)

export const AI_MODELS = [
  { id: 'claude-sonnet-5-5', label: 'Sonnet 5.5 (más preciso)' },
  { id: 'claude-haiku-5-5', label: 'Haiku 5.5 (más barato)' },
];
export const DEFAULT_AI_MODEL = AI_MODELS[0].id;

const TOOL = {
  name: 'registrar_grupos',
  description: 'Registra los grupos de modelos de teléfono compatibles que aparecen en la foto.',
  input_schema: {
    type: 'object',
    properties: {
      grupos: {
        type: 'array',
        description: 'Cada grupo es un conjunto de modelos que comparten el mismo accesorio.',
        items: {
          type: 'object',
          properties: {
            modelos: { type: 'array', items: { type: 'string' }, description: 'Nombres de modelo completos, ej. "iPhone 13", "Galaxy A54", "Moto G54".' },
            nota: { type: 'string', description: 'Nota escrita junto al grupo, si la hay. Vacío si no.' },
          },
          required: ['modelos'],
        },
      },
    },
    required: ['grupos'],
  },
};

/** @param {string} base64 imagen en base64 (sin el prefijo data:) */
export function buildRequest({ base64, mediaType = 'image/jpeg', kindLabel, model = DEFAULT_AI_MODEL }) {
  return {
    model,
    max_tokens: 2000,
    tools: [TOOL],
    tool_choice: { type: 'tool', name: TOOL.name },
    messages: [
      {
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } },
          {
            type: 'text',
            text:
              `Esta foto es una lista de compatibilidad de accesorios para teléfonos celulares (tipo de accesorio: ${kindLabel}). ` +
              'Cada renglón, fila, recuadro o bloque de modelos que comparten el mismo accesorio es UN grupo. ' +
              'Reglas: (1) escribe cada modelo con su nombre completo y con la marca o línea cuando se sepa (ej. "iPhone 13", "Galaxy A54", "Moto G54", "Redmi Note 12"); ' +
              '(2) si aparece "13/14/15" o "A54, A55" sepáralos en modelos individuales; ' +
              '(3) ignora precios, logotipos, títulos, textos de publicidad y decoración; ' +
              '(4) copia solo lo que se ve: si un nombre no se lee con seguridad, no lo inventes ni lo adivines, déjalo fuera; ' +
              '(5) si la foto no es una lista de compatibilidad, devuelve grupos vacío. Usa la herramienta registrar_grupos.',
          },
        ],
      },
    ],
  };
}

/** Respuesta de la API → { groups: string[][], notes: string[] }. Lanza Error con un mensaje claro si algo falla. */
export function parseResponse(json) {
  const block = (json?.content ?? []).find((b) => b.type === 'tool_use' && b.name === TOOL.name);
  if (!block) throw new Error('La IA no devolvió una lista. Prueba con otra foto.');
  const groups = [];
  const notes = [];
  for (const g of block.input?.grupos ?? []) {
    const models = [...new Set((g.modelos ?? []).map((m) => String(m).replace(/\s+/g, ' ').trim()).filter((m) => m.length >= 2 && m.length <= 40 && /\d/.test(m)))];
    if (models.length >= 2) {
      groups.push(models);
      notes.push(String(g.nota ?? '').trim());
    }
  }
  return { groups, notes };
}

/** Grupos → texto en el formato de "Pegar información" ("Vidrio 9D: A, B, C"). */
export function groupsToText({ groups, notes }, prefix) {
  return groups.map((g, i) => `${prefix}: ${g.join(', ')}${notes[i] ? `\nNota: ${notes[i]}` : ''}`).join('\n');
}

/** Mensaje en español para un error de la API. */
export function apiErrorMessage(status, bodyMessage = '') {
  if (status === 401) return 'La llave de IA no es válida. Revísala en "Leer con IA".';
  if (status === 403) return 'La llave no tiene permiso para usar este modelo.';
  if (status === 429) return 'Se llegó al límite de uso de la llave. Espera un momento e inténtalo de nuevo.';
  if (status === 529 || status >= 500) return 'La IA está ocupada. Inténtalo de nuevo en un minuto.';
  if (status === 400 && /credit|balance/i.test(bodyMessage)) return 'La cuenta de Anthropic no tiene saldo. Agrega crédito en la consola.';
  return `La IA respondió con un error (${status}). ${bodyMessage}`.trim();
}
