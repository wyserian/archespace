/**
 * The mobile app's Rich text editor: this repo's Tiptap configuration running
 * in a Flutter WebView (bundled by scripts/build-mobile-editor.mjs into one
 * offline HTML file the app ships). Same extensions as the web editor, so
 * both save identical Tiptap JSON.
 *
 * Bridge: the app calls `window.editorApi.*`; the editor answers through the
 * `Arche` JavaScript channel with `ready`, `change` ({ doc }) and `state`
 * (active formatting) messages.
 */
import { Editor } from '@tiptap/core'
import { richTextExtensions } from '../extensions'
import { toRichDoc } from '../convert'

const post = (msg) => {
  try { window.Arche?.postMessage(JSON.stringify(msg)) } catch { /* no bridge */ }
}

const MARKDOWN_HINT = /(^|\n)\s{0,3}(#{1,6}\s|[-*+]\s|\d+\.\s|>\s|```|- \[[ xX]\]\s)|\*\*[^*\n]+\*\*|\[[^\]\n]+\]\([^)\n]+\)/

let changeTimer
const editor = new Editor({
  element: document.getElementById('editor'),
  extensions: richTextExtensions(),
  content: '',
  editorProps: {
    attributes: { class: 'prose', spellcheck: 'true', autocapitalize: 'sentences' },
    handlePaste: (_view, event) => {
      const data = event.clipboardData
      const text = data?.getData('text/plain') || ''
      if (data?.getData('text/html') || !MARKDOWN_HINT.test(text)) return false
      editor.commands.insertContent(text, { contentType: 'markdown' })
      return true
    },
  },
  onUpdate: () => {
    clearTimeout(changeTimer)
    changeTimer = setTimeout(() => post({ type: 'change', doc: editor.getJSON() }), 250)
  },
  onTransaction: () => reportState(),
})

function reportState() {
  post({
    type: 'state',
    active: {
      bold: editor.isActive('bold'),
      italic: editor.isActive('italic'),
      underline: editor.isActive('underline'),
      strike: editor.isActive('strike'),
      code: editor.isActive('code'),
      highlight: editor.isActive('highlight'),
      superscript: editor.isActive('superscript'),
      subscript: editor.isActive('subscript'),
      align: ['center', 'right', 'justify'].find(a => editor.isActive({ textAlign: a })) || 'left',
      lineHeight: editor.getAttributes('paragraph').lineHeight || editor.getAttributes('heading').lineHeight || null,
      heading: [1, 2, 3, 4].find(level => editor.isActive('heading', { level })) || 0,
      bulletList: editor.isActive('bulletList'),
      orderedList: editor.isActive('orderedList'),
      taskList: editor.isActive('taskList'),
      blockquote: editor.isActive('blockquote'),
      codeBlock: editor.isActive('codeBlock'),
      link: editor.isActive('link'),
      linkHref: editor.getAttributes('link').href || '',
      table: editor.isActive('table'),
    },
    canUndo: editor.can().undo(),
    canRedo: editor.can().redo(),
    // Find and replace (searchReplace.js): match count, current match, and
    // whether a regular expression failed to compile.
    search: {
      count: editor.storage.searchReplace?.results.length ?? 0,
      index: editor.storage.searchReplace?.index ?? 0,
      invalid: !!editor.storage.searchReplace?.invalid,
    },
  })
}

window.editorApi = {
  /**
   * Load an item: `{ type, content, editable }`. Older formats (the old Rich
   * text HTML, the old Markdown type) are converted as they load; the first
   * change then saves the new format.
   */
  load({ type, content, editable }) {
    // Loading isn't an edit, so neither call emits an update.
    editor.commands.setContent(toRichDoc(type, content), { emitUpdate: false })
    editor.setEditable(editable !== false, false)
    // Flush right away if the stored content wasn't Tiptap JSON yet, so the
    // app can save the converted version.
    if (!(content && content.doc)) post({ type: 'converted', doc: editor.getJSON() })
    reportState()
  },
  getJSON() { return JSON.stringify(editor.getJSON()) },
  /** Theme colours from the app: { bg, text, muted, border, surface, accent, dark }. */
  setTheme(theme) {
    const root = document.documentElement.style
    for (const [key, value] of Object.entries(theme || {})) {
      if (typeof value === 'string') root.setProperty(`--${key}`, value)
    }
    document.documentElement.classList.toggle('dark', !!theme?.dark)
  },
  focus() { editor.commands.focus('end') },
  /**
   * Find and replace, driven by the app's native panel. These never focus the
   * editor, so the keyboard stays on the panel's text fields. `search` takes
   * `{ term, replace, caseSensitive, wholeWord, regex }`; an empty term clears
   * the highlights.
   */
  search(options) { editor.commands.setSearch(options || {}) },
  nextMatch() { editor.commands.nextMatch() },
  previousMatch() { editor.commands.previousMatch() },
  replaceMatch() { editor.commands.replaceMatch() },
  replaceAll() { editor.commands.replaceAllMatches() },
  exec(cmd, arg) {
    const c = editor.chain().focus()
    switch (cmd) {
      case 'bold': c.toggleBold().run(); break
      case 'italic': c.toggleItalic().run(); break
      case 'underline': c.toggleUnderline().run(); break
      case 'strike': c.toggleStrike().run(); break
      case 'code': c.toggleCode().run(); break
      case 'highlight': c.toggleHighlight().run(); break
      case 'superscript': c.toggleSuperscript().run(); break
      case 'subscript': c.toggleSubscript().run(); break
      case 'lineHeight': c.setLineHeight(arg || null).run(); break
      case 'align':
        if (!arg || arg === 'left') c.unsetTextAlign().run()
        else c.setTextAlign(String(arg)).run()
        break
      case 'heading':
        if (arg) c.setHeading({ level: Number(arg) }).run()
        else c.setParagraph().run()
        break
      case 'bulletList': c.toggleBulletList().run(); break
      case 'orderedList': c.toggleOrderedList().run(); break
      case 'taskList': c.toggleTaskList().run(); break
      case 'blockquote': c.toggleBlockquote().run(); break
      case 'codeBlock': c.toggleCodeBlock().run(); break
      case 'hr': c.setHorizontalRule().run(); break
      case 'link':
        if (arg) c.extendMarkRange('link').setLink({ href: String(arg) }).run()
        else c.extendMarkRange('link').unsetLink().run()
        break
      case 'table': c.insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(); break
      case 'addRow': c.addRowAfter().run(); break
      case 'addColumn': c.addColumnAfter().run(); break
      case 'deleteRow': c.deleteRow().run(); break
      case 'deleteColumn': c.deleteColumn().run(); break
      case 'deleteTable': c.deleteTable().run(); break
      case 'undo': c.undo().run(); break
      case 'redo': c.redo().run(); break
    }
  },
}

post({ type: 'ready' })
