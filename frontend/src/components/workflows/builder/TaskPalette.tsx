import { useMemo, useState } from 'react'
import { Plus, Search, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { TASK_PALETTE_GROUPS, TASK_TYPE_META, type SupportedTaskType } from './types'

interface TaskPaletteProps {
  onAddTask: (type: SupportedTaskType, position?: { x: number; y: number }) => void
  onClose?: () => void
  className?: string
}

/**
 * The task palette is the entry point to building a workflow, so it leads with
 * what the user is trying to do rather than with a flat list of five equal
 * tiles. Tasks are grouped by intent (data vs. flow) and filterable, and the
 * verbose per-type description is trimmed to a single line so the list stays
 * scannable at the width of the rail.
 */
export function TaskPalette({ onAddTask, onClose, className }: TaskPaletteProps) {
  const [query, setQuery] = useState('')

  const groups = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return TASK_PALETTE_GROUPS
    return TASK_PALETTE_GROUPS.map((group) => ({
      ...group,
      types: group.types.filter((type) => {
        const meta = TASK_TYPE_META[type]
        return (
          meta.label.toLowerCase().includes(needle) ||
          meta.description.toLowerCase().includes(needle) ||
          type.includes(needle)
        )
      }),
    })).filter((group) => group.types.length > 0)
  }, [query])

  const handleDragStart = (event: React.DragEvent<HTMLButtonElement>, type: SupportedTaskType) => {
    event.dataTransfer.setData('application/flowforge-task', type)
    event.dataTransfer.effectAllowed = 'move'
  }

  const hasResults = groups.length > 0

  return (
    <div
      className={cn('flex h-full flex-col overflow-hidden', className)}
      aria-label="Task palette"
    >
      <div className="shrink-0 space-y-2.5 border-b px-3 py-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-display text-sm font-semibold tracking-tight">Add a task</h2>
          {onClose ? (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              aria-label="Hide task palette"
              onClick={onClose}
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </Button>
          ) : null}
        </div>
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Filter tasks…"
            aria-label="Filter task types"
            className="h-8 w-full rounded-md border border-border-strong bg-surface-2 pl-8 pr-2 text-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-accent-dim focus-visible:bg-bg"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-2 py-2">
        {!hasResults ? (
          <p className="px-2 py-6 text-center text-sm text-muted-foreground">
            No task types match &ldquo;{query.trim()}&rdquo;.
          </p>
        ) : (
          groups.map((group, groupIndex) => (
            <section key={group.label} className={cn(groupIndex > 0 && 'mt-3')}>
              <div className="flex items-baseline gap-2 px-2 pb-1.5">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-dim">
                  {group.label}
                </h3>
                <span className="truncate text-xs text-muted-foreground">{group.hint}</span>
              </div>
              <div className="space-y-1">
                {group.types.map((type) => {
                  const meta = TASK_TYPE_META[type]
                  const Icon = meta.icon
                  return (
                    <button
                      key={type}
                      type="button"
                      draggable
                      onDragStart={(event) => handleDragStart(event, type)}
                      onClick={() => onAddTask(type)}
                      className="group flex w-full items-center gap-2.5 rounded-lg border border-transparent px-2 py-2 text-left transition-all hover:border-border/80 hover:bg-surface-2/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      aria-label={`Add ${meta.label} task`}
                    >
                      <span
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-black/5"
                        style={{
                          color: meta.accent,
                          backgroundColor: `color-mix(in oklch, ${meta.accent} 10%, var(--card))`,
                        }}
                      >
                        <Icon className="h-4 w-4" aria-hidden="true" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{meta.label}</span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {meta.description}
                        </span>
                      </span>
                      <Plus
                        className="h-3.5 w-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
                        aria-hidden="true"
                      />
                    </button>
                  )
                })}
              </div>
            </section>
          ))
        )}
      </div>

      <div className="shrink-0 border-t px-3 py-2.5">
        <p className="text-xs leading-relaxed text-muted-foreground">
          Click to place a task, or drag it onto the canvas. Drag between a task&rsquo;s right and
          left handles to set the order.
        </p>
      </div>
    </div>
  )
}
