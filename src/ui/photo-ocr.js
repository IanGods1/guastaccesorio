// Lee el texto de una foto en el propio teléfono (Tesseract, sin enviar la imagen a ningún servidor).
// Los archivos del lector (unos 10 MB) solo se descargan la primera vez que se usa y quedan guardados.
const abs = (p) => new URL(p, document.baseURI).href;

let tesseractLoading = null;
function loadTesseract() {
  if (window.Tesseract) return Promise.resolve(window.Tesseract);
  tesseractLoading ??= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = abs('./ocr/tesseract.min.js');
    s.onload = () => resolve(window.Tesseract);
    s.onerror = () => reject(new Error('No se pudo cargar el lector de fotos. Revisa tu conexión.'));
    document.head.append(s);
  });
  return tesseractLoading;
}

/** Reduce fotos enormes y las pasa a grises con más contraste: la lectura mejora bastante. */
async function prepare(file) {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, 2200 / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * scale);
  c.height = Math.round(bmp.height * scale);
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(bmp, 0, 0, c.width, c.height);
  const img = ctx.getImageData(0, 0, c.width, c.height);
  const d = img.data;
  let lo = 255, hi = 0;
  for (let i = 0; i < d.length; i += 4) {
    const g = (d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114) | 0;
    d[i] = d[i + 1] = d[i + 2] = g;
    if (g < lo) lo = g;
    if (g > hi) hi = g;
  }
  const span = Math.max(1, hi - lo);
  for (let i = 0; i < d.length; i += 4) d[i] = d[i + 1] = d[i + 2] = ((d[i] - lo) * 255) / span;
  ctx.putImageData(img, 0, 0);
  return c;
}

/** @returns {Promise<string>} texto leído */
export async function readPhoto(file, onProgress = () => {}) {
  onProgress(0, 'Preparando la foto…');
  const canvas = await prepare(file);
  onProgress(0.02, 'Cargando el lector (solo la primera vez)…');
  const T = await loadTesseract();
  const worker = await T.createWorker('eng', 1, {
    workerPath: abs('./ocr/worker.min.js'),
    corePath: abs('./ocr/core'),
    langPath: abs('./ocr/lang'),
    logger: (m) => {
      if (m.status === 'recognizing text') onProgress(0.1 + m.progress * 0.9, 'Leyendo la foto…');
    },
  });
  try {
    await worker.setParameters({ tessedit_pageseg_mode: '6', preserve_interword_spaces: '1' });
    const { data } = await worker.recognize(canvas);
    return data.text;
  } finally {
    await worker.terminate();
  }
}
