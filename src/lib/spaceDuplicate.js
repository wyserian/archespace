import { supabase } from './supabase'
import { encryptSpace } from './dataProtection'
import { descendantsOf } from './spaceTree'

/** Copy a space's active items into another space. */
async function copyItems(fromId, toId, userId) {
  const { data: items, error } = await supabase
    .from('space_items')
    .select('type, title, content, position, pinned, locked')
    .eq('space_id', fromId)
    .is('deleted_at', null)
    .is('archived_at', null)
    .order('position')
  if (error) throw error
  if (!items?.length) return
  const { error: insertErr } = await supabase.from('space_items').insert(
    items.map((item, i) => ({
      space_id: toId,
      user_id: userId,
      type: item.type,
      title: item.title,
      content: item.content,
      position: i,
      pinned: item.pinned,
      locked: !!item.locked,
    }))
  )
  if (insertErr) throw insertErr
}

/**
 * Duplicate a space beside it (same parent), with its active items and its
 * active sub-spaces at every level (and theirs). Only the copy itself is
 * renamed "(copy)"; the sub-spaces keep their names (copied as stored, so
 * still encrypted).
 * @returns {Promise<object>} The new space row (encrypted)
 */
export async function duplicateSpaceWithItems(source, cryptoKey, position) {
  const { data: { session } } = await supabase.auth.getSession()
  const userId = session?.user?.id
  if (!userId) throw new Error('Not authenticated')

  const encCol = await encryptSpace({
    name: `${source.name} (copy)`,
    description: source.description || '',
    tags: source.tags || [],
  }, cryptoKey)

  const { data: newCol, error: colErr } = await supabase
    .from('spaces')
    .insert({
      name: encCol.name,
      description: encCol.description,
      user_id: userId,
      parent_id: source.parent_id ?? null,
      position,
      color: source.color,
      tags: encCol.tags,
      pinned: false,
      // A copy of a protected space stays protected.
      locked: !!source.locked,
    })
    .select()
    .single()
  if (colErr) throw colErr
  await copyItems(source.id, newCol.id, userId)

  const { data: spaces, error: treeErr } = await supabase
    .from('spaces')
    .select('id, parent_id, name, description, tags, color, position, pinned, locked')
    .is('deleted_at', null)
    .is('archived_at', null)
  if (treeErr) throw treeErr
  const byId = new Map((spaces || []).map(s => [s.id, s]))
  // Parents come before their children, so each copy's parent exists.
  const copies = new Map([[source.id, newCol.id]])
  for (const id of descendantsOf([source.id], spaces)) {
    const s = byId.get(id)
    const { data: copy, error } = await supabase
      .from('spaces')
      .insert({
        name: s.name,
        description: s.description,
        user_id: userId,
        parent_id: copies.get(s.parent_id),
        position: s.position,
        color: s.color,
        tags: s.tags,
        pinned: s.pinned,
        locked: !!s.locked,
      })
      .select()
      .single()
    if (error) throw error
    copies.set(id, copy.id)
    await copyItems(id, copy.id, userId)
  }

  return newCol
}
