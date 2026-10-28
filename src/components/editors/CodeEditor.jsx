/**
 * Editor for the "code" item type (content: { code }). A transparent,
 * auto-resizing <textarea> sits over a highlight.js-rendered <pre> (language
 * auto-detected, so no picker); the highlighted markup is decorative and the
 * raw text is what gets stored, copied, and exported.
 */
import { useState, useRef, useEffect, useMemo } from 'react'

const CODE_FONT =
  'ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace'

// Shared metrics so the textarea and the <pre> lay out character-for-character
// identically (any drift misaligns the caret from the highlighted text).
const METRICS = {
  margin: 0,
  padding: 14,
  border: 0,
  fontFamily: CODE_FONT,
  fontSize: 13,
  lineHeight: 1.6,
  whiteSpace: 'pre-wrap',
  overflowWrap: 'break-word',
  wordBreak: 'break-word',
  tabSize: 2,
  boxSizing: 'border-box',
}

// highlight.js and its languages load the first time a Code item shows, once
// for the whole app, rather than with every page; until then the code shows
// plain, in the same layout.
let hljsLib = null
let hljsLoading = null
function loadHljs() {
  hljsLoading ??= import('highlight.js/lib/common').then(m => (hljsLib = m.default))
  return hljsLoading
}

const escapeHtml = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

export function CodeEditor({ content, onChange, readOnly = false, fill = false }) {
  const [code, setCode] = useState(content?.code || '')
  const [hljs, setHljs] = useState(() => hljsLib)
  const taRef = useRef(null)

  useEffect(() => {
    if (hljs) return undefined
    let live = true
    loadHljs().then(lib => { if (live) setHljs(() => lib) }).catch(() => {})
    return () => { live = false }
  }, [hljs])

  // Grow the textarea to fit its content; the <pre> (absolute) follows.
  const resize = () => {
    const el = taRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }
  useEffect(() => { resize() }, [code])

  const update = (next) => {
    setCode(next)
    onChange({ code: next })
  }

  const handleKeyDown = (e) => {
    if (e.key !== 'Tab') return
    e.preventDefault()
    const el = e.target
    const start = el.selectionStart
    const end = el.selectionEnd
    const next = `${code.slice(0, start)}  ${code.slice(end)}`
    update(next)
    requestAnimationFrame(() => {
      el.selectionStart = el.selectionEnd = start + 2
    })
  }

  // Auto-detection tries every language, so it runs only when the code (or
  // the highlighter's arrival) changes, not on every render of the card.
  const highlighted = useMemo(
    () => (!code ? '' : hljs ? hljs.highlightAuto(code).value : escapeHtml(code)),
    [code, hljs],
  )

  return (
    <div className={`relative overflow-hidden rounded-xl border border-bg-border-faint bg-bg-sunken text-text-primary ${fill ? 'flex min-h-full flex-col' : ''}`}>
      <pre
        aria-hidden="true"
        className="hljs pointer-events-none absolute inset-0"
        style={{ ...METRICS, background: 'transparent', color: 'inherit' }}
      >
        <code dangerouslySetInnerHTML={{ __html: highlighted }} />
      </pre>
      <textarea
        ref={taRef}
        value={code}
        onChange={e => update(e.target.value)}
        onKeyDown={readOnly ? undefined : handleKeyDown}
        readOnly={readOnly}
        rows={3}
        spellCheck={false}
        placeholder={readOnly ? 'Empty' : 'Paste or write code...'}
        className={`relative z-10 block w-full resize-none overflow-hidden bg-transparent caret-text-primary placeholder-text-muted focus:outline-none ${fill ? 'grow' : ''}`}
        style={{
          ...METRICS,
          minHeight: 96,
          // Only hide the textarea's own text once there is highlighted text
          // behind it, so the placeholder stays visible while empty.
          color: code ? 'transparent' : 'inherit',
          WebkitTextFillColor: code ? 'transparent' : undefined,
        }}
      />
    </div>
  )
}
