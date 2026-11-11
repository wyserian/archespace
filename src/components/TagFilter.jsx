/**
 * TagFilter.jsx - A row of tag pills that narrows a list: "All" clears the
 * filter, a tag turns on or off.
 */
const pill = (on) =>
  `text-xs font-medium px-2.5 py-1 rounded-full border transition-colors ${
    on
      ? 'bg-accent-muted border-accent-border text-accent'
      : 'bg-bg-elevated border-transparent text-text-secondary hover:text-text-primary hover:bg-bg-hover'
  }`

export function TagFilter({ tags, active, onClear, onToggle, className = '' }) {
  return (
    <div className={`flex flex-wrap items-center gap-2 ${className}`}>
      <button type="button" onClick={onClear} aria-pressed={active.length === 0} className={pill(active.length === 0)}>
        All
      </button>
      {tags.map(tag => (
        <button
          key={tag}
          type="button"
          onClick={() => onToggle(tag)}
          aria-pressed={active.includes(tag)}
          className={pill(active.includes(tag))}
        >
          {tag}
        </button>
      ))}
    </div>
  )
}
