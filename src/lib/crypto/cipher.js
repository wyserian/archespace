/**
 * cipher.js - AES-256-GCM encrypt/decrypt via Web Crypto API.
 */
import { bytesFromBase64, bytesToBase64 } from './encoding'

const CIPHER_PREFIX = 'arc1:'

// Decrypted text by ciphertext, kept in memory while unlocked. Every
// ciphertext has its own random IV, so an entry can never go stale: lists,
// search and refetches only decrypt values they haven't seen. An entry holds
// the key it was decrypted with and only answers for that key. Least recently
// used entries go first past the cap (in characters, ciphertext plus text).
const DECRYPT_CACHE_MAX_CHARS = 16 * 1024 * 1024
const decryptCache = new Map()
let cachedChars = 0
// Bumped on every clear, so work started before a lock can't refill the cache.
let generation = 0

function cached(key, ciphertext) {
  const entry = decryptCache.get(ciphertext)
  if (entry?.key !== key) return undefined
  decryptCache.delete(ciphertext)
  decryptCache.set(ciphertext, entry)
  return entry.text
}

function remember(key, ciphertext, text, startedIn) {
  if (startedIn !== generation) return
  const size = ciphertext.length + text.length
  if (size > DECRYPT_CACHE_MAX_CHARS || decryptCache.has(ciphertext)) return
  decryptCache.set(ciphertext, { key, text })
  cachedChars += size
  for (const [oldest, { text: oldText }] of decryptCache) {
    if (cachedChars <= DECRYPT_CACHE_MAX_CHARS) break
    decryptCache.delete(oldest)
    cachedChars -= oldest.length + oldText.length
  }
}

/** Forget every decrypted value (the vault locked or the user signed out). */
export function clearDecryptCache() {
  decryptCache.clear()
  cachedChars = 0
  generation += 1
}

function isEncrypted(value) {
  return typeof value === 'string' && value.startsWith(CIPHER_PREFIX)
}

/** A vault master key from its raw bytes (exportable, to wrap it again). */
export async function importRawAesKey(rawBytes) {
  return crypto.subtle.importKey('raw', rawBytes, { name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt'])
}

export async function exportRawAesKey(key) {
  return new Uint8Array(await crypto.subtle.exportKey('raw', key))
}

/**
 * @param {string} plaintext
 * @param {CryptoKey} key
 * @returns {Promise<string>}
 */
export async function encryptString(plaintext, key) {
  if (plaintext == null) return ''
  const text = String(plaintext)
  const startedIn = generation
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const encoded = new TextEncoder().encode(text)
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encoded
  )
  const value = `${CIPHER_PREFIX}${bytesToBase64(iv)}.${bytesToBase64(ciphertext)}`
  // A saved value comes straight back from the server; no need to decrypt it.
  remember(key, value, text, startedIn)
  return value
}

/**
 * @param {string} value
 * @param {CryptoKey} key
 * @returns {Promise<string>}
 */
export async function decryptString(value, key) {
  if (value == null || value === '') return ''
  if (!isEncrypted(value)) throw new Error('Not an encrypted value')
  const hit = cached(key, value)
  if (hit !== undefined) return hit
  const startedIn = generation
  const body = value.slice(CIPHER_PREFIX.length)
  const dot = body.indexOf('.')
  if (dot < 0) throw new Error('Invalid encrypted payload')
  const iv = bytesFromBase64(body.slice(0, dot))
  const ct = bytesFromBase64(body.slice(dot + 1))
  const plainBuffer = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    ct
  )
  const text = new TextDecoder().decode(plainBuffer)
  remember(key, value, text, startedIn)
  return text
}

/**
 * @param {unknown} data
 * @param {CryptoKey} key
 */
export async function encryptJson(data, key) {
  return encryptString(JSON.stringify(data ?? null), key)
}

/**
 * @param {string} value
 * @param {CryptoKey} key
 */
export async function decryptJson(value, key) {
  const text = await decryptString(value, key)
  if (!text) return null
  return JSON.parse(text)
}
