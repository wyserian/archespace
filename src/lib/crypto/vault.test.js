// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'

// meta.current: the vault row the server holds; upserts are merged into it.
const { meta } = vi.hoisted(() => ({ meta: { current: null } }))
vi.mock('../supabase', () => {
  const query = {
    select: () => query,
    eq: () => query,
    maybeSingle: async () => ({ data: meta.current, error: null }),
    upsert: async (row) => { meta.current = { ...meta.current, ...row }; return { error: null } },
  }
  return {
    supabase: {
      from: () => query,
      rpc: async () => ({ data: { locked: false }, error: null }),
    },
  }
})

const { isCurrentVaultKey, setupUserVault, changeVaultPinWithVerification } = await import('./vault')
const { encryptString } = await import('./cipher')

const newKey = () =>
  crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt'])

describe('isCurrentVaultKey', () => {
  it("accepts the vault's key and rejects one from an earlier vault", async () => {
    const current = await newKey()
    const earlier = await newKey()
    meta.current = { key_check: await encryptString('ARCHE_VAULT_V1_OK', current) }
    expect(await isCurrentVaultKey('user', current)).toBe(true)
    expect(await isCurrentVaultKey('user', earlier)).toBe(false)
  })
})

describe('offline vault copy', () => {
  it('keeps the recovery code usable offline after a PIN change', async () => {
    meta.current = null
    await setupUserVault('user', 'first-pin-123')
    await changeVaultPinWithVerification('user', 'first-pin-123', 'second-pin-456')
    const cached = JSON.parse(localStorage.getItem('arche:vault-meta:user'))
    expect(cached.salt).toBe(meta.current.salt) // the new PIN's
    expect(cached.recovery_wrapped_key).toBe(meta.current.recovery_wrapped_key)
    expect(cached.recovery_wrapped_key).toBeTruthy()
  }, 30000)
})
