/**
 * RichTextEditor - the Rich text item's editor (Tiptap), and its toolbar.
 *
 * Content is stored as Tiptap JSON (`{ doc }`); older items (`{ html }`, or
 * the old Markdown type) are converted when the editor loads them. The same
 * configuration powers the mobile app's editor (lib/richText/extensions.js).
 *
 * The toolbar is rendered separately (RichTextToolbar) so SpaceItem can place
 * it as a bar across the top of the item; it reads the editor instance handed
 * up via `onEditor`.
 * Loaded lazily: the editor only downloads when a Rich text item is shown.
 */
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useEditor, useEditorState, EditorContent } from '@tiptap/react'
import {
  Undo2, Redo2, Heading, Heading1, Heading2, Heading3, Heading4, Pilcrow, ChevronDown,
  List, ListOrdered, ListChecks, TextQuote, SquareCode, Bold, Italic,
  Strikethrough, Code, Underline, Highlighter, Link2, Unlink, Superscript,
  Subscript, AlignLeft, AlignCenter, AlignRight, AlignJustify, Table, Minus,
  BetweenHorizontalEnd, BetweenVerticalEnd, Rows3, Columns3, Trash2, Check, X,
  Search, ChevronUp, CornerDownLeft, CaseSensitive, WholeWord, Regex, UnfoldVertical,
} from 'lucide-react'
import { richTextExtensions } from '../../lib/richText/extensions'
import { toRichDoc } from '../../lib/richText/convert'
import { registerSearchOpener } from '../../lib/richText/searchReplace'
import { LINE_HEIGHTS } from '../../lib/richText/lineHeight'
import { buttonClass } from '../ui/buttonStyles'
import { MENU_PANEL, menuItemClass } from '../ui/menuStyles'

