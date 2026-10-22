import { describe, it, expect, vi } from 'vitest'

// vault.js talks to Supabase; these tests only use its PIN unwrap.
vi.mock('./supabase', () => ({ supabase: {} }))

import { encryptString } from './crypto/cipher'
import { bytesToBase64 } from './crypto/encoding'
import { deriveVaultKey, newSaltDescriptor } from './crypto/keyDerivation'
import { exportRawAesKey } from './crypto/cipher'
import { isEncryptedBackup, openBackupWithKey, openBackupWithPin, sealBackup } from './backupCrypto'

const newKey = () =>
  crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt'])

/** A vault key wrapped with `pin`, as the server stores it. */
async function wrapWithPin(masterKey, pin) {
  const salt = newSaltDescriptor()
  const pinKey = await deriveVaultKey(pin, salt)
  return {
    salt,
    wrapped_key: await encryptString(bytesToBase64(await exportRawAesKey(masterKey)), pinKey),
    key_check: await encryptString('ARCHE_VAULT_V1_OK', masterKey),
  }
}

describe('encrypted backups', { timeout: 60000 }, () => {
  it('seals the contents, and opens in the same vault or with its PIN', async () => {
    const masterKey = await newKey()
    const contents = { spaces: [{ name: 'Home', items: [{ type: 'textbox', content: { text: 'bank pin' } }] }], items: [] }
    const file = await sealBackup(contents, masterKey, await wrapWithPin(masterKey, '482916'))

    expect(isEncryptedBackup(file)).toBe(true)
    expect(JSON.stringify(file)).not.toContain('bank pin')
    expect(JSON.stringify(file)).not.toContain('Home')

    // Same vault: opens with the key in hand.
    expect(await openBackupWithKey(file, masterKey)).toEqual(contents)
    // Another vault: the key doesn't fit, the PIN does.
    expect(await openBackupWithKey(file, await newKey())).toBeNull()
    await expect(openBackupWithPin(file, '000000')).rejects.toThrow('Incorrect PIN')
    expect(await openBackupWithPin(file, '482916')).toEqual(contents)
  })

  it('leaves readable backups to the normal import', () => {
    expect(isEncryptedBackup({ version: 2, spaces: [] })).toBe(false)
    expect(isEncryptedBackup([])).toBe(false)
  })
})
