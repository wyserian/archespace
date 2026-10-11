/**
 * pdfExport.js - Export a space or a single item to PDF, fully client-side,
 * using pdfmake. The PDF is generated directly (no browser print dialog), so we
 * fully control every page: the export time (top-left), the name (top-right),
 * the site URL (bottom-left) and the page number (bottom-right). Content
 * rendering mirrors the mobile export.
 */
import { markdownToHtml } from '../components/editors/MarkdownPreview'
import { sanitizeRichHtml } from './sanitizeHtml'
import { TYPE_LABELS } from './itemTypes'
import { isRichDoc } from './richText/doc'
import { isContentHidden } from './itemLock'
import { hasBoardContent } from './whiteboard/scene'
import { kanbanColumns } from './kanban'

const SITE_URL = 'https://archespace.app/'
const CHROME_COLOR = '#8a8a8a'
// The mint accent's deeper shade, readable on white paper.
const BRAND_ACCENT = '#0b7f64'
// A4 content width (595.28pt) minus the 40pt side margins, for full-width rules.
const CONTENT_WIDTH = 515

// pdfmake (lazy-loaded: keeps its font bundle out of the initial page load)
let pdfMakePromise = null
function getPdfMake() {
  if (!pdfMakePromise) {
    // The stock pdfmake/build/vfs_fonts uses top-level `this`, which throws
    // under ESM; use our generated font module instead.
    pdfMakePromise = Promise.all([
      import('pdfmake/build/pdfmake'),
      import('./pdfVfs'),
    ]).then(([pdfMakeMod, vfsMod]) => {
      const pdfMake = pdfMakeMod.default || pdfMakeMod
      pdfMake.vfs = vfsMod.default
      // DejaVu (subsetted) covers arrows, checkboxes and other symbols Roboto
      // lacks; the mono face keeps code aligned.
      pdfMake.fonts = {
        DejaVuSans: {
          normal: 'DejaVuSans.ttf',
          bold: 'DejaVuSans-Bold.ttf',
          italics: 'DejaVuSans-Oblique.ttf',
          bolditalics: 'DejaVuSans-BoldOblique.ttf',
        },
        DejaVuMono: {
          normal: 'DejaVuSansMono.ttf',
          bold: 'DejaVuSansMono.ttf',
          italics: 'DejaVuSansMono.ttf',
          bolditalics: 'DejaVuSansMono.ttf',
        },
      }
      return pdfMake
    })
  }
  return pdfMakePromise
}

/** The export time, e.g. "9/19/26, 8:36 PM". */
function timestamp() {
  const d = new Date()
  const h12 = d.getHours() % 12 === 0 ? 12 : d.getHours() % 12
  const ampm = d.getHours() >= 12 ? 'PM' : 'AM'
  const mm = String(d.getMinutes()).padStart(2, '0')
  const yy = String(d.getFullYear() % 100).padStart(2, '0')
  return `${d.getMonth() + 1}/${d.getDate()}/${yy}, ${h12}:${mm} ${ampm}`
}

const emptyNode = () => ({ text: '(empty)', style: 'empty' })

/** Flatten sanitized rich HTML to plain text, keeping block boundaries. */
function htmlToText(html) {
  const div = document.createElement('div')
  div.innerHTML = sanitizeRichHtml(html || '')
  div.querySelectorAll('br').forEach(br => br.replaceWith('\n'))
  div.querySelectorAll('p,div,li,h1,h2,h3,h4,h5,h6,tr').forEach(el => el.append('\n'))
  return (div.textContent || '').replace(/\n{3,}/g, '\n\n').trim()
}

const listRows = items =>
  (items || []).map(r => (r?.text ?? '').trim()).filter(t => t !== '')

const cardLayout = {
  hLineWidth: () => 0.5,
  vLineWidth: () => 0.5,
  hLineColor: () => '#dddddd',
  vLineColor: () => '#dddddd',
  paddingLeft: () => 8,
  paddingRight: () => 8,
  paddingTop: () => 6,
  paddingBottom: () => 6,
}
const codeLayout = {
  fillColor: () => '#f6f8fa',
  hLineWidth: () => 0.5,
  vLineWidth: () => 0.5,
  hLineColor: () => '#e2e2e2',
  vLineColor: () => '#e2e2e2',
  paddingLeft: () => 8,
  paddingRight: () => 8,
  paddingTop: () => 6,
  paddingBottom: () => 6,
}
const tableLayout = {
  hLineWidth: () => 0.5,
  vLineWidth: () => 0.5,
  hLineColor: () => '#cccccc',
  vLineColor: () => '#cccccc',
}

