// Хранилище.
// - Обычный браузер / PWA: IndexedDB (состояние + файлы). Всё остаётся на устройстве.
// - Страница claude.ai: личный раздел хранилища страницы `data/users/<id>/…` (виден только вам)
//   и файлы страницы (assets). Если они недоступны — та же IndexedDB.
import { env } from './env.js';

const DB_NAME = 'lapki';
const DB_VER = 1;
let dbp = null;

function idbOpen() {
  if (!dbp) {
    dbp = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VER);
      req.onupgradeneeded = () => {
        const d = req.result;
        if (!d.objectStoreNames.contains('kv')) d.createObjectStore('kv');
        if (!d.objectStoreNames.contains('files')) d.createObjectStore('files');
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbp;
}

async function tx(store, mode, fn) {
  const d = await idbOpen();
  return new Promise((resolve, reject) => {
    const t = d.transaction(store, mode);
    const s = t.objectStore(store);
    const r = fn(s);
    t.oncomplete = () => resolve(r && 'result' in r ? r.result : undefined);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}

export const idb = {
  get: (store, key) => tx(store, 'readonly', s => s.get(key)),
  set: (store, key, val) => tx(store, 'readwrite', s => s.put(val, key)),
  del: (store, key) => tx(store, 'readwrite', s => s.delete(key)),
  keys: (store) => tx(store, 'readonly', s => s.getAllKeys()),
  clear: (store) => tx(store, 'readwrite', s => s.clear()),
};

export const COLLECTIONS = ['vaccines', 'heats', 'meds', 'feeds', 'tests', 'allergies', 'weights', 'docs'];

export function emptyState() {
  const records = {};
  COLLECTIONS.forEach(c => (records[c] = []));
  return {
    version: 1,
    currentPetId: null,
    pets: [],
    records,
    settings: {
      apiKey: '',
      model: 'claude-opus-5-5',
      reminderDays: 14,
      notify: false,
      lastNotified: '',
      theme: 'auto',
    },
  };
}

export let state = emptyState();
export const storage = { mode: 'local', error: '' }; // 'cloud' — хранилище страницы

const merge = s => {
  const base = emptyState();
  return { ...base, ...s, settings: { ...base.settings, ...s.settings }, records: { ...base.records, ...s.records } };
};

// ---- хранилище страницы: один документ на коллекцию (лимит документа 256 КБ) ----
const cloudDoc = part => env.db.doc(`data/users/${env.uid}/${part}`);
const lastSaved = {};
const chains = {};
function parts(s) {
  const core = { version: s.version, currentPetId: s.currentPetId, pets: s.pets, settings: { ...s.settings, apiKey: '' } };
  const out = { core };
  COLLECTIONS.forEach(c => (out['c-' + c] = { items: s.records[c] }));
  return out;
}
const withTimeout = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej({ code: 'timeout', message: 'Хранилище не отвечает' }), ms))]);

async function loadCloud() {
  const names = ['core', ...COLLECTIONS.map(c => 'c-' + c)];
  const snaps = await withTimeout(Promise.all(names.map(n => cloudDoc(n).get())), 12000);
  const s = emptyState();
  let any = false;
  snaps.forEach((sn, i) => {
    if (!sn.exists) return;
    any = true;
    const d = sn.data();
    lastSaved[names[i]] = JSON.stringify(d);
    if (names[i] === 'core') Object.assign(s, { version: d.version, currentPetId: d.currentPetId, pets: d.pets || [], settings: { ...s.settings, ...d.settings } });
    else s.records[names[i].slice(2)] = Array.isArray(d.items) ? JSON.parse(JSON.stringify(d.items)) : [];
  });
  return any ? s : null;
}

function saveCloud() {
  const p = parts(JSON.parse(JSON.stringify(state)));
  for (const [name, body] of Object.entries(p)) {
    const json = JSON.stringify(body);
    if (lastSaved[name] === json) continue;
    if (json.length > 250000) { report('Слишком много данных в разделе — удалите старые записи или документы'); continue; }
    lastSaved[name] = json;
    // одна запись за раз на документ
    chains[name] = (chains[name] || Promise.resolve()).then(() => cloudDoc(name).set(body)).catch(e => {
      delete lastSaved[name];
      report(e?.code === 'quota_exceeded' ? 'Хранилище заполнено — удалите лишние записи' : 'Не удалось сохранить: ' + (e?.message || e?.code || 'ошибка'));
    });
  }
}
function report(msg) {
  storage.error = msg;
  window.dispatchEvent(new CustomEvent('lapki:storage-error', { detail: msg }));
}

