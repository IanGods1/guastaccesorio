// Dibuja la etiqueta de un producto (nombre, código de barras EAN-13 y precio) en un canvas.
import { ean13Modules } from '../core/barcode.js';
import { money } from '../core/shop.js';

export const LABEL_SIZES = [
  { id: '40x30', label: '40 × 30 mm', w: 40, h: 30 },
  { id: '50x30', label: '50 × 30 mm', w: 50, h: 30 },
  { id: '60x40', label: '60 × 40 mm', w: 60, h: 40 },
];

const PX_PER_MM = 12; // ~300 dpi

function wrap(ctx, text, maxWidth, maxLines) {
  const words = text.split(/\s+/);
  const lines = [];
  let cur = '';
  for (const w of words) {
    const test = cur ? `${cur} ${w}` : w;
    if (ctx.measureText(test).width <= maxWidth || !cur) cur = test;
    else (lines.push(cur), (cur = w));
  }
  if (cur) lines.push(cur);
  if (lines.length > maxLines) {
    lines.length = maxLines;
    let last = lines[maxLines - 1];
    while (last.length > 1 && ctx.measureText(last + '…').width > maxWidth) last = last.slice(0, -1);
    lines[maxLines - 1] = last + '…';
  }
  return lines;
}

/** @returns {HTMLCanvasElement} */
export function drawLabel({ name, price, code, size }) {
  const W = Math.round(size.w * PX_PER_MM);
  const H = Math.round(size.h * PX_PER_MM);
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#000';
  ctx.textBaseline = 'top';
  const pad = Math.round(W * 0.05);

  // Fila de arriba: nombre (hasta 2 renglones) a la izquierda y precio a la derecha
  const priceSize = Math.round(H * 0.17);
  ctx.font = `800 ${priceSize}px Arial, Helvetica, sans-serif`;
  const priceText = money(price);
  const priceW = ctx.measureText(priceText).width;
  const nameSize = Math.round(H * 0.13);
  ctx.font = `700 ${nameSize}px Arial, Helvetica, sans-serif`;
  const lines = wrap(ctx, name, W - pad * 2 - priceW - pad * 0.5, 2);
  lines.forEach((l, i) => ctx.fillText(l, pad, pad * 0.6 + i * nameSize * 1.12));
  ctx.font = `800 ${priceSize}px Arial, Helvetica, sans-serif`;
  ctx.textAlign = 'right';
  ctx.fillText(priceText, W - pad, pad * 0.6);
  ctx.textAlign = 'left';
  const top = pad * 0.6 + Math.max(lines.length * nameSize * 1.12, priceSize * 1.1) + H * 0.02;

  // Código de barras centrado, con margen de silencio a cada lado
  const digitSize = Math.round(H * 0.11);
  const module = Math.max(1, Math.floor((W - pad * 2) / 109));
  const x0 = Math.round((W - module * 95) / 2);
  const barH = H - top - digitSize * 1.5 - pad * 0.5;
  const bits = ean13Modules(code);
  const guard = new Set([0, 1, 2, 45, 46, 47, 48, 49, 92, 93, 94]);
  for (let i = 0; i < 95; i++) {
    if (bits[i] === '1') ctx.fillRect(x0 + i * module, top, module, barH + (guard.has(i) ? digitSize * 0.55 : 0));
  }
  ctx.font = `${digitSize}px "Courier New", monospace`;
  ctx.textAlign = 'center';
  const y = top + barH + digitSize * 0.12;
  ctx.fillText(code[0], x0 - module * 6, y);
  ctx.fillText(code.slice(1, 7), x0 + module * 24, y);
  ctx.fillText(code.slice(7), x0 + module * 71, y);
  ctx.textAlign = 'left';
  return c;
}

/** PNG de la etiqueta como archivo. */
export async function labelFile(args) {
  const canvas = drawLabel(args);
  const blob = await new Promise((r) => canvas.toBlob(r, 'image/png'));
  const safe = args.name.replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-') || 'etiqueta';
  return new File([blob], `${safe}-${args.code}.png`, { type: 'image/png' });
}
