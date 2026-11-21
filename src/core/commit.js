// Agregar a los datos lo que se leyó (de una IA pegada o de una foto) y poder deshacerlo.
import { modelsList, saveGroup } from './data.js';
import { resolveModel } from './naming.js';
import { kindLabel } from './paste.js';

const clone = (x) => JSON.parse(JSON.stringify(x));

/**
 * @param store tienda de datos (apply / data)
 * @param parsed resultado de parsePasted
 * @param selected arreglo de booleanos por grupo (por omisión, todos)
 * @returns {null | {snapshot, added, newModels, problems:string[], groups:object[]}}
 */
export function commitParsed(store, parsed, selected = parsed.groups.map(() => true)) {
  const chosen = parsed.groups.filter((_, i) => selected[i]);
  if (chosen.length === 0 && parsed.loose.length === 0) return null;
  const snapshot = clone(store.data);
  const modelsBefore = Object.keys(snapshot.models).length;
  const known = () => modelsList(store.data).map((m) => ({ name: m.name, brand: m.brand }));
  const pick = (name, brand) => {
    const r = resolveModel(name, brand, known());
    return { name: r?.name ?? name, brand: r?.brand ?? brand };
  };
  const problems = [];
  let added = 0;
  store.apply((draft) => {
    for (const g of chosen) {
      const res = saveGroup(draft, { id: null, type: g.type, variant: g.variant, name: g.name, note: g.note, models: g.models.map((m) => pick(m.name, m.brand)) });
      if (res.error) problems.push(`${kindLabel(g)}: ${res.error}`);
      else added++;
    }
    for (const m of parsed.loose) {
      const p = pick(m.name, m.brand);
      draft.getOrCreateModel(p.name, p.brand || null, false);
    }
    return {};
  });
  return { snapshot, added, newModels: Object.keys(store.data.models).length - modelsBefore, problems, groups: chosen };
}

/** Vuelve los datos a como estaban antes de commitParsed. */
export function restoreSnapshot(store, snap) {
  store.apply((draft) => {
    draft.data.models = clone(snap.models);
    draft.data.groups = clone(snap.groups);
    return {};
  });
}
