/**
 * spaceTree.js - Spaces nest to any depth through `parent_id`. These walk a
 * space's ancestors or descendants, and stop at a parent loop (which the app
 * never creates, but a bad row mustn't hang it).
 */

/**
 * A space and the spaces above it, nearest first: [id, parent, grandparent,
 * ...]. `parentOf(id)` gives a space's parent id, or null at the top.
 */
export function chainOf(id, parentOf) {
  const chain = []
  const seen = new Set()
  for (let at = id; at && !seen.has(at); at = parentOf(at) ?? null) {
    seen.add(at)
    chain.push(at)
  }
  return chain
}

/** The spaces above a space, nearest first (not the space itself). */
export function ancestorsOf(id, parentOf) {
  return chainOf(id, parentOf).slice(1)
}

/**
 * Every space below `ids` (not `ids` themselves), from `spaces` rows with
 * `id` and `parent_id`. `include(space)` can stop the walk at a space (it
 * and everything under it are left out).
 */
export function descendantsOf(ids, spaces, include = () => true) {
  const children = new Map()
  for (const s of spaces || []) {
    if (!s.parent_id) continue
    if (!children.has(s.parent_id)) children.set(s.parent_id, [])
    children.get(s.parent_id).push(s)
  }
  const out = []
  const seen = new Set(ids)
  const queue = [...ids]
  while (queue.length) {
    for (const child of children.get(queue.shift()) || []) {
      if (seen.has(child.id) || !include(child)) continue
      seen.add(child.id)
      out.push(child.id)
      queue.push(child.id)
    }
  }
  return out
}

/** A space's path from the top: [root, ..., parent, space] (rows). */
export function pathOf(id, spacesById) {
  return chainOf(id, at => spacesById.get(at)?.parent_id)
    .map(at => spacesById.get(at))
    .filter(Boolean)
    .reverse()
}

/**
 * Spaces in tree order, each followed by its sub-spaces (by position), with
 * their depth: [{ space, depth }]. A space whose parent isn't in the list
 * counts as top level.
 */
export function treeOrder(spaces) {
  const ids = new Set(spaces.map(s => s.id))
  const children = new Map()
  for (const s of spaces) {
    const parent = ids.has(s.parent_id) ? s.parent_id : null
    if (!children.has(parent)) children.set(parent, [])
    children.get(parent).push(s)
  }
  for (const list of children.values()) list.sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
  const out = []
  const seen = new Set()
  const visit = (parent, depth) => {
    for (const space of children.get(parent) || []) {
      if (seen.has(space.id)) continue
      seen.add(space.id)
      out.push({ space, depth })
      visit(space.id, depth + 1)
    }
  }
  visit(null, 0)
  return out
}

/**
 * The spaces something can move into, in tree order: all but `exclude` (a Set
 * of ids) and read-only ones, which take nothing new.
 */
export function moveDestinations(spaces, exclude = new Set()) {
  return treeOrder(spaces).filter(({ space }) => !exclude.has(space.id) && !space.read_only)
}

/**
 * Each space's count with the counts of every space below it added in.
 * `counts` maps a space id to its own count; the result has every space in
 * `spaces` (rows with `id` and `parent_id`), and leaves out counts of spaces
 * not among them.
 */
export function rollUpCounts(counts, spaces) {
  const byId = new Map(spaces.map(s => [s.id, s]))
  const totals = Object.fromEntries(spaces.map(s => [s.id, 0]))
  for (const [id, count] of Object.entries(counts)) {
    if (!byId.has(id)) continue
    for (const at of chainOf(id, x => byId.get(x)?.parent_id)) {
      if (at in totals) totals[at] += count
    }
  }
  return totals
}

/**
 * Where a space sits, for labels: "A › B › C", folded to "A › … › D" when
 * it's deeper than three levels.
 */
export function spacePathLabel(id, spacesById) {
  const names = pathOf(id, spacesById).map(s => s.name || 'Untitled')
  return names.length > 3 ? `${names[0]} › … › ${names.at(-1)}` : names.join(' › ')
}
