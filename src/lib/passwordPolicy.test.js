import { describe, it, expect } from 'vitest'
import { validatePassword } from './passwordPolicy'

describe('validatePassword', () => {
  it('accepts a password that meets every rule', () => {
    expect(validatePassword('Abcdef1!')).toBeNull()
  })

  it('names only what is missing, in one sentence', () => {
    expect(validatePassword('abcdefgh1!')).toBe('Password needs an uppercase letter.')
    expect(validatePassword('Abcdefgh')).toBe('Password needs a number and a symbol.')
    expect(validatePassword('ab')).toBe(
      'Password needs at least 8 characters, an uppercase letter, a number and a symbol.'
    )
  })

  it('counts any ASCII punctuation as a symbol', () => {
    for (const symbol of ['!', '@', '#', '-', '_', '.', '~', '[', '\\']) {
      expect(validatePassword(`Abcdefg1${symbol}`)).toBeNull()
    }
    expect(validatePassword('Abcdefg1 ')).toBe('Password needs a symbol.')
  })
})
