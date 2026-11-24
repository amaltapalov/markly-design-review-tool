// Minimal IndexedDB key-value store: one "sessions" store for ledgers, one "blobs" store for media.
// Runs wherever IndexedDB exists (page, extension service worker).

const DB_NAME = 'markly';
const DB_VERSION = 1;
/** @typedef {'sessions' | 'blobs'} StoreName */

/** @type {Promise<IDBDatabase> | null} */
let dbPromise = null;

/** @returns {Promise<IDBDatabase>} */
function open() {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('sessions')) db.createObjectStore('sessions');
      if (!db.objectStoreNames.contains('blobs')) db.createObjectStore('blobs');
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => {
      dbPromise = null;
      reject(req.error);
    };
  });
  return dbPromise;
}

/**
 * @template T
 * @param {StoreName} store
 * @param {IDBTransactionMode} mode
 * @param {(s: IDBObjectStore) => IDBRequest<T>} fn
 * @returns {Promise<T>}
 */
async function run(store, mode, fn) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, mode);
    const req = fn(tx.objectStore(store));
    // Resolve on commit, not on request success, so a quota failure is reported as a failure.
    tx.oncomplete = () => resolve(req.result);
    tx.onerror = () => reject(tx.error ?? req.error);
    tx.onabort = () => reject(tx.error ?? new Error('Storage transaction aborted'));
  });
}

/** @param {StoreName} store @param {string} key @returns {Promise<any>} */
export const idbGet = (store, key) => run(store, 'readonly', (s) => s.get(key));
/** @param {StoreName} store @param {string} key @param {unknown} value */
export const idbPut = (store, key, value) => run(store, 'readwrite', (s) => s.put(value, key));
/** @param {StoreName} store @param {string} key */
export const idbDelete = (store, key) => run(store, 'readwrite', (s) => s.delete(key));
