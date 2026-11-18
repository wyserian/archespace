import { describe, it, expect } from 'vitest'
import { errorReport, redact } from './errorReport'

describe('error report', () => {
  it('leaves out user content, secrets and where it ran', () => {
    const out = redact([
      'arc1:AbC123.xyz/+=',
      'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.sig_part',
      'me@example.com',
      '3f2b8c1e-9a4d-4c6e-8f1a-2b3c4d5e6f70',
      'Unexpected token "my secret note" and \'hunter2\'',
      'key A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q7',
      'https://host.example/assets/index-Ab12.js?token=x:10:5',
    ].join(' | '))
    for (const leak of ['arc1:', 'eyJ', 'me@example.com', '3f2b8c1e', 'secret note', 'hunter2', 'A1b2C3d4', 'host.example', 'token=x']) {
      expect(out).not.toContain(leak)
    }
    expect(out).toContain('[encrypted]')
    expect(out).toContain('index-Ab12.js')
  })

  it('keeps Firefox stack frames readable', () => {
    expect(redact('render@https://a.example/assets/index.js:1:2')).toBe('render@index.js:1:2')
  })

  it('reports the version, the page with ids hidden, and at most 12 frames', () => {
    const error = new TypeError('Cannot read "private words"')
    error.stack = ['TypeError: Cannot read "private words"', ...Array.from({ length: 20 }, (_, i) => `    at f${i} (https://x.example/a.js:${i}:1)`)].join('\n')
    const report = errorReport(error, {
      now: new Date('2026-11-18T10:00:00Z'),
      page: '/app/space/3f2b8c1e-9a4d-4c6e-8f1a-2b3c4d5e6f70',
      agent: 'TestBrowser/1.0',
    })
    expect(report).toContain('App: web ')
    expect(report).toContain('Page: /app/space/[id]')
    expect(report).toContain('Error: TypeError: Cannot read "…"')
    expect(report).not.toContain('private words')
    expect(report.split('\n').filter(l => l.startsWith('at '))).toHaveLength(12)
    expect(report).toContain('at f0 (a.js:0:1)')
  })

  it('handles something thrown that is not an Error', () => {
    expect(errorReport('boom me@example.com', { page: '/', agent: 'x' })).toContain('Error: string: boom [email]')
  })
})
