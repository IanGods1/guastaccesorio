// Ajustes de la IA: viven solo en este navegador (la llave nunca se sube a la nube ni a GitHub).
import { AI_MODELS, DEFAULT_AI_MODEL } from './core/ai.js';

export class AiSettings {
  constructor(storage) {
    this.storage = storage;
  }

  get key() {
    return this.storage.getItem('gc_ai_key') ?? '';
  }
  set key(v) {
    if (v) this.storage.setItem('gc_ai_key', v.trim());
    else this.storage.removeItem('gc_ai_key');
  }
  get hasKey() {
    return this.key.length > 0;
  }
  /** "sk-ant-…ab12" */
  get maskedKey() {
    const k = this.key;
    return k ? `${k.slice(0, 7)}…${k.slice(-4)}` : '';
  }

  get model() {
    const m = this.storage.getItem('gc_ai_model');
    return AI_MODELS.some((x) => x.id === m) ? m : DEFAULT_AI_MODEL;
  }
  set model(v) {
    this.storage.setItem('gc_ai_model', v);
  }

  /** Máximo de búsquedas web por consulta (cada una cuesta 1 centavo de dólar). */
  get maxUses() {
    const n = Number(this.storage.getItem('gc_ai_max_uses'));
    return [3, 6, 10].includes(n) ? n : 6;
  }
  set maxUses(v) {
    this.storage.setItem('gc_ai_max_uses', String(v));
  }
}

export const isValidKeyFormat = (k) => /^sk-ant-[A-Za-z0-9_\-]{20,}$/.test(String(k).trim());
