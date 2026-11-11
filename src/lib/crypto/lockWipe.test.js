import { describe, it, expect, vi, afterEach } from 'vitest'
import { QueryClient } from '@tanstack/react-query'
import { encryptString, decryptString } from './cipher'
import { wipeOnKeyChange } from './lockWipe'

const newKey = () =>
  crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])

describe('wipeOnKeyChange', () => {
  afterEach(() => vi.restoreAllMocks())

  it('drops decrypted values and loaded lists when the key goes', async () => {
    const key = await newKey()
    const value = await encryptString('secret', key)
    const qc = new QueryClient()
    qc.setQueryData(['spaces'], [{ name: 'secret' }])
    const decrypt = vi.spyOn(crypto.subtle, 'decrypt')

    expect(wipeOnKeyChange(key, null, qc)).toBe(true)
    expect(qc.getQueryData(['spaces'])).toBeUndefined()
    await decryptString(value, key)
    expect(decrypt).toHaveBeenCalledTimes(1)
  })

  it('keeps everything on unlock or when the key stays', async () => {
    const key = await newKey()
    const qc = new QueryClient()
    qc.setQueryData(['spaces'], [])
    expect(wipeOnKeyChange(null, key, qc)).toBe(false)
    expect(wipeOnKeyChange(key, key, qc)).toBe(false)
    expect(qc.getQueryData(['spaces'])).toEqual([])
  })
})
