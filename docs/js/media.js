// media.js — pictures the agent draws, kept in this browser (IndexedDB) so chats stay light.

const DB = 'toonlight-media', STORE = 'images';
function open() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function tx(mode, fn) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const req = fn(t.objectStore(STORE));
    t.oncomplete = () => resolve(req.result);
    t.onerror = () => reject(t.error);
  });
}
export const saveImage = (id, dataUrl) => tx('readwrite', (s) => s.put(dataUrl, id)).catch(() => {});
export const getImage = (id) => tx('readonly', (s) => s.get(id)).catch(() => null);
