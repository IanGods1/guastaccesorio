// Lee una foto con visión de Claude. La foto se envía a Anthropic con la llave guardada en este dispositivo.
import { buildRequest, parseResponse, groupsToText, apiErrorMessage, DEFAULT_AI_MODEL } from '../core/photo-ai.js';

/** Reduce la foto (máx. 1568 px) y la pasa a JPEG: basta para leerla y cuesta menos. */
async function toJpegBase64(file) {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, 1568 / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * scale);
  c.height = Math.round(bmp.height * scale);
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', 0.88).split(',')[1];
}

/** @returns {Promise<{text:string, groups:number}>} */
export async function readPhotoWithAI(file, { key, model = DEFAULT_AI_MODEL, kindLabel, prefix }, onProgress = () => {}) {
  onProgress(0.1, 'Preparando la foto…');
  const base64 = await toJpegBase64(file);
  onProgress(0.3, 'La IA está leyendo la lista…');
  let res;
  try {
    res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify(buildRequest({ base64, kindLabel, model })),
    });
  } catch {
    throw new Error('No se pudo conectar con la IA. Revisa tu conexión.');
  }
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(apiErrorMessage(res.status, json?.error?.message));
  const parsed = parseResponse(json);
  return { text: groupsToText(parsed, prefix), groups: parsed.groups.length };
}
