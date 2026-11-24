// Códigos de barras EAN-13: dígito verificador, códigos internos únicos y dibujo (barras).
// Los códigos que genera la app empiezan con "2": ese rango está reservado para uso interno de
// las tiendas, así que nunca chocan con los códigos de fábrica de otros productos.

const L = ['0001101', '0011001', '0010011', '0111101', '0100011', '0110001', '0101111', '0111011', '0110111', '0001011'];
const G = ['0100111', '0110011', '0011011', '0100001', '0011101', '0111001', '0000101', '0010001', '0001001', '0010111'];
const R = ['1110010', '1100110', '1101100', '1000010', '1011100', '1001110', '1010000', '1000100', '1001000', '1110100'];
const PARITY = ['LLLLLL', 'LLGLGG', 'LLGGLG', 'LLGGGL', 'LGLLGG', 'LGGLLG', 'LGGGLL', 'LGLGLG', 'LGLGGL', 'LGGLGL'];

export const INTERNAL_PREFIX = '2';

/** Dígito verificador de los primeros 12 dígitos. */
export function checkDigit(d12) {
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += Number(d12[i]) * (i % 2 === 0 ? 1 : 3);
  return String((10 - (sum % 10)) % 10);
}

export const isValidEan13 = (code) => /^\d{13}$/.test(code) && checkDigit(code.slice(0, 12)) === code[12];

/**
 * Lo que se escribe o escanea → código EAN-13 válido, o null.
 * Acepta EAN-13 y UPC-A (12 dígitos, se le antepone 0). Quita espacios y guiones.
 */
export function normalizeCode(text) {
  const s = String(text ?? '').replace(/[\s-]/g, '');
  if (/^\d{12}$/.test(s)) return isValidEan13('0' + s) ? '0' + s : null;
  return isValidEan13(s) ? s : null;
}

/** Siguiente código interno libre, a partir de los que ya existen. */
export function nextBarcode(existing) {
  let max = 0;
  for (const c of existing) {
    if (isValidEan13(c) && c.startsWith(INTERNAL_PREFIX)) max = Math.max(max, Number(c.slice(1, 12)));
  }
  const body = INTERNAL_PREFIX + String(max + 1).padStart(11, '0');
  return body + checkDigit(body);
}

/** Los 95 módulos (1 = barra, 0 = espacio) de un EAN-13. */
export function ean13Modules(code) {
  if (!isValidEan13(code)) throw new Error('Código EAN-13 no válido');
  const parity = PARITY[Number(code[0])];
  let bits = '101';
  for (let i = 0; i < 6; i++) bits += (parity[i] === 'L' ? L : G)[Number(code[i + 1])];
  bits += '01010';
  for (let i = 7; i < 13; i++) bits += R[Number(code[i])];
  return bits + '101';
}
