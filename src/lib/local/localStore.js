/**
 * localStore.js - Local mode's tables, kept in this browser's IndexedDB.
 *
 * Each table is loaded into memory once and written through on every change,
 * so queries are plain array work. Rows hold the same (encrypted) values the
 * server would.
 */
import { openIdb } from '../idb'

const DB_NAME = 'archespace-local'
const DB_VERSION = 1

/** The tables and their primary keys. */
export const TABLES = {
  spaces: 'id',
  space_items: 'id',
  user_encryption: 'user_id',
  user_settings: 'user_id',
}

function openDb() {
  return openIdb(DB_NAME, DB_VERSION, (db) => {
    for (const [table, keyPath] of Object.entries(TABLES)) {
      if (!db.objectStoreNames.contains(table)) db.createObjectStore(table, { keyPath })
    }
  })
}

const done = (tx) => new Promise((resolve, reject) => {
  tx.oncomplete = () => resolve()
  tx.onerror = () => reject(tx.error)
  tx.onabort = () => reject(tx.error)
})

/**
 * An IndexedDB-backed store: `tables[name]` is a Map of key -> row, and
 * `save` / `remove` write changes through.
 */
export async function openIndexedDbStore() {
  const db = await openDb()
  const tables = {}
  for (const table of Object.keys(TABLES)) {
    const tx = db.transaction(table, 'readonly')
    const rows = await new Promise((resolve, reject) => {
      const req = tx.objectStore(table).getAll()
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
    tables[table] = new Map(rows.map(row => [row[TABLES[table]], row]))
  }
  return {
    tables,
    async save(table, rows) {
      const tx = db.transaction(table, 'readwrite')
      for (const row of rows) tx.objectStore(table).put(row)
      await done(tx)
    },
    async remove(table, keys) {
      const tx = db.transaction(table, 'readwrite')
      for (const key of keys) tx.objectStore(table).delete(key)
      await done(tx)
    },
  }
}

/** A store that lives only in memory (tests). */
export function openMemoryStore() {
  const tables = Object.fromEntries(Object.keys(TABLES).map(t => [t, new Map()]))
  return { tables, async save() {}, async remove() {} }
}

/** Delete everything local mode has stored in this browser. */
export function eraseLocalData() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.deleteDatabase(DB_NAME)
    req.onsuccess = () => resolve()
    req.onerror = () => reject(req.error)
    // Another tab has it open; it's deleted once that tab closes.
    req.onblocked = () => resolve()
  })
}