// Rich text (Tiptap JSON)
const HEADING_SIZES = { 1: 16, 2: 14, 3: 12.5 }

/** pdfmake text runs for a node's inline content (text + marks). */
function richRuns(node) {
  const runs = []
  for (const child of node?.content || []) {
    if (child.type === 'hardBreak') { runs.push({ text: '\n' }); continue }
    if (child.type !== 'text') continue
    const run = { text: child.text || '' }
    for (const mark of child.marks || []) {
      if (mark.type === 'bold') run.bold = true
      if (mark.type === 'italic') run.italics = true
      if (mark.type === 'underline') run.decoration = 'underline'
      if (mark.type === 'strike') run.decoration = 'lineThrough'
      if (mark.type === 'code') { run.font = 'DejaVuMono'; run.fontSize = 9.5; run.background = '#f0f2f5' }
      if (mark.type === 'highlight') run.background = '#fdf1a8'
      if (mark.type === 'superscript') run.sup = true
      if (mark.type === 'subscript') run.sub = true
      if (mark.type === 'link' && mark.attrs?.href) { run.link = mark.attrs.href; run.color = '#0b7f64' }
    }
    runs.push(run)
  }
  return runs.length ? runs : [{ text: '' }]
}

/** A paragraph/heading's alignment and line spacing, if set. */
function richAlign(node) {
  const align = node.attrs?.textAlign
  const lineHeight = Number(node.attrs?.lineHeight)
  return {
    ...(align && align !== 'left' ? { alignment: align } : {}),
    // The editor's Normal is 1.5 and the PDF's body is 1.3: scale to match.
    ...(lineHeight ? { lineHeight: Math.round(lineHeight * (1.3 / 1.5) * 100) / 100 } : {}),
  }
}

/** pdfmake nodes for a list of Tiptap block nodes. */
function richBlocks(nodes) {
  const out = []
  for (const node of nodes || []) {
    switch (node.type) {
      case 'paragraph':
        out.push({ text: richRuns(node), margin: [0, 0, 0, 4], ...richAlign(node) })
        break
      case 'heading':
        out.push({ text: richRuns(node), bold: true, fontSize: HEADING_SIZES[node.attrs?.level] || 12, margin: [0, 4, 0, 3], ...richAlign(node) })
        break
      case 'bulletList':
      case 'orderedList':
        out.push({
          [node.type === 'bulletList' ? 'ul' : 'ol']: (node.content || []).map(li => ({ stack: richBlocks(li.content) })),
          margin: [4, 0, 0, 4],
        })
        break
      case 'taskList':
        out.push({
          stack: (node.content || []).map(ti => {
            const done = !!ti.attrs?.checked
            const [first, ...rest] = ti.content || []
            return {
              stack: [
                { text: [{ text: done ? '☑  ' : '☐  ' }, ...richRuns(first)], ...(done ? { color: '#777777', decoration: 'lineThrough' } : {}) },
                ...(rest.length ? [{ stack: richBlocks(rest), margin: [14, 0, 0, 0] }] : []),
              ],
            }
          }),
          margin: [2, 0, 0, 4],
        })
        break
      case 'blockquote':
        out.push({ stack: richBlocks(node.content), italics: true, color: '#555555', margin: [12, 0, 0, 4] })
        break
      case 'codeBlock': {
        const code = (node.content || []).map(t => t.text || '').join('')
        out.push({
          table: { widths: ['*'], body: [[{ text: code, font: 'DejaVuMono', fontSize: 9.5, preserveLeadingSpaces: true }]] },
          layout: codeLayout,
          margin: [0, 2, 0, 6],
        })
        break
      }
      case 'horizontalRule':
        out.push({ canvas: [{ type: 'line', x1: 0, y1: 0, x2: CONTENT_WIDTH, y2: 0, lineWidth: 0.5, lineColor: '#cccccc' }], margin: [0, 4, 0, 6] })
        break
      case 'table': {
        const rows = (node.content || []).map(row => row.content || [])
        const cols = Math.max(1, ...rows.map(r => r.length))
        const body = rows.map(cells => Array.from({ length: cols }, (_, i) => {
          const cell = cells[i]
          if (!cell) return { text: '' }
          return {
            stack: richBlocks(cell.content),
            ...(cell.type === 'tableHeader' ? { bold: true, fillColor: '#f5f5f5' } : {}),
          }
        }))
        if (body.length) {
          out.push({ table: { widths: Array(cols).fill('*'), body }, layout: tableLayout, fontSize: 10, margin: [0, 2, 0, 6] })
        }
        break
      }
      default:
        if (node.content) out.push(...richBlocks(node.content))
    }
  }
  return out
}

