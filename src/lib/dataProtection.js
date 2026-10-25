/**
 * dataProtection.js - Encrypt/decrypt spaces & items for storage.
 *
 * Sensitive fields are encrypted client-side before Supabase.
 * Only ciphertext is stored server-side; decryption requires the user's vault key.
 */
import { encryptString, decryptString, encryptJson, decryptJson } from './crypto/cipher'
import { parseTags } from './spaceColors'
import { normalizeReminder } from './reminder'

const LOCKED_MESSAGE = 'Vault is locked - enter your PIN to view this data.'

// Tags left at the column default (an empty array) were never encrypted.
async function decryptTags(tags, key) {
  return parseTags(typeof tags === 'string' ? await decryptJson(tags, key) : tags)
}

/** Encrypt an item's reminder (see reminder.js); null clears it. */
export async function encryptReminder(reminder, key) {
  const value = normalizeReminder(reminder)
  if (!value) return null
  return key ? encryptJson(value, key) : value
}

/** An item's reminder, or null when it has none. */
export async function decryptReminder(reminder, key) {
  if (reminder == null) return null
  return normalizeReminder(typeof reminder === 'string' ? await decryptJson(reminder, key) : reminder)
}

// Spaces

export async function encryptSpace(row, key) {
  if (!key || !row) return row
  const tags = parseTags(row.tags)
  return {
    ...row,
    name: await encryptString(row.name ?? '', key),
    description: await encryptString(row.description ?? '', key),
    tags: await encryptJson(tags, key),
  }
}

export async function decryptSpace(row, key) {
  if (!row) return row
  if (!key) throw new Error(LOCKED_MESSAGE)
  return {
    ...row,
    name: await decryptString(row.name, key),
    description: await decryptString(row.description, key),
    tags: await decryptTags(row.tags, key),
  }
}

export async function decryptSpaces(rows, key) {
  if (!rows?.length) return []
  // Without a key, let decryptSpace throw the "vault locked" signal.
  if (!key) return Promise.all(rows.map(r => decryptSpace(r, key)))
  // With a key, a single row that can't be decrypted (e.g. left over from a
  // previous vault key) must not blank the whole list - skip it instead.
  const results = await Promise.all(rows.map(async r => {
    try {
      return await decryptSpace(r, key)
    } catch (err) {
      console.warn('Skipping undecryptable space', r?.id, err)
      return null
    }
  }))
  return results.filter(Boolean)
}

// Space items

/** Encrypt just an item's or a space's tags (for a tags-only update). */
export async function encryptTags(tags, key) {
  const parsed = parseTags(tags)
  return key ? encryptJson(parsed, key) : parsed
}

export async function encryptItem(row, key) {
  if (!key || !row) return row
  return {
    ...row,
    title: await encryptString(row.title ?? '', key),
    content: await encryptJson(row.content ?? {}, key),
    tags: await encryptJson(parseTags(row.tags), key),
  }
}

export async function decryptItem(row, key) {
  if (!row) return row
  if (!key) throw new Error(LOCKED_MESSAGE)
  const content = typeof row.content === 'string' ? await decryptJson(row.content, key) : row.content
  return {
    ...row,
    title: await decryptString(row.title, key),
    content: content ?? {},
    tags: await decryptTags(row.tags, key),
    reminder: await decryptReminder(row.reminder, key),
  }
}

export async function decryptItems(rows, key) {
  if (!rows?.length) return []
  // Without a key, let decryptItem throw the "vault locked" signal.
  if (!key) return Promise.all(rows.map(r => decryptItem(r, key)))
  // With a key, skip any row that can't be decrypted rather than failing the
  // whole list (or a whole export).
  const results = await Promise.all(rows.map(async r => {
    try {
      return await decryptItem(r, key)
    } catch (err) {
      console.warn('Skipping undecryptable item', r?.id, err)
      return null
    }
  }))
  return results.filter(Boolean)
}

