/**
 * Shared TanStack Query mutation factories for the soft-delete, pin-toggle, and
 * reorder patterns common to `useSpaces` and `useSpaceItems`. Each returns a
 * `useMutation` options object; the caller supplies the table, query key,
 * reorder RPC, and invalidate callback, keeping invalidation scope with the hook.
 */
import { supabase } from '../lib/supabase'

/** Soft-delete a single row by id (sets deleted_at). */
export function makeSoftDelete({ table, invalidate }) {
  return {
    mutationFn: async (id) => {
      const { error } = await supabase
        .from(table)
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: invalidate,
  }
}

/** Soft-delete many rows by id. */
export function makeBulkSoftDelete({ table, invalidate }) {
  return {
    mutationFn: async (ids) => {
      if (!ids?.length) return
      const { error } = await supabase
        .from(table)
        .update({ deleted_at: new Date().toISOString() })
        .in('id', ids)
      if (error) throw error
    },
    onSuccess: invalidate,
  }
}

/** Set the pinned flag on many rows by id. */
export function makeBulkSetPinned({ table, invalidate }) {
  return {
    mutationFn: async ({ ids, pinned }) => {
      if (!ids?.length) return
      const { error } = await supabase
        .from(table)
        .update({ pinned })
        .in('id', ids)
      if (error) throw error
    },
    onSuccess: invalidate,
  }
}

/**
 * Optimistic single-row toggle of a boolean `field`. The mutation takes
 * `{ id, [field]: current }` and writes the opposite value.
 */
export function makeToggleFlag({ table, field, qc, queryKey, invalidate }) {
  return {
    mutationFn: async ({ id, [field]: current }) => {
      const { error } = await supabase
        .from(table)
        .update({ [field]: !current })
        .eq('id', id)
      if (error) throw error
    },
    onMutate: async ({ id, [field]: current }) => {
      await qc.cancelQueries({ queryKey })
      const previous = qc.getQueryData(queryKey)
      qc.setQueryData(queryKey, (old) =>
        old?.map(row => (row.id === id ? { ...row, [field]: !current } : row))
      )
      return { previous }
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) qc.setQueryData(queryKey, context.previous)
    },
    onSettled: invalidate,
  }
}

/** Optimistic single-row pin toggle. */
export function makeTogglePin(options) {
  return makeToggleFlag({ ...options, field: 'pinned' })
}

/**
 * Optimistic single-row star toggle. Starring is a quick-access flag only: it
 * never changes a row's position or sort order.
 */
export function makeToggleStar(options) {
  return makeToggleFlag({ ...options, field: 'starred' })
}

/** Optimistic reorder via an RPC taking { updates: [{ id, position }] }. */
export function makeReorder({ qc, queryKey, rpc, invalidate }) {
  return {
    mutationFn: async (orderedRows) => {
      const updates = orderedRows.map((row, index) => ({ id: row.id, position: index }))
      const { error } = await supabase.rpc(rpc, { updates })
      if (error) throw error
    },
    onMutate: async (orderedRows) => {
      await qc.cancelQueries({ queryKey })
      const previous = qc.getQueryData(queryKey)
      qc.setQueryData(queryKey, orderedRows.map((row, i) => ({ ...row, position: i })))
      return { previous }
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) qc.setQueryData(queryKey, context.previous)
    },
    onSettled: invalidate,
  }
}
