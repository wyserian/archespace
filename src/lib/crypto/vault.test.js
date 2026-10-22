import { describe, it, expect, vi } from 'vitest'

const { meta } = vi.hoisted(() => ({ meta: { current: null } }))
vi.mock('../supabase', () => {
  const query = {
    select: () => query,
    eq: () => query,
    maybeSingle: async () => ({ data: meta.current, error: null }),
  }
  return { supabase: { from: () => query } }
})

const { isCurrentVaultKey } = await import('./vault')
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
