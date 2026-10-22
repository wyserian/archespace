/**
 * exportImport.js - JSON backup export and import for ArcheSpace.
 *
 * Export writes an encrypted snapshot of the active spaces and items (only
 * the fields that define the content, no ids or timestamps); see
 * backupCrypto.js. Import opens it (with the vault PIN when it's from another
 * vault), re-encrypts everything with the current vault key and recreates the
 * spaces and items, skipping any item it can't recognise.
 */

import { supabase } from './supabase'
import { logAudit } from './auditLog'
import { encryptSpace, encryptItem, encryptReminder, decryptItems } from './dataProtection'
import { isRichDoc } from './richText/doc'
import { isKanbanContent } from './kanban'
import { parseTags } from './spaceColors'
import { isEncryptedBackup, openBackupWithKey, openBackupWithPin, sealBackup } from './backupCrypto'
import { getVaultBackupMeta } from './crypto/vault'
import {
  MAX_IMPORT_FILE_SIZE,
  MAX_IMPORT_SPACES,
  MAX_IMPORT_ITEMS_PER_SPACE,
  ITEM_TYPES,
  MAX_NAME_LENGTH,
  MAX_DESCRIPTION_LENGTH,
  MAX_TITLE_LENGTH,
} from './constants'

/**
 * Export all active spaces (and their non-deleted, non-archived items) as an
 * encrypted JSON file download.
 *
 * @param {Array} spaces - The current (decrypted) spaces array
 * @param {CryptoKey} cryptoKey - Vault key for decrypting items from the DB
 */
