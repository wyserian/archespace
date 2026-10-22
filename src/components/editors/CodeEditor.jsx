/**
 * Editor for the "code" item type (content: { code }). A transparent,
 * auto-resizing <textarea> sits over a highlight.js-rendered <pre> (language
 * auto-detected, so no picker); the highlighted markup is decorative and the
 * raw text is what gets stored, copied, and exported.
 */
import { useState, useRef, useEffect } from 'react'
import hljs from 'highlight.js/lib/common'

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

export function CodeEditor({ content, onChange, readOnly = false }) {
  const [code, setCode] = useState(content?.code || '')
  const taRef = useRef(null)

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

  const highlighted = code ? hljs.highlightAuto(code).value : ''

  return (
    <div className="relative overflow-hidden rounded-xl bg-bg-sunken text-text-primary">
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
        className="relative z-10 block w-full resize-none overflow-hidden bg-transparent caret-text-primary placeholder-text-muted focus:outline-none"
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