// Plain text that reads like markdown is pasted as formatting.
const MARKDOWN_HINT = /(^|\n)\s{0,3}(#{1,6}\s|[-*+]\s|\d+\.\s|>\s|```|- \[[ xX]\]\s)|\*\*[^*\n]+\*\*|\[[^\]\n]+\]\([^)\n]+\)/

/**
 * @param {{ type?: string, content: object, onChange: Function, readOnly?: boolean, onEditor?: Function, fill?: boolean }} props
 *   `fill` (full screen): the text box takes at least the whole height.
 */
export default function RichTextEditor({ type = 'richtext', content, onChange, readOnly = false, onEditor, fill = false }) {
  const onChangeRef = useRef(onChange)
  useEffect(() => { onChangeRef.current = onChange })
  const editorRef = useRef(null)

  // Built once: useEditor compares its options on every render and reconfigures
  // the editor when they differ (new extension instances always do).
  const [options] = useState(() => ({
    extensions: richTextExtensions(),
    // Initial content only: SpaceItem remounts the editor (via its key) when
    // the item changes elsewhere, so it never fights the cursor.
    content: toRichDoc(type, content),
    editable: !readOnly,
    immediatelyRender: true,
    shouldRerenderOnTransaction: false,
    editorProps: {
      attributes: {
        class: 'rich-text-editor prose-custom w-full bg-bg-sunken border border-bg-border-faint rounded-xl px-4 py-3 text-sm text-text-content leading-normal min-h-[80px] focus:outline-none break-words',
        'aria-label': 'Rich text content',
      },
      handlePaste: (_view, event) => {
        const data = event.clipboardData
        const text = data?.getData('text/plain') || ''
        if (data?.getData('text/html') || !MARKDOWN_HINT.test(text)) return false
        editorRef.current?.commands.insertContent(text, { contentType: 'markdown' })
        return true
      },
    },
    onUpdate: ({ editor: e }) => onChangeRef.current?.({ doc: e.getJSON() }),
  }))
  const editor = useEditor(options, [])

  useEffect(() => {
    editorRef.current = editor
    onEditor?.(editor)
    return () => onEditor?.(null)
  }, [editor, onEditor])

  useEffect(() => {
    // emitUpdate false: toggling editability isn't an edit (the default would
    // fire onUpdate and mark the item unsaved just by opening it).
    if (editor && editor.isEditable === readOnly) editor.setEditable(!readOnly, false)
  }, [editor, readOnly])

  return <EditorContent editor={editor} className={fill ? 'flex min-h-full flex-col [&>.ProseMirror]:grow' : undefined} />
}

/**
 * Formatting toolbar for a Rich text editor: a full-width bar across the top
 * of the item, grouped like a document editor - history | blocks | inline
 * formatting | super/subscript | alignment | table | find and replace. One
 * centred row: on a narrow card it scrolls sideways (its menus float above the
 * page, so the scrolling row never clips them). Buttons keep the editor's
 * selection (mousedown is prevented).
 *
 * @param {{ editor: import('@tiptap/core').Editor | null }} props
 */
export function RichTextToolbar({ editor }) {
  // Mount the controls only once there's an editor: useEditorState reads the
  // instance it starts with, and wouldn't pick up a late one until the next
  // edit (leaving the toolbar empty).
  return editor ? <ToolbarControls key={editor.instanceId} editor={editor} /> : null
}

const HEADING_ICONS = { 1: Heading1, 2: Heading2, 3: Heading3, 4: Heading4 }
const ALIGNMENTS = [
  { value: 'left', label: 'Align left', icon: AlignLeft },
  { value: 'center', label: 'Align centre', icon: AlignCenter },
  { value: 'right', label: 'Align right', icon: AlignRight },
  { value: 'justify', label: 'Justify', icon: AlignJustify },
]

function ToolbarControls({ editor }) {
  const state = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      canUndo: e.can().undo(),
      canRedo: e.can().redo(),
      heading: [1, 2, 3, 4].find(level => e.isActive('heading', { level })) || 0,
      bulletList: e.isActive('bulletList'),
      orderedList: e.isActive('orderedList'),
      taskList: e.isActive('taskList'),
      blockquote: e.isActive('blockquote'),
      codeBlock: e.isActive('codeBlock'),
      bold: e.isActive('bold'),
      italic: e.isActive('italic'),
      strike: e.isActive('strike'),
      code: e.isActive('code'),
      underline: e.isActive('underline'),
      highlight: e.isActive('highlight'),
      link: e.isActive('link'),
      linkHref: e.getAttributes('link').href || '',
      superscript: e.isActive('superscript'),
      subscript: e.isActive('subscript'),
      align: ALIGNMENTS.find(a => e.isActive({ textAlign: a.value }))?.value || 'left',
      lineHeight: e.getAttributes('paragraph').lineHeight || e.getAttributes('heading').lineHeight || null,
      table: e.isActive('table'),
      matchCount: e.storage.searchReplace?.results.length ?? 0,
      matchIndex: e.storage.searchReplace?.index ?? 0,
      searchInvalid: !!e.storage.searchReplace?.invalid,
    }),
  })
  const [linkOpen, setLinkOpen] = useState(false)
  const [linkValue, setLinkValue] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const searchBtnRef = useRef(null)

  // Ctrl/Cmd+F in the note opens the search panel (searchReplace.js).
  useEffect(() => registerSearchOpener(editor, () => setSearchOpen(true)), [editor])

  const closeSearch = () => {
    setSearchOpen(false)
    editor.commands.setSearch({ term: '' }) // clear the highlights
    editor.commands.focus()
  }
  const searchPanel = searchOpen && (
    <SearchPanel
      editor={editor}
      anchorRef={searchBtnRef}
      count={state.matchCount}
      index={state.matchIndex}
      invalid={state.searchInvalid}
      onClose={closeSearch}
    />
  )

  const run = (fn) => fn(editor.chain().focus()).run()

  const openLink = () => {
    setLinkValue(state.linkHref || 'https://')
    setLinkOpen(true)
  }
  const applyLink = (e) => {
    e.preventDefault()
    const href = linkValue.trim()
    run(c => {
      const chain = c.extendMarkRange('link')
      return href && href !== 'https://' ? chain.setLink({ href }) : chain.unsetLink()
    })
    setLinkOpen(false)
  }

  if (linkOpen) {
    return (
      <form onSubmit={applyLink} className="mx-auto flex max-w-xl flex-wrap items-center gap-1">
        <Link2 size={15} className="mx-1 text-text-muted" />
        <input
          autoFocus
          type="url"
          value={linkValue}
          onChange={e => setLinkValue(e.target.value)}
          onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); setLinkOpen(false) } }}
          placeholder="https://"
          aria-label="Link address"
          className="min-w-0 flex-1 rounded-lg border border-bg-border bg-bg-elevated px-2.5 py-1.5 text-sm text-text-primary focus:border-accent focus:outline-none"
        />
        <ToolbarBtn icon={Check} label="Apply link" onClick={applyLink} />
        {state.link && (
          <ToolbarBtn icon={Unlink} label="Remove link" onClick={() => { run(c => c.extendMarkRange('link').unsetLink()); setLinkOpen(false) }} />
        )}
        <ToolbarBtn icon={X} label="Cancel" onClick={() => setLinkOpen(false)} />
      </form>
    )
  }

  const AlignIcon = ALIGNMENTS.find(a => a.value === state.align)?.icon || AlignLeft

  return (
    <>
    <div className="overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
    {/* w-max + mx-auto: centred when it fits, scrolls from the start when not. */}
    <div role="toolbar" aria-label="Formatting" className="mx-auto flex w-max items-center gap-1">
      <ToolbarBtn icon={Undo2} label="Undo" disabled={!state.canUndo} onClick={() => run(c => c.undo())} />
      <ToolbarBtn icon={Redo2} label="Redo" disabled={!state.canRedo} onClick={() => run(c => c.redo())} />
      <Sep />
      <ToolbarMenu
        icon={HEADING_ICONS[state.heading] || Heading}
        label="Heading"
        active={state.heading > 0}
        items={[
          { id: 'p', label: 'Text', icon: Pilcrow, active: state.heading === 0, onClick: () => run(c => c.setParagraph()) },
          ...[1, 2, 3, 4].map(level => ({
            id: `h${level}`,
            label: `Heading ${level}`,
            icon: HEADING_ICONS[level],
            active: state.heading === level,
            onClick: () => run(c => c.setHeading({ level })),
          })),
        ]}
      />
      <ToolbarMenu
        icon={state.orderedList ? ListOrdered : state.taskList ? ListChecks : List}
        label="List"
        active={state.bulletList || state.orderedList || state.taskList}
        items={[
          { id: 'bullet', label: 'Bullet list', icon: List, active: state.bulletList, onClick: () => run(c => c.toggleBulletList()) },
          { id: 'ordered', label: 'Numbered list', icon: ListOrdered, active: state.orderedList, onClick: () => run(c => c.toggleOrderedList()) },
          { id: 'task', label: 'Task list', icon: ListChecks, active: state.taskList, onClick: () => run(c => c.toggleTaskList()) },
        ]}
      />
      <ToolbarBtn icon={TextQuote} label="Quote" active={state.blockquote} onClick={() => run(c => c.toggleBlockquote())} />
      <ToolbarBtn icon={SquareCode} label="Code block" active={state.codeBlock} onClick={() => run(c => c.toggleCodeBlock())} />
      <Sep />
      <ToolbarBtn icon={Bold} label="Bold" active={state.bold} onClick={() => run(c => c.toggleBold())} />
      <ToolbarBtn icon={Italic} label="Italic" active={state.italic} onClick={() => run(c => c.toggleItalic())} />
      <ToolbarBtn icon={Strikethrough} label="Strikethrough" active={state.strike} onClick={() => run(c => c.toggleStrike())} />
      <ToolbarBtn icon={Code} label="Inline code" active={state.code} onClick={() => run(c => c.toggleCode())} />
      <ToolbarBtn icon={Underline} label="Underline" active={state.underline} onClick={() => run(c => c.toggleUnderline())} />
      <ToolbarBtn icon={Highlighter} label="Highlight" active={state.highlight} onClick={() => run(c => c.toggleHighlight())} />
      <ToolbarBtn icon={Link2} label="Link" active={state.link} onClick={openLink} />
      <Sep />
      <ToolbarBtn icon={Superscript} label="Superscript" active={state.superscript} onClick={() => run(c => c.toggleSuperscript())} />
      <ToolbarBtn icon={Subscript} label="Subscript" active={state.subscript} onClick={() => run(c => c.toggleSubscript())} />
      <Sep />
      {/* Alignment: four buttons on wide cards, one menu on narrow ones. */}
      <span className="hidden shrink-0 items-center gap-1 sm:flex">
        {ALIGNMENTS.map(a => (
          <ToolbarBtn
            key={a.value}
            icon={a.icon}
            label={a.label}
            active={state.align === a.value && a.value !== 'left'}
            onClick={() => run(c => (a.value === 'left' ? c.unsetTextAlign() : c.setTextAlign(a.value)))}
          />
        ))}
      </span>
      <span className="shrink-0 sm:hidden">
        <ToolbarMenu
          icon={AlignIcon}
          label="Alignment"
          active={state.align !== 'left'}
          items={ALIGNMENTS.map(a => ({
            id: a.value,
            label: a.label,
            icon: a.icon,
            active: state.align === a.value,
            onClick: () => run(c => (a.value === 'left' ? c.unsetTextAlign() : c.setTextAlign(a.value))),
          }))}
        />
      </span>
      <ToolbarMenu
        icon={UnfoldVertical}
        label="Line spacing"
        active={!!state.lineHeight}
        items={LINE_HEIGHTS.map(l => ({
          id: l.label,
          label: l.label,
          icon: UnfoldVertical,
          active: (state.lineHeight || null) === l.value,
          onClick: () => run(c => c.setLineHeight(l.value)),
        }))}
      />
      <Sep />
      <ToolbarMenu
        icon={Table}
        label="Table"
        active={state.table}
        items={[
          { id: 'insert', label: 'Insert table', icon: Table, onClick: () => run(c => c.insertTable({ rows: 3, cols: 3, withHeaderRow: true })) },
          state.table && { id: 'row', label: 'Add row', icon: BetweenHorizontalEnd, onClick: () => run(c => c.addRowAfter()) },
          state.table && { id: 'col', label: 'Add column', icon: BetweenVerticalEnd, onClick: () => run(c => c.addColumnAfter()) },
          state.table && { id: 'delrow', label: 'Delete row', icon: Rows3, onClick: () => run(c => c.deleteRow()) },
          state.table && { id: 'delcol', label: 'Delete column', icon: Columns3, onClick: () => run(c => c.deleteColumn()) },
          state.table && { id: 'deltable', label: 'Delete table', icon: Trash2, danger: true, onClick: () => run(c => c.deleteTable()) },
        ]}
      />
      <ToolbarBtn icon={Minus} label="Divider" onClick={() => run(c => c.setHorizontalRule())} />
      <Sep />
      <span ref={searchBtnRef} className="shrink-0">
        <ToolbarBtn
          icon={Search}
          label="Find and replace (Ctrl+F)"
          active={searchOpen}
          onClick={() => (searchOpen ? closeSearch() : setSearchOpen(true))}
        />
      </span>
    </div>
    </div>
    {searchPanel}
    </>
  )
}

