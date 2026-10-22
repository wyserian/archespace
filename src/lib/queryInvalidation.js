/**
 * queryInvalidation.js - Shared TanStack Query invalidation helpers.
 */
import { queryKeys } from './queryKeys'

function invalidateKeys(qc, keys) {
  keys.forEach(queryKey => qc.invalidateQueries({ queryKey }))
}

export function invalidateSpaceCollections(qc) {
  invalidateKeys(qc, [
    queryKeys.starredItems(),
    queryKeys.starredCount(),
    queryKeys.reminders(),
    queryKeys.spaces(),
    queryKeys.bin(),
    queryKeys.archive(),
    queryKeys.spaceStats(),
    queryKeys.globalSearch(),
    queryKeys.items(),
  ])
}

export function invalidateSpaceList(qc) {
  invalidateKeys(qc, [
    queryKeys.spaces(),
    queryKeys.globalSearch(),
  ])
}

export function invalidateSpaceItems(qc, spaceId) {
  qc.invalidateQueries({ queryKey: queryKeys.items(spaceId) })
  invalidateItemViews(qc)
}

/** The other views an item shows in, for a change already put in its list. */
export function invalidateItemViews(qc) {
  invalidateKeys(qc, [
    // An item edited anywhere may be starred or have a reminder; keep the
    // Starred and Reminders views in step.
    queryKeys.starredItems(),
    queryKeys.starredCount(),
    queryKeys.reminderItems(),
    queryKeys.reminders(),
    queryKeys.bin(),
    queryKeys.archive(),
    queryKeys.spaceStats(),
    queryKeys.globalSearch(),
  ])
}

export function invalidateArchive(qc) {
  invalidateKeys(qc, [
    queryKeys.archive(),
    queryKeys.starredItems(),
    queryKeys.starredCount(),
    queryKeys.reminders(),
    queryKeys.spaces(),
    queryKeys.items(),
    queryKeys.spaceStats(),
    queryKeys.globalSearch(),
  ])
}

export function invalidateRecycleBin(qc) {
  invalidateKeys(qc, [
    queryKeys.bin(),
    queryKeys.starredItems(),
    queryKeys.starredCount(),
    queryKeys.reminders(),
    queryKeys.spaces(),
    queryKeys.items(),
    queryKeys.spaceStats(),
    queryKeys.globalSearch(),
  ])
}