/** Content nodes for a single item's body, by type. */
function itemBodyNodes({ type, content }) {
  const c = content || {}
  switch (type) {
    case 'textbox':
      return c.text ? [{ text: c.text }] : [emptyNode()]
    case 'markdown': {
      const t = c.text ? htmlToText(markdownToHtml(c.text)) : ''
      return t ? [{ text: t }] : [emptyNode()]
    }
    case 'richtext': {
      if (isRichDoc(c)) {
        const nodes = richBlocks(c.doc.content)
        const hasText = JSON.stringify(c.doc).includes('"text"')
        return hasText ? nodes : [emptyNode()]
      }
      // Saved before the Tiptap editor (converts on next unlock).
      const t = htmlToText(c.html)
      return t ? [{ text: t }] : [emptyNode()]
    }
    case 'code':
      return c.code
        ? [{
            table: { widths: ['*'], body: [[{ text: c.code, font: 'DejaVuMono', fontSize: 9.5, preserveLeadingSpaces: true }]] },
            layout: codeLayout,
            margin: [0, 2, 0, 0],
          }]
        : [emptyNode()]
    case 'menu_list': {
      const rows = listRows(c.items)
      return rows.length ? [{ ul: rows, margin: [4, 0, 0, 0] }] : [emptyNode()]
    }
    case 'numbered_list': {
      const rows = listRows(c.items)
      return rows.length ? [{ ol: rows, margin: [4, 0, 0, 0] }] : [emptyNode()]
    }
    case 'checkbox_list': {
      const items = (c.items || []).filter(r => (r?.text ?? '').trim() !== '')
      if (!items.length) return [emptyNode()]
      return [{
        type: 'none',
        ul: items.map(r => ({
          text: `${r.checked ? '☑' : '☐'}  ${r.text}`,
          ...(r.checked ? { color: '#777777', decoration: 'lineThrough' } : {}),
        })),
      }]
    }
    case 'card_list': {
      const cards = (c.items || []).filter(
        cd => (cd?.title ?? '').trim() !== '' || (cd?.description ?? '').trim() !== ''
      )
      if (!cards.length) return [emptyNode()]
      return cards.map(cd => ({
        table: {
          widths: ['*'],
          body: [[{
            stack: [
              ...(cd.title ? [{ text: cd.title, bold: true }] : []),
              ...(cd.description ? [{ text: cd.description, color: '#444444', margin: [0, 2, 0, 0] }] : []),
            ],
          }]],
        },
        layout: cardLayout,
        margin: [0, 0, 0, 6],
      }))
    }
    case 'table': {
      const columns = Array.isArray(c.columns) ? c.columns : []
      const rows = Array.isArray(c.rows) ? c.rows : []
      if (!columns.length && !rows.length) return [emptyNode()]
      const hasHead = columns.some(col => (col ?? '').trim() !== '')
      const colCount = columns.length || (rows[0]?.length ?? 1)
      const body = []
      if (hasHead) {
        body.push(columns.map(col => ({ text: String(col ?? ''), bold: true, fillColor: '#f5f5f5' })))
      }
      for (const row of rows) {
        const cells = Array.isArray(row) ? row : []
        body.push(Array.from({ length: colCount }, (_, i) => String(cells[i] ?? '')))
      }
      if (!body.length) return [emptyNode()]
      return [{
        table: { headerRows: hasHead ? 1 : 0, widths: Array(colCount).fill('*'), body },
        layout: tableLayout,
        fontSize: 10,
      }]
    }
    case 'kanban': {
      // Each column as a heading with its count, then its cards.
      const columns = kanbanColumns(c)
      if (!columns.some(col => col.cards.length || col.title.trim())) return [emptyNode()]
      return columns.flatMap(col => [
        { text: `${col.title || 'Untitled'}  (${col.cards.length})`, bold: true, margin: [0, 4, 0, 4] },
        ...(col.cards.length
          ? col.cards.map(card => ({
              table: {
                widths: ['*'],
                body: [[{
                  stack: [
                    { text: card.title || 'Untitled', bold: true },
                    ...(card.description ? [{ text: card.description, color: '#444444', margin: [0, 2, 0, 0] }] : []),
                  ],
                }]],
              },
              layout: cardLayout,
              margin: [0, 0, 0, 6],
            }))
          : [{ ...emptyNode(), margin: [0, 0, 0, 6] }]),
      ])
    }
    case 'whiteboard': {
      if (!hasBoardContent(c)) return [emptyNode()]
      // The preview saved with the board; an old drawing gets one when it
      // first shows in the app.
      if (typeof c.preview !== 'string' || !c.preview.startsWith('data:image/png')) {
        return [{ text: 'Open this whiteboard in the app to include it.', style: 'empty' }]
      }
      return [{ image: c.preview, fit: [CONTENT_WIDTH, 360], margin: [0, 2, 0, 0] }]
    }
    default:
      return [emptyNode()]
  }
}

