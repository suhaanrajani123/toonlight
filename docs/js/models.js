// models.js — your own 3D model files (.vrm from VRoid Studio, or .glb), one per character,
// saved in this browser (IndexedDB) so they come back every time you visit.
// To make a model show up for EVERYONE who visits the site, put it in docs/models/ and add
// `model: 'models/name.vrm'` in roster.js instead (see README).

const DB = 'toonlight', STORE = 'models';

function open() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// Run one request in a transaction and resolve with its result (undefined if nothing found).
async function tx(mode, fn) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const req = fn(t.objectStore(STORE));
    t.oncomplete = () => resolve(req.result);
    t.onerror = () => reject(t.error);
  });
}

export async function saveModel(id, file) {
  return tx('readwrite', (s) => s.put({ name: file.name, blob: file }, id));
}

export async function getModel(id) {
  try {
    const rec = await tx('readonly', (s) => s.get(id));
    return rec && rec.blob ? rec : null;
  } catch {
    return null;
  }
}

export async function removeModel(id) {
  return tx('readwrite', (s) => s.delete(id));
}