function Sep() {
  return <span aria-hidden="true" className="mx-1.5 h-5 w-px shrink-0 bg-bg-border" />
}

function ToolbarBtn({ icon: Icon, label, active = false, disabled = false, onClick }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={active}
      disabled={disabled}
      // mousedown, not click: fires before the editor's blur, so the selection
      // is kept when the command runs.
      onMouseDown={(e) => { e.preventDefault(); if (!disabled) onClick(e) }}
      className={`shrink-0 rounded-lg p-1.5 transition-colors disabled:cursor-not-allowed disabled:opacity-35 ${
        active ? 'bg-accent-muted text-accent' : 'text-text-muted hover:bg-bg-hover hover:text-text-primary'
      }`}
    >
      <Icon size={16} />
    </button>
  )
}

/**
 * A toolbar button with a small menu below it (Heading, List, Table). The
 * menu floats above the page (portal, fixed position under the button), so
 * the sideways-scrolling toolbar can't clip it; it follows the button when the
 * page or toolbar scrolls (a click can nudge the toolbar's scroll).
 */
function ToolbarMenu({ icon: Icon, label, active = false, items }) {
  const [pos, setPos] = useState(null) // { top, left } while open
  const buttonRef = useRef(null)
  const menuRef = useRef(null)
  const open = !!pos

  // Under the button, kept inside the viewport (the menu is at least 11rem).
  const place = () => {
    const rect = buttonRef.current?.getBoundingClientRect()
    if (!rect) return null
    return { top: rect.bottom + 4, left: Math.max(8, Math.min(rect.left, window.innerWidth - 184)) }
  }

  useEffect(() => {
    if (!open) return undefined
    const close = (e) => {
      if (!menuRef.current?.contains(e.target) && !buttonRef.current?.contains(e.target)) setPos(null)
    }
    const onKey = (e) => { if (e.key === 'Escape') setPos(null) }
    const follow = () => setPos(place())
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', onKey)
    window.addEventListener('resize', follow)
    window.addEventListener('scroll', follow, true)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('resize', follow)
      window.removeEventListener('scroll', follow, true)
    }
  }, [open])

  const toggle = () => setPos(open ? null : place())

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        aria-label={label}
        title={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onMouseDown={(e) => { e.preventDefault(); toggle() }}
        className={`flex shrink-0 items-center gap-0.5 rounded-lg py-1.5 pl-1.5 pr-1 transition-colors ${
          active || open ? 'bg-accent-muted text-accent' : 'text-text-muted hover:bg-bg-hover hover:text-text-primary'
        }`}
      >
        <Icon size={16} />
        <ChevronDown size={12} />
      </button>
      {open && createPortal(
        <div
          ref={menuRef}
          role="menu"
          aria-label={label}
          style={{ top: pos.top, left: pos.left }}
          className={`fixed z-[90] min-w-[10rem] ${MENU_PANEL}`}
        >
          {items.filter(Boolean).map(item => (
            <button
              key={item.id}
              type="button"
              role="menuitemcheckbox"
              aria-checked={!!item.active}
              onMouseDown={(e) => { e.preventDefault(); item.onClick(); setPos(null) }}
              className={menuItemClass({ danger: item.danger })}
            >
              <item.icon size={14} className={`shrink-0 ${item.active ? 'text-accent' : ''}`} />
              <span className="flex-1">{item.label}</span>
              {item.active && <Check size={14} className="text-accent" />}
            </button>
          ))}
        </div>,
        document.body,
      )}
    </>
  )
}

