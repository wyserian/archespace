/**
 * cipher.js - AES-256-GCM encrypt/decrypt via Web Crypto API.
 */
import { bytesFromBase64, bytesToBase64 } from './encoding'

const CIPHER_PREFIX = 'arc1:'

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
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const encoded = new TextEncoder().encode(text)
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encoded
  )
  return `${CIPHER_PREFIX}${bytesToBase64(iv)}.${bytesToBase64(ciphertext)}`
}

/**
 * @param {string} value
 * @param {CryptoKey} key
 * @returns {Promise<string>}
 */
export async function decryptString(value, key) {
  if (value == null || value === '') return ''
  if (!isEncrypted(value)) throw new Error('Not an encrypted value')
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
  return new TextDecoder().decode(plainBuffer)
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
