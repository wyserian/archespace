/**
 * errorReport.js - The text "Copy error details" puts on the clipboard for a
 * support email. Error messages and stacks can carry user content, keys or
 * tokens, so everything that could identify the user or their data is
 * replaced (see redact), and the size is capped.
 */
import { APP_VERSION, BUILD_HASH } from './buildInfo'

const MAX_MESSAGE = 300
const MAX_FRAMES = 12
const MAX_LINE = 200

// Order matters: whole values first, then what could sit inside them.
const RULES = [
  [/arc1:[A-Za-z0-9+/=._-]+/g, '[encrypted]'],
  [/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*/g, '[token]'],
  // A URL keeps only its file name (and line:column), never its host or query.
  [/\b[a-z][a-z0-9+.-]*:\/\/[^\s)'"`]+/gi, (url) => url.split(/[?#]/)[0].split('/').pop() || '[url]'],
  // Not a Firefox stack frame ("fn@index.js:1:2").
  [/[^\s@()<>'"`]+@[^\s@()<>'"`]+\.[A-Za-z]{2,}\b(?![:/])/g, '[email]'],
  [/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, '[id]'],
  // Quoted text is usually data (a parse error quotes what it read).
  [/"[^"\n]*"|'[^'\n]*'|`[^`\n]*`/g, '"…"'],
  [/[A-Za-z0-9+/_=-]{32,}/g, '[redacted]'],
]

/** `text` with anything personal or secret replaced. */
export function redact(text) {
  return RULES.reduce((out, [pattern, to]) => out.replace(pattern, to), String(text ?? ''))
}

const cap = (text, max) => (text.length > max ? `${text.slice(0, max)}…` : text)

/** The stack's frames only (its first line repeats the message). */
function frames(stack) {
  return String(stack || '')
    .split('\n')
    .filter(line => /^\s*at\s|@/.test(line))
    .slice(0, MAX_FRAMES)
    .map(line => cap(redact(line.trim()), MAX_LINE))
}

/** A plain-text report of `error`, safe to paste into an email. */
export function errorReport(error, { now = new Date(), page = globalThis.location?.pathname, agent = globalThis.navigator?.userAgent } = {}) {
  const name = error instanceof Error ? error.name : typeof error
  const message = error instanceof Error ? error.message : error
  const stack = frames(error instanceof Error ? error.stack : '')
  return [
    'ArcheSpace error report',
    `App: web ${APP_VERSION} (${BUILD_HASH})`,
    `Time: ${now.toISOString()}`,
    `Browser: ${cap(redact(agent || 'unknown'), MAX_LINE)}`,
    `Page: ${cap(redact(page || '/'), MAX_LINE)}`,
    `Error: ${cap(redact(name), 60)}: ${cap(redact(message), MAX_MESSAGE)}`,
    ...(stack.length ? ['Stack:', ...stack] : []),
  ].join('\n')
}
