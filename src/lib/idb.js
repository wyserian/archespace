/**
 * idb.js - The IndexedDB plumbing the browser stores share: open a database,
 * and run one transaction on one of its stores.
 */

/** Open `name` at `version`; `upgrade(db)` creates the stores it needs. */
export function openIdb(name, version, upgrade) {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(name, version)
    req.onupgradeneeded = () => upgrade(req.result)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

/**
 * Run `fn(store)` in one transaction on `storeName` of the database `open()`
 * gives, then close it. Resolves once the transaction completes, with the
 * result of the request `fn` returns (undefined when it returns none).
 */
export async function withStore(open, storeName, mode, fn) {
  const db = await open()
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, mode)
      let result
      const req = fn(tx.objectStore(storeName))
      if (req) req.onsuccess = () => { result = req.result }
      tx.oncomplete = () => resolve(result)
      tx.onerror = () => reject(tx.error)
      tx.onabort = () => reject(tx.error)
    })
  } finally {
    db.close()
  }
}
