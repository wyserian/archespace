/**
 * spaceLifecycle.js - Deleting, archiving and restoring spaces as whole
 * subtrees (spaces nest to any depth). Each step first reads the user's space
 * tree (ids, parents and dates only), so it reaches every level.
 *
 * - Deleting or archiving a space takes its active sub-spaces with it, at the
 *   same moment; ones already archived or deleted keep their own state.
 * - Restoring or unarchiving brings back what went with it (the same moment),
 *   and any removed space above it, so it reappears where it was. Those
 *   spaces' other contents stay where they are.
 */
import { supabase } from './supabase'
import { ancestorsOf, chainOf, descendantsOf } from './spaceTree'

const isActive = s => !s.deleted_at && !s.archived_at

async function loadTree() {
  const { data, error } = await supabase.from('spaces').select('id, parent_id, deleted_at, archived_at')
  if (error) throw error
  const tree = data || []
  return { tree, byId: new Map(tree.map(s => [s.id, s])) }
}

async function check(request) {
  const { error } = await request
  if (error) throw error
}

/** `ids` and their active sub-spaces, at every level. */
function withActiveDescendants(ids, tree) {
  return [...new Set([...ids, ...descendantsOf(ids, tree, isActive)])]
}

/** The spaces that went with each root: those removed at the same moment. */
function removedWith(ids, tree, byId, field) {
  const groups = new Map() // timestamp -> space ids
  for (const id of ids) {
    const at = byId.get(id)?.[field]
    if (!at) continue
    const same = descendantsOf([id], tree, s => s[field] === at)
    groups.set(at, [...(groups.get(at) || []), id, ...same])
  }
  return groups
}

/**
 * Bring back any removed space above `spaceIds` (only those spaces), and with
 * `includeSelf` the spaces themselves.
 */
async function reviveAncestors(spaceIds, byId, { includeSelf = false } = {}) {
  const parentOf = id => byId.get(id)?.parent_id
  const deleted = new Set()
  const archived = new Set()
  for (const id of spaceIds) {
    for (const up of includeSelf ? chainOf(id, parentOf) : ancestorsOf(id, parentOf)) {
      const s = byId.get(up)
      if (s?.deleted_at) deleted.add(up)
      if (s?.archived_at) archived.add(up)
    }
  }
  if (deleted.size) {
    await check(supabase.from('spaces').update({ deleted_at: null }).in('id', [...deleted]))
  }
  for (const id of archived) {
    const at = byId.get(id).archived_at
    await check(supabase.from('spaces').update({ archived_at: null }).eq('id', id))
    await check(supabase.from('space_items').update({ archived_at: null }).eq('space_id', id).eq('archived_at', at))
  }
}

/** Move spaces (and their active sub-spaces) to the recycle bin. */
export async function deleteSpaces(ids) {
  const { tree } = await loadTree()
  const spaceIds = withActiveDescendants(ids, tree)
  await check(supabase.from('spaces').update({ deleted_at: new Date().toISOString() }).in('id', spaceIds))
}

/** Archive spaces, their active sub-spaces, and the items in them. */
export async function archiveSpaces(ids) {
  const { tree } = await loadTree()
  const spaceIds = withActiveDescendants(ids, tree)
  const now = new Date().toISOString()
  await check(supabase.from('spaces').update({ archived_at: now }).in('id', spaceIds))
  await check(supabase.from('space_items').update({ archived_at: now })
    .in('space_id', spaceIds).is('deleted_at', null).is('archived_at', null))
}

/** Restore spaces from the bin, with what was deleted along with them. */
export async function restoreSpaces(ids) {
  const { tree, byId } = await loadTree()
  const spaceIds = [...removedWith(ids, tree, byId, 'deleted_at').values()].flat()
  if (!spaceIds.length) return
  await check(supabase.from('spaces').update({ deleted_at: null }).in('id', spaceIds))
  await reviveAncestors(ids, byId)
}

/** Unarchive spaces, with the sub-spaces and items archived along with them. */
export async function unarchiveSpaces(ids) {
  const { tree, byId } = await loadTree()
  for (const [at, spaceIds] of removedWith(ids, tree, byId, 'archived_at')) {
    await check(supabase.from('spaces').update({ archived_at: null }).in('id', spaceIds))
    await check(supabase.from('space_items').update({ archived_at: null })
      .in('space_id', spaceIds).eq('archived_at', at))
  }
  await reviveAncestors(ids, byId)
}

/** Move archived spaces (with what was archived along with them) to the bin. */
export async function binArchivedSpaces(ids) {
  const { tree, byId } = await loadTree()
  const now = new Date().toISOString()
  const removed = { deleted_at: now, archived_at: null }
  for (const [at, spaceIds] of removedWith(ids, tree, byId, 'archived_at')) {
    await check(supabase.from('spaces').update(removed).in('id', spaceIds))
    await check(supabase.from('space_items').update(removed).in('space_id', spaceIds).eq('archived_at', at))
  }
}

/** Bring back the removed spaces above restored items, so they show again. */
export async function reviveItemSpaces(itemIds) {
  const { data, error } = await supabase.from('space_items').select('space_id').in('id', itemIds)
  if (error) throw error
  const spaceIds = [...new Set((data || []).map(i => i.space_id).filter(Boolean))]
  if (!spaceIds.length) return
  const { byId } = await loadTree()
  await reviveAncestors(spaceIds, byId, { includeSelf: true })
}
