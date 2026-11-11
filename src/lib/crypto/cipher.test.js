import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { encryptString, decryptString, clearDecryptCache } from './cipher'

const newKey = () =>
  crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])

describe('decrypt cache', () => {
  let decrypt
  beforeEach(() => {
    clearDecryptCache()
    decrypt = vi.spyOn(crypto.subtle, 'decrypt')
  })
  afterEach(() => decrypt.mockRestore())

  it('needs no decryption for a value it just encrypted', async () => {
    const key = await newKey()
    const value = await encryptString('hello', key)
    expect(await decryptString(value, key)).toBe('hello')
    expect(decrypt).not.toHaveBeenCalled()
  })

  it('decrypts each value once, until cleared', async () => {
    const key = await newKey()
    const value = await encryptString('hello', key)
    clearDecryptCache()
    expect(await decryptString(value, key)).toBe('hello')
    expect(await decryptString(value, key)).toBe('hello')
    expect(decrypt).toHaveBeenCalledTimes(1)
    clearDecryptCache()
    expect(await decryptString(value, key)).toBe('hello')
    expect(decrypt).toHaveBeenCalledTimes(2)
  })

  it('keeps nothing from a decryption that finishes after a clear', async () => {
    const key = await newKey()
    const value = await encryptString('hello', key)
    clearDecryptCache()
    const running = decryptString(value, key)
    clearDecryptCache() // the vault locks mid-decryption
    expect(await running).toBe('hello')
    await decryptString(value, key)
    expect(decrypt).toHaveBeenCalledTimes(2)
  })

  it('never answers for another key', async () => {
    const value = await encryptString('hello', await newKey())
    await expect(decryptString(value, await newKey())).rejects.toThrow()
  })
})
