// Хранилище: IndexedDB (состояние + файлы-картинки). Всё остаётся на устройстве.
const DB_NAME = 'lapki';
const DB_VER = 1;
let dbp = null;

function db() {
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
  const d = await db();
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

export async function loadState() {
  try {
    const s = await idb.get('kv', 'state');
    if (s) {
      const base = emptyState();
      state = { ...base, ...s, settings: { ...base.settings, ...s.settings }, records: { ...base.records, ...s.records } };
    }
  } catch (e) {
    console.warn('IndexedDB недоступна, данные не сохранятся', e);
  }
  return state;
}

let saveTimer = null;
export function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    idb.set('kv', 'state', JSON.parse(JSON.stringify(state))).catch(e => console.error(e));
  }, 150);
}

export function replaceState(s) {
  state = s;
  save();
}

export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

// ---- файлы ----
const urlCache = new Map();
export async function putFile(blob) {
  const id = 'f_' + uid();
  await idb.set('files', id, blob);
  return id;
}
export async function fileUrl(id) {
  if (!id) return '';
  if (urlCache.has(id)) return urlCache.get(id);
  const blob = await idb.get('files', id);
  if (!blob) return '';
  const url = URL.createObjectURL(blob);
  urlCache.set(id, url);
  return url;
}
export async function delFile(id) {
  if (!id) return;
  urlCache.delete(id);
  await idb.del('files', id);
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
    if (coll === 'docs' && r.fileId) delFile(r.fileId);
  }
  save();
}

// ---- экспорт / импорт ----
const blobToDataUrl = b => new Promise(res => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(b); });
export async function exportAll() {
  const files = {};
  for (const k of await idb.keys('files')) {
    const b = await idb.get('files', k);
    if (b) files[k] = await blobToDataUrl(b);
  }
  const s = JSON.parse(JSON.stringify(state));
  s.settings.apiKey = ''; // ключ не уходит в резервную копию
  return { app: 'lapki', exportedAt: new Date().toISOString(), state: s, files };
}
export async function importAll(data) {
  if (!data || data.app !== 'lapki' || !data.state) throw new Error('Это не резервная копия «Лапок»');
  await idb.clear('files');
  urlCache.clear();
  for (const [k, v] of Object.entries(data.files || {})) {
    const blob = await (await fetch(v)).blob();
    await idb.set('files', k, blob);
  }
  const base = emptyState();
  const apiKey = state.settings.apiKey;
  state = { ...base, ...data.state, settings: { ...base.settings, ...data.state.settings, apiKey }, records: { ...base.records, ...data.state.records } };
  save();
}
export async function wipeAll() {
  await idb.clear('files');
  urlCache.clear();
  state = emptyState();
  await idb.set('kv', 'state', state);
}
