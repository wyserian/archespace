/**
 * extensions.js - The Rich text editor's configuration, shared by the web
 * editor, the old-format conversion, and the mobile app's WebView editor
 * (built from this repo by scripts/build-mobile-editor.mjs), so every platform
 * supports exactly the same formatting.
 *
 * Content is stored as Tiptap (ProseMirror) JSON: `{ doc: { type: 'doc', ... } }`.
 */
import StarterKit from '@tiptap/starter-kit'
import { TaskList, TaskItem } from '@tiptap/extension-list'
import { TableKit } from '@tiptap/extension-table'
import { Markdown } from '@tiptap/markdown'
import { Placeholder } from '@tiptap/extensions'
import { Highlight } from '@tiptap/extension-highlight'
import { TextAlign } from '@tiptap/extension-text-align'
import { Superscript } from '@tiptap/extension-superscript'
import { Subscript } from '@tiptap/extension-subscript'
import { SearchReplace } from './searchReplace'
import { LineHeight } from './lineHeight'

export function richTextExtensions() {
  return [
    StarterKit.configure({
      heading: { levels: [1, 2, 3, 4] },
      // Links open from the item's own toolbar, never on a plain click (a
      // click places the cursor). Only http(s) and mailto are kept.
      link: {
        openOnClick: false,
        autolink: true,
        defaultProtocol: 'https',
        protocols: ['http', 'https', 'mailto'],
      },
    }),
    TaskList,
    TaskItem.configure({ nested: true }),
    TableKit.configure({ table: { resizable: false } }),
    // One highlight colour (a marker), themed in CSS.
    Highlight,
    TextAlign.configure({
      types: ['heading', 'paragraph'],
      alignments: ['left', 'center', 'right', 'justify'],
    }),
    Superscript,
    Subscript,
    LineHeight,
    // Find and replace (display-only highlights; nothing is saved).
    SearchReplace,
    // Markdown: pasting it converts to formatting, and old Markdown notes
    // convert into this format.
    Markdown,
    Placeholder.configure({ placeholder: 'Start writing...' }),
  ]
}