export async function exportSpaces(spaces, cryptoKey) {
  if (!cryptoKey) throw new Error('Vault must be unlocked to export')
  const { data: { session } } = await supabase.auth.getSession()
  const userId = session?.user?.id
  if (!userId) throw new Error('Not authenticated')

  // Active items of one space, or the dashboard's items (no space) for `null`.
  const loadItems = async (spaceId) => {
    let q = supabase
      .from('space_items')
      .select('type, title, content, reminder, position, pinned, locked')
    q = spaceId ? q.eq('space_id', spaceId) : q.is('space_id', null)
    const { data, error } = await q
      .is('deleted_at', null)
      .is('archived_at', null)
      .order('position')
    if (error) throw error
    const items = await decryptItems(data || [], cryptoKey)
    return items.map((it) => ({
      type: it.type,
      title: it.title ?? '',
      content: it.content ?? {},
      pinned: !!it.pinned,
      ...(it.locked ? { locked: true } : {}),
      ...(it.reminder ? { reminder: it.reminder } : {}),
    }))
  }

  try {
    // Nesting: each space's `key` is its place in the list, and a sub-space
    // names its parent's as `parentKey`.
    const keyOf = new Map(spaces.map((c, i) => [c.id, i]))
    const exportedSpaces = await Promise.all(
      spaces.map(async (c, i) => ({
        key: i,
        ...(keyOf.has(c.parent_id) ? { parentKey: keyOf.get(c.parent_id) } : {}),
        name: c.name ?? '',
        description: c.description ?? '',
        color: typeof c.color === 'string' ? c.color : null,
        tags: parseTags(c.tags),
        pinned: !!c.pinned,
        ...(c.locked ? { locked: true } : {}),
        items: await loadItems(c.id),
      }))
    )

    const contents = {
      spaces: exportedSpaces,
      // Items that live on the dashboard, outside any space.
      items: await loadItems(null),
    }
    const payload = await sealBackup(contents, cryptoKey, await getVaultBackupMeta(userId))

    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: 'application/json',
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `arche-backup-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)

    await logAudit({ action: 'export', details: { count: spaces.length } })
  } catch (error) {
    console.error('Export failed:', error)
    throw error
  }
}

/**
 * The order to import a backup's spaces in, parents first: [index,
 * parentIndex]. A space's `parentKey` names another space's `key`; one that
 * names no space (or loops) imports at the top level, as do older backups,
 * which have neither.
 */
export function nestingOrder(spaces) {
  const indexOfKey = new Map()
  spaces.forEach((s, i) => {
    if (s?.key != null && !indexOfKey.has(s.key)) indexOfKey.set(s.key, i)
  })
  const parentOf = spaces.map((s, i) => {
    const p = s?.parentKey == null ? undefined : indexOfKey.get(s.parentKey)
    return p === undefined || p === i ? null : p
  })
  const children = new Map()
  parentOf.forEach((p, i) => {
    if (p != null) children.set(p, [...(children.get(p) || []), i])
  })
  const order = []
  const placed = new Set()
  const place = (start) => {
    const queue = [start]
    while (queue.length) {
      const i = queue.shift()
      if (placed.has(i)) continue
      placed.add(i)
      order.push([i, placed.has(parentOf[i]) && i !== start ? parentOf[i] : null])
      queue.push(...(children.get(i) || []))
    }
  }
  spaces.forEach((_, i) => { if (parentOf[i] == null) place(i) })
  // Whatever is left is in a parent loop: break it at the top level.
  spaces.forEach((_, i) => place(i))
  return order
}

/** Validate an item's content shape for its type (matches the current editors). */
function validateItemContent(type, content) {
  if (!content || typeof content !== 'object') return false

  switch (type) {
    case 'textbox':
      return typeof content.text === 'string'
    case 'richtext':
      // Tiptap JSON, or the older HTML (converted after unlock).
      return isRichDoc(content) || typeof content.html === 'string'
    case 'code':
      return typeof content.code === 'string'
    case 'checkbox_list':
    case 'menu_list':
    case 'numbered_list':
    case 'card_list':
      return Array.isArray(content.items) && content.items.length <= 1000
    case 'table':
      return (
        Array.isArray(content.columns) &&
        Array.isArray(content.rows) &&
        content.columns.length <= 100 &&
        content.rows.length <= 1000
      )
    case 'kanban':
      return isKanbanContent(content)
    case 'whiteboard':
      // An Excalidraw board, or an old drawing (converted when it opens).
      return Array.isArray(content.elements)
        ? content.elements.length <= 20000
        : Array.isArray(content.strokes) && content.strokes.length <= 10000
    default:
      return false
  }
}

/**
 * Validate, re-encrypt and insert a backup's items into a space, or onto the
 * dashboard when `spaceId` is null. Items with an unknown type or a malformed
 * body are skipped rather than failing the import.
 * @returns {Promise<{ imported: number, skipped: number }>}
 */
async function insertImportedItems(items, spaceId, userId, cryptoKey) {
  let skipped = 0
  const rows = []
  for (const item of items) {
    // Backups made before the Whiteboard was renamed call it 'draw'.
    const type = item?.type === 'draw' ? 'whiteboard' : item?.type
    if (
      !item ||
      typeof item !== 'object' ||
      !ITEM_TYPES.includes(type) ||
      !validateItemContent(type, item.content)
    ) {
      skipped++
      continue
    }

    const title = (typeof item.title === 'string' ? item.title.trim() : '')
      .slice(0, MAX_TITLE_LENGTH)
    const encryptedItem = await encryptItem({ title, content: item.content }, cryptoKey)

    rows.push({
      space_id: spaceId,
      user_id: userId,
      type,
      title: encryptedItem.title,
      content: encryptedItem.content,
      position: rows.length,
      pinned: !!item.pinned,
      locked: item.locked === true,
      reminder: await encryptReminder(item.reminder, cryptoKey),
    })
  }

  if (rows.length > 0) {
    const { error } = await supabase.from('space_items').insert(rows)
    if (error) throw error
  }
  return { imported: rows.length, skipped }
}

/**
 * Import an encrypted backup file: its spaces, and the dashboard items in
 * `items`.
 *
 * @param {File} file - The .json File object from an <input>
 * @param {string} userId - The authenticated user's UUID
 * @param {CryptoKey} cryptoKey - Vault key for encrypting the imported data
 * @param {{ askBackupPin?: (check: (pin: string) => Promise<boolean>) => Promise<boolean> }} [options]
 *   Asks for the vault PIN of an encrypted backup made in another vault;
 *   `check` tries a PIN. Resolving false cancels the import.
 * @returns {Promise<{ spaces: number, items: number, skipped: number } | null>}
 *   Null when the import was cancelled at the PIN prompt.
 * @throws {Error} If the file is malformed, not encrypted, or over the limits
 */
export async function importSpaces(file, userId, cryptoKey, { askBackupPin } = {}) {
  if (!cryptoKey) throw new Error('Vault must be unlocked to import')
  if (file.size > MAX_IMPORT_FILE_SIZE) {
    throw new Error(`File is too large. The maximum size is ${MAX_IMPORT_FILE_SIZE / (1024 * 1024)}MB.`)
  }

  let parsed
  try {
    parsed = JSON.parse(await file.text())
  } catch (error) {
    throw new Error('Invalid backup: the file is not valid JSON.', { cause: error })
  }

  if (!isEncryptedBackup(parsed)) {
    throw new Error('Invalid backup: only encrypted ArcheSpace backups can be imported.')
  }

  // Opens with this vault's key when it's from this vault; otherwise with the
  // vault PIN it was made with.
  let contents = await openBackupWithKey(parsed, cryptoKey)
  if (!contents) {
    if (!askBackupPin) throw new Error('This backup is from another vault.')
    const ok = await askBackupPin(async (pin) => {
      try {
        contents = await openBackupWithPin(parsed, pin)
        return true
      } catch (err) {
        if ((err?.message || '').includes('Incorrect PIN')) return false
        throw err
      }
    })
    if (!ok) return null
  }
  const spacesList = Array.isArray(contents?.spaces) ? contents.spaces : null
  if (!spacesList) {
    throw new Error('Invalid backup: the encrypted contents are damaged.')
  }
  if (spacesList.length > MAX_IMPORT_SPACES) {
    throw new Error(`Too many spaces. The maximum allowed is ${MAX_IMPORT_SPACES}.`)
  }

  if (spacesList.some(col => !col || typeof col !== 'object')) {
    throw new Error('Invalid backup: each space must be an object.')
  }
  // Every limit is checked before anything is saved, so a refused backup
  // never leaves part of itself behind.
  const tooFull = spacesList.find(col => Array.isArray(col.items) && col.items.length > MAX_IMPORT_ITEMS_PER_SPACE)
  if (tooFull) {
    const name = typeof tooFull.name === 'string' && tooFull.name.trim() ? tooFull.name.trim() : 'Imported Space'
    throw new Error(`Too many items in space "${name}". The maximum allowed is ${MAX_IMPORT_ITEMS_PER_SPACE}.`)
  }
  if (Array.isArray(contents.items) && contents.items.length > MAX_IMPORT_ITEMS_PER_SPACE) {
    throw new Error(`Too many dashboard items. The maximum allowed is ${MAX_IMPORT_ITEMS_PER_SPACE}.`)
  }

  let itemsImported = 0
  let itemsSkipped = 0
  // Backup position -> new space id, for the sub-spaces that follow.
  const newIds = new Map()

  for (const [index, parentIndex] of nestingOrder(spacesList)) {
    const col = spacesList[index]

    const name = (typeof col.name === 'string' && col.name.trim()
      ? col.name.trim()
      : 'Imported Space'
    ).slice(0, MAX_NAME_LENGTH)
    const description = (typeof col.description === 'string' ? col.description.trim() : '')
      .slice(0, MAX_DESCRIPTION_LENGTH)

    const encryptedCol = await encryptSpace(
      { name, description, tags: parseTags(col.tags) },
      cryptoKey
    )

    const { data: newCol, error: colErr } = await supabase
      .from('spaces')
      .insert({
        name: encryptedCol.name,
        description: encryptedCol.description,
        tags: encryptedCol.tags,
        color: typeof col.color === 'string' ? col.color : null,
        pinned: !!col.pinned,
        locked: col.locked === true,
        parent_id: parentIndex == null ? null : newIds.get(parentIndex) ?? null,
        user_id: userId,
      })
      .select()
      .single()
    if (colErr) throw colErr
    newIds.set(index, newCol.id)

    const items = Array.isArray(col.items) ? col.items : []
    const result = await insertImportedItems(items, newCol.id, userId, cryptoKey)
    itemsImported += result.imported
    itemsSkipped += result.skipped
  }

  // Dashboard items (outside any space).
  if (Array.isArray(contents.items)) {
    const result = await insertImportedItems(contents.items, null, userId, cryptoKey)
    itemsImported += result.imported
    itemsSkipped += result.skipped
  }

  await logAudit({
    action: 'import',
    details: { spaces_count: spacesList.length, items_count: itemsImported, items_skipped: itemsSkipped },
  })

  return { spaces: spacesList.length, items: itemsImported, skipped: itemsSkipped }
}