/** A space item as a titled section with a rule under the heading. */
function itemSectionNodes(item) {
  const title = item.title || 'Untitled'
  const label = TYPE_LABELS[item.type] || 'Item'
  return [
    {
      text: [
        { text: title, bold: true, fontSize: 13 },
        { text: `   ${label}`, fontSize: 9, color: '#777777' },
      ],
      margin: [0, 12, 0, 3],
    },
    { canvas: [{ type: 'line', x1: 0, y1: 0, x2: CONTENT_WIDTH, y2: 0, lineWidth: 0.5, lineColor: '#dddddd' }], margin: [0, 0, 0, 8] },
    // A protected item that isn't open stays out of the file.
    ...(isContentHidden(item) ? [{ text: 'Protected', style: 'empty' }] : itemBodyNodes(item)),
  ]
}

/** Build the doc and hand the user the file. */
async function generate(filename, content) {
  const pdfMake = await getPdfMake()
  const stamp = timestamp()
  const docDefinition = {
    pageSize: 'A4',
    pageMargins: [40, 58, 40, 44],
    defaultStyle: { font: 'DejaVuSans', fontSize: 11, color: '#111111', lineHeight: 1.3 },
    styles: { empty: { italics: true, color: '#999999' } },
    header: () => ({
      margin: [40, 22, 40, 0],
      columns: [
        { text: stamp, fontSize: 8, color: CHROME_COLOR, margin: [0, 1.5, 0, 0] },
        // The name as on the site and in the emails: caps, ARCHE in the accent.
        {
          text: [{ text: 'ARCHE', color: BRAND_ACCENT }, 'SPACE'],
          fontSize: 9.5,
          bold: true,
          characterSpacing: 0.3,
          color: '#111111',
          alignment: 'right',
        },
      ],
    }),
    footer: (currentPage, pageCount) => ({
      margin: [40, 0, 40, 16],
      columns: [
        { text: SITE_URL, fontSize: 8, color: CHROME_COLOR },
        { text: `${currentPage}/${pageCount}`, fontSize: 8, color: CHROME_COLOR, alignment: 'right' },
      ],
    }),
    content,
  }
  const safeName = (filename || 'ArcheSpace').replace(/[\\/:*?"<>|]+/g, ' ').trim() || 'ArcheSpace'
  pdfMake.createPdf(docDefinition).download(`${safeName}.pdf`)
}

/** Export a single item (uses its current local title/content). */
export async function exportItemToPdf(item) {
  const title = (item?.title || '').trim() || 'Untitled'
  const label = TYPE_LABELS[item?.type] || 'Item'
  const content = [
    { text: title, bold: true, fontSize: 18, margin: [0, 0, 0, 2] },
    { text: label, fontSize: 9, color: '#666666', margin: [0, 0, 0, 12] },
    ...itemBodyNodes(item || {}),
  ]
  await generate(title, content)
}

/** Export a space with all of its (decrypted) items. */
export async function exportSpaceToPdf(space, items) {
  const name = (space?.name || '').trim() || 'Space'
  const content = [
    // The space name once, at the start of the document (not per page).
    { text: name, bold: true, fontSize: 18, margin: [0, 0, 0, space?.description || space?.tags?.length ? 4 : 12] },
  ]
  if (space?.description) {
    content.push({ text: space.description, color: '#444444', margin: [0, 0, 0, 4] })
  }
  if (Array.isArray(space?.tags) && space.tags.length > 0) {
    content.push({ text: space.tags.map(t => `#${t}`).join('   '), fontSize: 10, color: '#666666', margin: [0, 0, 0, 8] })
  }
  const list = items || []
  if (!list.length) {
    content.push({ text: 'No items in this space.', style: 'empty' })
  } else {
    list.forEach(item => content.push(...itemSectionNodes(item)))
  }
  await generate(name, content)
}
