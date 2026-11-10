/**
 * queryKeys.js - Centralized TanStack Query key definitions.
 *
 * Keeping the keys in one place avoids typo-prone magic strings scattered
 * across hooks and pages, and makes it obvious which caches a change touches.
 * Each is a function returning a fresh array; `items()` doubles as a prefix
 * (no arg) or an exact key for one space (`items(spaceId)`).
 */
export const queryKeys = {
  spaces: () => ['spaces'],
  items: (spaceId) => (spaceId ? ['items', spaceId] : ['items']),
  bin: () => ['bin'],
  archive: () => ['archive'],
  spaceStats: () => ['space-stats'],
  globalSearch: () => ['global-search-data'],
  // Starred items across all spaces (the Starred view), and the sidebar count.
  starredItems: () => ['items', 'starred'],
  starredCount: () => ['starred-count'],
  // Items set to self-destruct (the Self-destruct view), and the sidebar count.
  expiringItems: () => ['items', 'expiring'],
  expiringCount: () => ['expiring-count'],
  // Items with a reminder (the Reminders view), and just their reminders (the
  // sidebar badge, and setting them off).
  reminderItems: () => ['items', 'reminders'],
  reminders: () => ['reminders'],
}
