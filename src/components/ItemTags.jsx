/**
 * ItemTags.jsx - Inline tag chips + add input for an item. Tags are encrypted
 * with the rest of the item, so they stay zero-knowledge. onChange receives the
 * full next array; callers persist it. The add input shows while `adding` (the
 * card's menu opens it) and `onAddingChange(false)` closes it.
 */
import { useState } from 'react'
import { X } from 'lucide-react'

export function ItemTags({ tags = [], onChange, disabled = false, adding = false, onAddingChange }) {
  const [value, setValue] = useState('')
  const setAdding = (next) => onAddingChange?.(next)

  const commit = () => {
    const next = value.split(',').map(t => t.trim()).filter(Boolean)
    setValue('')
    setAdding(false)
    if (next.length === 0) return
    const merged = Array.from(new Set([...tags, ...next]))
    if (merged.length !== tags.length) onChange(merged)
  }

  const remove = (tag) => onChange(tags.filter(t => t !== tag))

  // Read-only with no tags: render nothing (keeps collapsed/offline cards clean).
  if (disabled && tags.length === 0) return null

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {tags.map(tag => (
        <span
          key={tag}
          className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-md bg-bg-elevated text-text-muted border border-bg-border"
        >
          {tag}
          {!disabled && (
            <button
              type="button"
              onClick={() => remove(tag)}
              aria-label={`Remove tag ${tag}`}
              className="text-text-muted hover:text-danger transition-colors"
            >
              <X size={11} />
            </button>
          )}
        </span>
      ))}

      {!disabled && adding && (
        <input
          autoFocus
          value={value}
          onChange={e => setValue(e.target.value)}
          onBlur={commit}
          onKeyDown={e => {
            if (e.key === 'Enter') { e.preventDefault(); commit() }
            else if (e.key === 'Escape') { setValue(''); setAdding(false) }
          }}
          placeholder="tag"
          aria-label="New tag"
          maxLength={32}
          className="w-20 text-[11px] px-2 py-0.5 rounded-md bg-bg-elevated border border-accent/40 text-text-primary placeholder-text-muted focus:outline-none"
        />
      )}
    </div>
  )
}
