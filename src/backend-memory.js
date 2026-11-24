// "Firebase de mentira" que vive en el navegador: solo para pruebas automáticas
// (build de pruebas, nunca se incluye en la versión publicada).
// Imita las reglas reales: el administrador escribe; el trabajador solo lee con la clave vigente.
const KEY = 'mem_cloud_v1';

const err = (kind, message = kind) => Object.assign(new Error(message), { kind });

export const newCloud = () => ({ config: null, workerToken: null, adminPassword: null, models: {}, groups: {}, products: {}, moves: {}, closings: {}, sessions: {} });

export class MemoryBackend {
  /**
   * Sin argumentos: la "nube" se guarda en el navegador (pruebas con el navegador).
   * Con `sharedCloud`: varios "teléfonos" comparten la misma nube en memoria (pruebas automáticas).
   */
  constructor(sharedCloud = null) {
    this.persist = !sharedCloud;
    const saved = this.persist ? localStorage.getItem(KEY) : null;
    this.cloud = sharedCloud ?? (saved ? JSON.parse(saved) : newCloud());
    this.user = this.persist ? JSON.parse(localStorage.getItem('mem_user') ?? 'null') : null; // {kind:'admin'|'worker', uid}
    if (sharedCloud) (sharedCloud.peers ??= []).push(this);
    this.dataListeners = new Set();
    this.configListeners = new Set();
    this.offline = false;
    this.writes = [];
  }

  save() {
    if (!this.persist) return;
    localStorage.setItem(KEY, JSON.stringify(this.cloud));
    localStorage.setItem('mem_user', JSON.stringify(this.user));
  }

  async ready() {}
  isAdminSignedIn() {
    return this.user?.kind === 'admin';
  }
  isWorkerSignedIn() {
    return this.user?.kind === 'worker';
  }
  get adminPassword() {
    return this.cloud.adminPassword;
  }

  needOnline() {
    if (this.offline) throw err('no-connection');
  }

  async getConfig() {
    this.needOnline();
    return this.cloud.config ? { ...this.cloud.config } : null;
  }

  listenConfig(cb) {
    this.configListeners.add(cb);
    return () => this.configListeners.delete(cb);
  }

  notifyConfig() {
    if (this.cloud.config) for (const cb of [...this.configListeners]) cb({ ...this.cloud.config });
    for (const other of this.cloud.peers ?? []) if (other !== this && other.cloud.config) for (const cb of [...other.configListeners]) cb({ ...other.cloud.config });
  }

  async createOrSignInAdmin(pw) {
    this.needOnline();
    if (this.adminPassword && this.adminPassword !== pw) throw err('wrong-password');
    this.cloud.adminPassword = pw;
    this.user = { kind: 'admin', uid: 'admin' };
    this.save();
  }

  async signInAdmin(pw) {
    this.needOnline();
    if (this.adminPassword !== pw) throw err('wrong-password');
    this.user = { kind: 'admin', uid: 'admin' };
    this.save();
  }

  async isAdminPassword(pw) {
    return this.adminPassword === pw;
  }

  async changeAdminPassword(current, next) {
    this.needOnline();
    if (this.adminPassword !== current) throw err('wrong-password');
    this.cloud.adminPassword = next;
    this.save();
  }

  async writeInitialConfig(token, salt, iterations) {
    this.needOnline();
    this.cloud.workerToken = token;
    this.cloud.config = { workerVersion: 1, workerSalt: salt, iterations };
    this.save();
  }

  async changeWorkerPassword(token, salt, iterations) {
    if (this.offline) return false;
    this.cloud.workerToken = token;
    this.cloud.config = { workerVersion: (this.cloud.config?.workerVersion ?? 1) + 1, workerSalt: salt, iterations };
    this.save();
    this.notifyConfig();
    this.notifyData(); // los trabajadores con la clave vieja dejan de poder leer
    return true;
  }

  async getWorkerToken() {
    this.needOnline();
    return this.cloud.workerToken;
  }

  async startWorkerSession(token) {
    this.needOnline();
    if (token !== this.cloud.workerToken) throw err('permission-denied');
    const uid = this.user?.kind === 'worker' ? this.user.uid : `w${Math.random().toString(36).slice(2)}`;
    this.cloud.sessions[uid] = token;
    this.user = { kind: 'worker', uid };
    this.save();
  }

  async signOut() {
    this.user = null;
    this.save();
  }

  canRead() {
    if (this.user?.kind === 'admin') return true;
    if (this.user?.kind === 'worker') return this.cloud.sessions[this.user.uid] === this.cloud.workerToken;
    return false;
  }

  listen({ onModels, onGroups, onProducts, onMoves, onClosings, onCosts, onError }) {
    const l = { onModels, onGroups, onProducts, onMoves, onClosings, onCosts, onError };
    this.dataListeners.add(l);
    queueMicrotask(() => this.notifyOne(l));
    return () => this.dataListeners.delete(l);
  }

  notifyOne(l) {
    if (!this.canRead()) return l.onError(err('permission-denied'));
    for (const [cb, col] of [[l.onModels, 'models'], [l.onGroups, 'groups'], [l.onProducts, 'products'], [l.onMoves, 'moves'], [l.onClosings, 'closings'], [l.onCosts, 'costs']]) {
      if (col === 'costs' && !this.isAdminSignedIn()) continue; // los costos solo los lee el administrador
      if (cb) cb(structuredClone(this.cloud[col] ?? {}));
    }
  }

  notifyData() {
    for (const l of [...this.dataListeners]) this.notifyOne(l);
    for (const other of this.cloud.peers ?? []) if (other !== this) for (const l of [...other.dataListeners]) other.notifyOne(l);
  }

  /** Imita las reglas de Firestore: el trabajador solo puede ANOTAR ventas y CERRAR el día (nunca editar ni borrar). */
  allowed(w) {
    if (w.col === 'barcodes' && w.doc !== null && w.id in (this.cloud.barcodes ?? {})) return false; // el código ya existe: la nube lo rechaza
    if (this.isAdminSignedIn()) return true;
    if (!this.canRead() || this.user?.kind !== 'worker') return false;
    const col = this.cloud[w.col] ?? {};
    const d = w.doc;
    if (d === null || w.id in col) return false; // no borra ni edita
    if (w.col === 'moves') {
      const keys = ['productId', 'productName', 'kind', 'qty', 'price', 'caja', 'day', 'by', 'at'];
      return Object.keys(d).every((k) => keys.includes(k)) && d.kind === 'sale' && d.by === 'worker' && Number.isInteger(d.qty) && d.qty > 0 && d.qty <= 1000 && typeof d.price === 'number' && d.price >= 0 && ['1', '2'].includes(d.caja) && typeof d.day === 'string' && d.day.length === 10 && !((`${d.day}_${d.caja}`) in (this.cloud.closings ?? {}));
    }
    if (w.col === 'closings') {
      const keys = ['day', 'caja', 'fondo', 'sold', 'count', 'by', 'at'];
      return Object.keys(d).every((k) => keys.includes(k)) && w.id === `${d.day}_${d.caja}` && typeof d.fondo === 'number' && d.fondo >= 0 && d.by === 'worker';
    }
    return false;
  }

  async commit(writes) {
    if (!writes.every((w) => this.allowed(w))) throw err('permission-denied');
    for (const w of writes) {
      this.writes.push(w);
      this.cloud[w.col] ??= {};
      if (w.doc === null) delete this.cloud[w.col][w.id];
      else this.cloud[w.col][w.id] = structuredClone(w.doc);
    }
    this.save();
    this.notifyData();
  }
}
