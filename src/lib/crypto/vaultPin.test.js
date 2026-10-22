import { describe, it, expect } from 'vitest'
import { validateVaultPin, getWeakPinWarning } from './vaultPin'

describe('validateVaultPin', () => {
  it('rejects too short', () => expect(validateVaultPin('12345')).toBeTruthy())
  it('accepts a 6-char PIN', () => expect(validateVaultPin('123456')).toBeNull())
  it('accepts an alphanumeric passphrase', () => expect(validateVaultPin('correct horse')).toBeNull())
  it('rejects over max length', () => expect(validateVaultPin('a'.repeat(65))).toBeTruthy())
})

describe('getWeakPinWarning', () => {
  it('warns on a short numeric PIN', () => expect(getWeakPinWarning('123456')).toBeTruthy())
  it('leaves too-short values to validation', () => expect(getWeakPinWarning('ab12')).toBeNull())
  it('does not warn on a strong passphrase', () => expect(getWeakPinWarning('correct horse battery')).toBeNull())
  it('does not warn on an 8+ digit PIN', () => expect(getWeakPinWarning('12345678')).toBeNull())
})
