// Imported model files live in IndexedDB (they can be many MB).
// Per-character distance records live in localStorage.

const DB_NAME = 'crossy-custom';
const STORE = 'models';
const RECORDS_KEY = 'crossy.records.v1';
const SELECTED_KEY = 'crossy.selected.v1';

let dbPromise = null;

function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE, { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx(mode, fn) {
  return openDB().then(
    (db) =>
      new Promise((resolve, reject) => {
        const t = db.transaction(STORE, mode);
        const store = t.objectStore(STORE);
        const req = fn(store);
        t.oncomplete = () => resolve(req ? req.result : undefined);
        t.onerror = () => reject(t.error);
        t.onabort = () => reject(t.error);
      })
  );
}

/** Returns all stored model entries, without their (large) file data. */
export async function listModels() {
  try {
    const all = await tx('readonly', (s) => s.getAll());
    return all
      .map(({ data, ...meta }) => meta)
      .sort((a, b) => a.createdAt - b.createdAt);
  } catch (err) {
    console.warn('IndexedDB unavailable', err);
    return [];
  }
}

export function getModel(id) {
  return tx('readonly', (s) => s.get(id));
}

export function putModel(entry) {
  return tx('readwrite', (s) => s.put(entry));
}

export async function updateModelMeta(id, patch) {
  const entry = await getModel(id);
  if (!entry) return;
  await putModel({ ...entry, ...patch });
}

export function deleteModel(id) {
  return tx('readwrite', (s) => s.delete(id));
}

function readJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function writeJSON(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage blocked: records just won't persist */
  }
}

export function getRecords() {
  return readJSON(RECORDS_KEY, {});
}

export function getRecord(charId) {
  return getRecords()[charId] || { best: 0, runs: 0, total: 0 };
}

/** Saves a finished run. Returns { record, isNewBest }. */
export function saveRun(charId, distance) {
  const records = getRecords();
  const prev = records[charId] || { best: 0, runs: 0, total: 0 };
  const isNewBest = distance > prev.best;
  const record = {
    best: Math.max(prev.best, distance),
    runs: prev.runs + 1,
    total: (prev.total || 0) + distance,
    lastPlayed: Date.now(),
  };
  records[charId] = record;
  writeJSON(RECORDS_KEY, records);
  return { record, isNewBest };
}

export function clearRecord(charId) {
  const records = getRecords();
  delete records[charId];
  writeJSON(RECORDS_KEY, records);
}

export function getSelected() {
  return readJSON(SELECTED_KEY, 'chicken');
}

export function setSelected(id) {
  writeJSON(SELECTED_KEY, id);
}
