import { Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { SUPPORTED_TASK_TYPES, TASK_TYPE_META, type SupportedTaskType } from './types'

interface CanvasEmptyStateProps {
  onAddTask: (type: SupportedTaskType) => void
  onOpenAi?: () => void
}

/**
 * What a blank workflow shows instead of an empty grid.
 *
 * Previously the only instruction on an empty canvas lived in the footer of the
 * task palette, which is off-screen at narrow widths and easy to miss at any
 * width. Leading with the five task types as large click targets turns the
 * emptiest state in the product into the most obvious next step.
 */
export function CanvasEmptyState({ onAddTask, onOpenAi }: CanvasEmptyStateProps) {
  return (
    <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center p-4">
      {/* `max-h-full` + `overflow-y-auto`: on a short viewport the card is
          taller than the canvas, and without a height cap it centred itself
          past both edges and was covered by the status bar. */}
      <div className="pointer-events-auto max-h-full w-full max-w-lg overflow-y-auto rounded-2xl border border-border/80 bg-card/95 p-5 text-center shadow-surface-lg backdrop-blur-sm">
        <h2 className="font-display text-lg font-semibold tracking-tight">
          Start with your first task
        </h2>
        <p className="mx-auto mt-1.5 max-w-sm text-sm leading-relaxed text-muted-foreground">
          Pick a task to place on the canvas, then connect tasks to set the order they run in.
        </p>

        <ul className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {SUPPORTED_TASK_TYPES.map((type) => {
            const meta = TASK_TYPE_META[type]
            const Icon = meta.icon
            return (
              <li key={type}>
                <button
                  type="button"
                  onClick={() => onAddTask(type)}
                  className="group flex h-full w-full flex-col items-center gap-1.5 rounded-xl border border-border/80 bg-surface px-3 py-3 text-center transition-all hover:-translate-y-0.5 hover:border-accent-dim hover:shadow-surface-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span
                    className="flex h-9 w-9 items-center justify-center rounded-lg border border-black/5"
                    style={{
                      color: meta.accent,
                      backgroundColor: `color-mix(in oklch, ${meta.accent} 12%, var(--card))`,
                    }}
                  >
                    <Icon className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <span className="text-sm font-medium leading-tight">{meta.label}</span>
                </button>
              </li>
            )
          })}
        </ul>

        {onOpenAi ? (
          <div className="mt-4 border-t border-border/70 pt-3.5">
            <Button variant="ghost" size="sm" onClick={onOpenAi}>
              <Sparkles className="mr-2 h-4 w-4" aria-hidden="true" />
              Or describe it and let AI build it
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  )
}