/**
 * Find and replace for a Rich text note (lib/richText/searchReplace.js): a
 * panel floating under the toolbar's search button. Enter / Shift+Enter step
 * through matches, Escape closes; closing clears the highlights.
 */
function SearchPanel({ editor, anchorRef, count, index, invalid, onClose }) {
  const storage = editor.storage.searchReplace
  const [term, setTerm] = useState(() => {
    // Start from the selected text when it's a short, single-line selection.
    const { from, to, empty } = editor.state.selection
    const selected = empty ? '' : editor.state.doc.textBetween(from, to, ' ')
    return selected && selected.length <= 100 && !selected.includes('\n') ? selected : storage.term
  })
  const [replace, setReplace] = useState(storage.replace)
  const [options, setOptions] = useState({
    caseSensitive: storage.caseSensitive,
    wholeWord: storage.wholeWord,
    regex: storage.regex,
  })
  const [pos, setPos] = useState(null)
  const panelRef = useRef(null)

  // Follow the button as the page scrolls or resizes; keep inside the window.
  useEffect(() => {
    const place = () => {
      const rect = anchorRef.current?.getBoundingClientRect()
      if (!rect) return
      const width = Math.min(320, window.innerWidth - 16)
      setPos({
        top: rect.bottom + 6,
        left: Math.max(8, Math.min(rect.right - width, window.innerWidth - width - 8)),
        width,
      })
    }
    place()
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    return () => {
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
    }
  }, [anchorRef])

  // Search as you type (and whenever an option changes).
  useEffect(() => {
    editor.commands.setSearch({ term, replace, ...options })
  }, [editor, term, replace, options])

  // Close on a click outside the panel and its button.
  useEffect(() => {
    const onDown = (e) => {
      if (!panelRef.current?.contains(e.target) && !anchorRef.current?.contains(e.target)) onClose()
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [anchorRef, onClose])

  const onSearchKey = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      if (e.shiftKey) editor.commands.previousMatch()
      else editor.commands.nextMatch()
    }
    if (e.key === 'Escape') { e.stopPropagation(); onClose() }
  }
  const toggle = (key) => setOptions(o => ({ ...o, [key]: !o[key] }))

  if (!pos) return null
  const inputClass = 'w-full rounded-xl border bg-bg-surface px-3 py-2 text-sm text-text-primary placeholder-text-muted focus:outline-none'
  const smallBtn = 'rounded-lg p-1.5 text-text-muted transition-colors hover:bg-bg-hover hover:text-text-primary disabled:opacity-35 disabled:hover:bg-transparent'

  return createPortal(
    <div
      ref={panelRef}
      role="dialog"
      aria-label="Find and replace"
      style={{ top: pos.top, left: pos.left, width: pos.width }}
      className="fixed z-[90] rounded-2xl border border-bg-border bg-bg-elevated shadow-xl"
    >
      <div className="flex items-center gap-1 px-3 pt-2.5 pb-2">
        <span className="flex-1 text-xs font-medium tabular-nums text-text-muted" aria-live="polite">
          {count ? index + 1 : 0} / {count}
        </span>
        <button type="button" className={smallBtn} disabled={!count} onClick={() => editor.commands.previousMatch()} aria-label="Previous match" title="Previous (Shift+Enter)">
          <ChevronUp size={16} />
        </button>
        <button type="button" className={smallBtn} disabled={!count} onClick={() => editor.commands.nextMatch()} aria-label="Next match" title="Next (Enter)">
          <ChevronDown size={16} />
        </button>
        <button type="button" className={smallBtn} onClick={onClose} aria-label="Close find and replace" title="Close (Esc)">
          <X size={16} />
        </button>
      </div>

      <div className="space-y-2 px-3">
        <div className="relative">
          <input
            autoFocus
            value={term}
            onChange={e => setTerm(e.target.value)}
            onKeyDown={onSearchKey}
            placeholder="Search"
            aria-label="Search"
            aria-invalid={invalid || undefined}
            className={`${inputClass} pr-9 ${invalid ? 'border-danger' : 'border-bg-border focus:border-accent'}`}
          />
          <CornerDownLeft size={14} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-text-muted" />
        </div>
        {invalid && <p className="px-1 text-xs text-danger">Not a valid regular expression.</p>}
        <input
          value={replace}
          onChange={e => setReplace(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') { e.preventDefault(); editor.commands.replaceMatch() }
            if (e.key === 'Escape') { e.stopPropagation(); onClose() }
          }}
          placeholder="Replace"
          aria-label="Replace with"
          className={`${inputClass} border-bg-border focus:border-accent`}
        />
      </div>

      <div className="space-y-1 px-3 py-2.5">
        <label className="flex cursor-pointer items-center gap-2 py-1 text-sm text-text-secondary">
          <CaseSensitive size={16} className="text-text-muted" />
          <span className="flex-1">Match case</span>
          <input type="checkbox" checked={options.caseSensitive} onChange={() => toggle('caseSensitive')} className="h-4 w-4 cursor-pointer accent-[var(--accent)]" />
        </label>
        <label className="flex cursor-pointer items-center gap-2 py-1 text-sm text-text-secondary">
          <WholeWord size={16} className="text-text-muted" />
          <span className="flex-1">Whole words</span>
          <input type="checkbox" checked={options.wholeWord} onChange={() => toggle('wholeWord')} className="h-4 w-4 cursor-pointer accent-[var(--accent)]" />
        </label>
      </div>

      <div className="border-t border-bg-border px-3 py-2.5">
        <label className="flex cursor-pointer items-center gap-2 text-sm text-text-secondary">
          <Regex size={16} className="text-text-muted" />
          <span className="flex-1">Use regular expression</span>
          <button
            type="button"
            role="switch"
            aria-checked={options.regex}
            onClick={() => toggle('regex')}
            className={`relative h-5 w-9 rounded-full transition-colors ${options.regex ? 'bg-accent' : 'bg-bg-border'}`}
          >
            <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${options.regex ? 'left-[18px]' : 'left-0.5'}`} />
          </button>
        </label>
      </div>

      <div className="flex justify-end gap-2 border-t border-bg-border px-3 py-2.5">
        <button
          type="button"
          disabled={!count}
          onClick={() => editor.commands.replaceMatch()}
          className={buttonClass({ variant: 'secondary', size: 'sm' })}
        >
          Replace
        </button>
        <button
          type="button"
          disabled={!count}
          onClick={() => editor.commands.replaceAllMatches()}
          className="rounded-xl bg-accent px-3 py-1.5 text-sm font-semibold text-accent-fg transition-colors hover:bg-accent-hover disabled:opacity-40"
        >
          Replace all
        </button>
      </div>
    </div>,
    document.body,
  )
}