export async function loadState() {
  if (env.db && env.uid) {
    try {
      const s = await loadCloud();
      storage.mode = 'cloud';
      if (s) state = merge(s);
      return state;
    } catch (e) {
      console.warn('Хранилище страницы недоступно', e);
      storage.error = 'Хранилище страницы не отвечает — данные сохраняются только в этом браузере.';
    }
  }
  try {
    const s = await idb.get('kv', 'state');
    if (s) state = merge(s);
  } catch (e) {
    console.warn('IndexedDB недоступна, данные не сохранятся', e);
    storage.error = 'Браузер не даёт сохранять данные — после закрытия страницы они пропадут.';
  }
  return state;
}

let saveTimer = null;
export function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    if (storage.mode === 'cloud') saveCloud();
    else idb.set('kv', 'state', JSON.parse(JSON.stringify(state))).catch(e => console.error(e));
  }, 300);
}

export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

// ---- файлы ----
// id вида f_… — в IndexedDB, иначе — файл страницы (/_blob/<id>)
const urlCache = new Map();
const isLocalFile = id => String(id).startsWith('f_');
export async function putFile(blob) {
  if (storage.mode === 'cloud' && env.assets) {
    const r = await env.assets.upload(blob, { type: blob.type || 'image/jpeg' });
    urlCache.set(r.id, r.url);
    return r.id;
  }
  const id = 'f_' + uid();
  await idb.set('files', id, blob);
  return id;
}
export async function fileUrl(id) {
  if (!id) return '';
  if (urlCache.has(id)) return urlCache.get(id);
  if (!isLocalFile(id)) return '/_blob/' + id;
  try {
    const blob = await idb.get('files', id);
    if (!blob) return '';
    const url = URL.createObjectURL(blob);
    urlCache.set(id, url);
    return url;
  } catch { return ''; }
}
export async function delFile(id) {
  if (!id) return;
  urlCache.delete(id);
  try {
    if (isLocalFile(id)) await idb.del('files', id);
    else if (env.assets) await env.assets.delete(id);
  } catch (e) { console.warn(e); }
}

// ---- записи ----
export function list(coll, petId) {
  return state.records[coll].filter(r => !petId || r.petId === petId);
}
export function upsert(coll, rec) {
  const arr = state.records[coll];
  if (!rec.id) rec.id = uid();
  const i = arr.findIndex(r => r.id === rec.id);
  if (i >= 0) arr[i] = { ...arr[i], ...rec };
  else arr.push(rec);
  save();
  return rec;
}
export function remove(coll, id) {
  const arr = state.records[coll];
  const i = arr.findIndex(r => r.id === id);
  if (i >= 0) {
    const [r] = arr.splice(i, 1);
    if (coll === 'docs') { delFile(r.fileId); if (r.thumbId) delFile(r.thumbId); }
  }
  save();
}

// ---- экспорт / импорт ----
const blobToDataUrl = b => new Promise(res => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(b); });
function fileRefs(s) {
  const refs = [];
  s.pets.forEach(p => p.photoId && refs.push(p.photoId));
  s.records.docs.forEach(d => { if (d.fileId) refs.push(d.fileId); if (d.thumbId) refs.push(d.thumbId); });
  return [...new Set(refs)];
}
export async function exportAll() {
  const files = {};
  for (const id of fileRefs(state)) {
    try {
      const u = await fileUrl(id);
      if (!u) continue;
      const b = await (await fetch(u)).blob();
      files[id] = await blobToDataUrl(b);
    } catch (e) { console.warn('файл не попал в копию', id, e); }
  }
  const s = JSON.parse(JSON.stringify(state));
  s.settings.apiKey = ''; // ключ не уходит в резервную копию
  return { app: 'lapki', exportedAt: new Date().toISOString(), state: s, files };
}
export async function importAll(data) {
  if (!data || data.app !== 'lapki' || !data.state) throw new Error('Это не резервная копия «Лапок»');
  const map = {};
  for (const [k, v] of Object.entries(data.files || {})) {
    const blob = await (await fetch(v)).blob();
    map[k] = await putFile(blob);
  }
  const apiKey = state.settings.apiKey;
  const s = merge(data.state);
  s.settings.apiKey = apiKey;
  s.pets.forEach(p => { if (p.photoId) p.photoId = map[p.photoId] || ''; });
  s.records.docs.forEach(d => { d.fileId = map[d.fileId] || ''; if (d.thumbId) d.thumbId = map[d.thumbId] || ''; });
  state = s;
  save();
}
export async function wipeAll() {
  const refs = fileRefs(state);
  state = emptyState();
  if (storage.mode === 'cloud') {
    for (const id of refs) await delFile(id);
    saveCloud();
  } else {
    try { await idb.clear('files'); await idb.set('kv', 'state', state); } catch (e) { console.warn(e); }
  }
  urlCache.clear();
}
