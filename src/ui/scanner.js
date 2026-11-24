// Escáner de códigos de barras con la cámara (ZXing). El lector se descarga solo la primera vez.
import { h, icon } from './dom.js';

const abs = (p) => new URL(p, document.baseURI).href;

let loading = null;
function loadZXing() {
  if (window.ZXing) return Promise.resolve(window.ZXing);
  loading ??= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = abs('./scan/zxing.min.js');
    s.onload = () => resolve(window.ZXing);
    s.onerror = () => reject(new Error('No se pudo cargar el lector de códigos. Revisa tu conexión.'));
    document.head.append(s);
  });
  return loading;
}

function beep() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.value = 1100;
    g.gain.value = 0.08;
    o.connect(g).connect(ctx.destination);
    o.start();
    setTimeout(() => (o.stop(), ctx.close()), 90);
  } catch {}
  navigator.vibrate?.(50);
}

/**
 * Abre la cámara y lee códigos de barras.
 * @param {{title?: string, continuous?: boolean, onCode: (code: string) => (string|void), hint?: string}} opts
 *   continuous: sigue leyendo (cada lectura llama onCode; el mismo código no se repite en 1.5 s).
 *   onCode puede devolver un texto para mostrarlo ("Cargador · 3 contados").
 * @returns {{close: () => void}}
 */
export function openScanner({ title = 'Escanear código de barras', continuous = false, onCode, hint = '' }) {
  const video = h('video', { class: 'scan-video', playsinline: '', muted: '', autoplay: '' });
  video.muted = true;
  const status = h('div', { class: 'scan-status' }, 'Abriendo la cámara…');
  const last = h('div', { class: 'scan-last' });
  let reader = null;
  let closed = false;
  const seen = new Map();

  const close = () => {
    if (closed) return;
    closed = true;
    try {
      reader?.reset();
    } catch {}
    overlay.remove();
  };

  const manual = h('input', { class: 'input', inputmode: 'numeric', placeholder: 'O escribe el código', autocomplete: 'off', 'aria-label': 'Escribir código', onkeydown: (e) => e.key === 'Enter' && (e.preventDefault(), handle(manual.value.trim(), true)) });
  const overlay = h(
    'div',
    { class: 'scanner', role: 'dialog', 'aria-modal': 'true' },
    h('div', { class: 'scan-top' }, h('b', null, title), h('button', { class: 'scan-close', type: 'button', onclick: close }, continuous ? 'Listo' : 'Cerrar')),
    h('div', { class: 'scan-stage' }, video, h('div', { class: 'scan-frame' })),
    status,
    last,
    hint ? h('div', { class: 'scan-hint' }, hint) : null,
    h('div', { class: 'scan-manual' }, manual),
  );
  document.body.append(overlay);

  function handle(code, typed = false) {
    if (closed || !code) return;
    const now = Date.now();
    if (!typed && continuous && now - (seen.get(code) ?? 0) < 1500) return;
    seen.set(code, now);
    beep();
    const msg = onCode(code);
    if (typeof msg === 'string') last.textContent = msg;
    if (typed) manual.value = '';
    if (!continuous) close();
  }

  (async () => {
    try {
      const ZXing = await loadZXing();
      const hints = new Map();
      hints.set(ZXing.DecodeHintType.POSSIBLE_FORMATS, [ZXing.BarcodeFormat.EAN_13, ZXing.BarcodeFormat.UPC_A, ZXing.BarcodeFormat.EAN_8, ZXing.BarcodeFormat.CODE_128]);
      reader = new ZXing.BrowserMultiFormatReader(hints, 150);
      await reader.decodeFromConstraints({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } } }, video, (result, err) => {
        if (result) handle(result.getText());
        else if (err && err.name !== 'NotFoundException') console.warn('escáner:', err.name, err.message);
      });
      if (!closed) status.textContent = 'Apunta al código de barras';
    } catch (e) {
      const name = e?.name ?? '';
      status.textContent =
        name === 'NotAllowedError' || name === 'SecurityError'
          ? 'No hay permiso para usar la cámara. Actívalo en los ajustes del navegador, o escribe el código abajo.'
          : name === 'NotFoundError' || name === 'OverconstrainedError'
            ? 'Este dispositivo no tiene cámara. Escribe el código abajo.'
            : e?.message || 'No se pudo abrir la cámara. Escribe el código abajo.';
    }
  })();

  return { close };
}

/** Botón con el ícono de código de barras. */
export const scanButton = (onclick, label = 'Escanear') => h('button', { class: 'scan-btn', type: 'button', onclick, 'aria-label': label }, icon('barcode', 24), h('span', null, label));
