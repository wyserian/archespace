import { describe, it, expect } from 'vitest'
import { viewModeKey, viewModeOrDefault } from './useViewMode'

describe('view mode', () => {
  it('starts in list on a small screen and in grid on a larger one', () => {
    expect(viewModeOrDefault(null, true)).toBe('list')
    expect(viewModeOrDefault(null, false)).toBe('grid')
    expect(viewModeOrDefault('nonsense', true)).toBe('list')
  })

  it('keeps what you picked, separately per screen size', () => {
    expect(viewModeOrDefault('grid', true)).toBe('grid')
    expect(viewModeOrDefault('list', false)).toBe('list')
    expect(viewModeKey('arche:items-view', true)).toBe('arche:items-view:small')
    expect(viewModeKey('arche:items-view', false)).toBe('arche:items-view')
  })
})
