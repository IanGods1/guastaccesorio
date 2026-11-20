// Colores de la app. A partir de un tono (hue) y su intensidad se generan todos los colores
// del modo claro y del modo oscuro, cuidando que el texto siempre se lea bien (contraste).

// light = luminosidad de la barra y los botones en modo claro (más alto = más vivo; siempre se
// ajusta hacia abajo si el texto blanco no se lee bien).
export const PALETTES = [
  { id: 'marino', name: 'Azul marino', hue: 213, sat: 74, light: 15 },
  { id: 'azul', name: 'Azul', hue: 224, sat: 80, light: 30 },
  { id: 'turquesa', name: 'Turquesa', hue: 184, sat: 80, light: 24 },
  { id: 'verde', name: 'Verde', hue: 150, sat: 64, light: 24 },
  { id: 'morado', name: 'Morado', hue: 268, sat: 58, light: 31 },
  { id: 'granate', name: 'Granate', hue: 346, sat: 68, light: 30 },
  { id: 'naranja', name: 'Naranja', hue: 22, sat: 86, light: 32 },
  { id: 'grafito', name: 'Grafito', hue: 215, sat: 10, light: 22 },
];
export const DEFAULT_COLOR = 'marino';

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// ---------------------------------------------------------------- Conversión de colores

export function hslToHex(h, s, l) {
  const S = clamp(s, 0, 100) / 100;
  const L = clamp(l, 0, 100) / 100;
  const k = (n) => (n + h / 30) % 12;
  const a = S * Math.min(L, 1 - L);
  const f = (n) => L - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  const hex = (x) => Math.round(f(x) * 255).toString(16).padStart(2, '0');
  return `#${hex(0)}${hex(8)}${hex(4)}`;
}

export function hexToHsl(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex).trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  let h = 0;
  let s = 0;
  if (d !== 0) {
    s = d / (1 - Math.abs(2 * l - 1));
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return { h, s: s * 100, l: l * 100 };
}

function luminance(hex) {
  const n = parseInt(hex.slice(1), 16);
  const lin = (c) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
}

/** Contraste WCAG entre dos colores hexadecimales (7 o más = muy bueno, 4.5 = mínimo para texto). */
export function contrast(a, b) {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

// ---------------------------------------------------------------- Color elegido

/** "verde" (de la lista) o "#aabbcc" (personalizado) -> {hue, sat, light}. */
export function resolveColor(value) {
  const p = PALETTES.find((x) => x.id === value);
  if (p) return { hue: p.hue, sat: p.sat, light: p.light };
  const hsl = hexToHsl(value);
  if (hsl) return { hue: hsl.h, sat: clamp(hsl.s, 20, 85), light: 28 };
  const d = PALETTES.find((x) => x.id === DEFAULT_COLOR);
  return { hue: d.hue, sat: d.sat, light: d.light };
}

/** Luminosidad pedida, bajada si hace falta para que el texto blanco se lea bien. */
function darkBase(h, s, wanted, min = 8) {
  let l = wanted;
  while (l > 6 && contrast('#ffffff', hslToHex(h, s, l)) < min) l -= 1;
  return l;
}

/** Colores (variables CSS) para un modo: "light" o "dark". */
export function tokens(value, mode) {
  const { hue: h, sat: s, light } = resolveColor(value);
  const n = clamp(s * 0.45, 10, 38); // intensidad de los fondos
  const hex = (sat, l) => hslToHex(h, sat, l);
  if (mode === 'light') {
    const L = darkBase(h, s, light);
    return {
      '--navy': hex(s, L),
      '--navy2': hex(s, darkBase(h, s, L + 9, 5.5)),
      '--primary': hex(s, L),
      '--on-primary': '#ffffff',
      '--primary-container': hex(clamp(s * 0.55, 15, 48), 91),
      '--on-primary-container': hex(Math.min(s, 80), 12),
      '--secondary-container': hex(clamp(s * 0.4, 12, 40), 94),
      '--bg': hex(n, 96),
      '--surface': '#ffffff',
      '--surface-variant': hex(n, 91),
      '--on-surface': hex(clamp(n, 10, 30), 12),
      '--muted': hex(clamp(n * 0.5, 6, 18), 34),
      '--border': hex(n * 0.7, 82),
      '--accent': hex(clamp(s + 10, 40, 90), 46),
    };
  }
  const L = darkBase(h, s, Math.min(light, 18)); // en modo oscuro la barra es más oscura
  return {
    '--navy': hex(s, Math.max(L - 3, 8)),
    '--navy2': hex(s, darkBase(h, s, L + 4, 6.5)),
    '--primary': hex(clamp(s + 10, 45, 85), 80),
    '--on-primary': hex(Math.min(s, 70), 12),
    '--primary-container': hex(clamp(s * 0.65, 30, 60), 22),
    '--on-primary-container': hex(55, 94),
    '--secondary-container': hex(clamp(s * 0.5, 20, 45), 20),
    '--bg': hex(clamp(s * 0.6, 15, 55), 6),
    '--surface': hex(clamp(s * 0.45, 12, 40), 11),
    '--surface-variant': hex(clamp(s * 0.4, 12, 35), 16),
    '--on-surface': hex(30, 92),
    '--muted': hex(20, 78),
    '--border': hex(clamp(s * 0.3, 10, 28), 27),
    '--accent': hex(clamp(s + 10, 45, 90), 68),
  };
}

const declarations = (t) => Object.entries(t).map(([k, v]) => `${k}:${v}`).join(';');

/** Hoja de estilo con los colores del tema elegido (claro, oscuro y "según el sistema"). */
export function themeCss(value) {
  const light = declarations(tokens(value, 'light'));
  const dark = declarations(tokens(value, 'dark'));
  return `:root{${light}}:root[data-theme='dark']{${dark}}@media (prefers-color-scheme: dark){:root:not([data-theme='light']){${dark}}}`;
}

/** Color de la barra superior (para la barra del navegador del teléfono). */
export const barColor = (value) => tokens(value, 'light')['--navy'];

/** Color que se muestra en el selector: el mismo de la barra de la app. */
export const swatchColor = (value) => tokens(value, 'light')['--navy'];
