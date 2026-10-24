// Recorded sounds for the Sample engine, kept in IndexedDB so they survive a restart.
const DB = 'leaffall', STORE = 'samples';

function open() {
  return new Promise((resolve, reject) => {
    let req;
    try { req = indexedDB.open(DB, 1); } catch (e) { reject(e); return; }
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx(mode, fn) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const out = fn(t.objectStore(STORE));
    t.oncomplete = () => { db.close(); resolve(out && 'result' in out ? out.result : undefined); };
    t.onerror = () => { db.close(); reject(t.error); };
  });
}

export async function putSample(key, sample) {
  try { await tx('readwrite', (s) => s.put({ name: sample.name, rate: sample.rate, data: sample.data }, key)); return true; } catch (e) { return false; }
}

export async function getSample(key) {
  try { return (await tx('readonly', (s) => s.get(key))) || null; } catch (e) { return null; }
}

export async function deleteSample(key) {
  try { await tx('readwrite', (s) => s.delete(key)); } catch (e) { /* storage unavailable */ }
}

export function newKey() { return 's' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
