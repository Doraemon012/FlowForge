import { Check, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export interface SetupStep {
  id: string
  label: string
  hint: string
  done: boolean
  /** Offered inline for the step the user is currently on. */
  actionLabel?: string
  onAction?: () => void
}

interface SetupProgressProps {
  steps: SetupStep[]
  onDismiss: () => void
}

/**
 * The builder-scoped counterpart to `WorkflowGuide` (which stays on the
 * Projects page as the product-wide checklist).
 *
 * In the builder, a nine-step popover behind a button was the wrong shape: two
 * of its steps were hardcoded as complete, and reaching it cost a click at the
 * exact moment the user needed to know what to do next. This strip shows the
 * same journey inline, derived entirely from builder state, with the *next*
 * unfinished step highlighted and its action available right there — so the
 * answer to "what do I do now?" is on screen instead of behind a click.
 */
export function SetupProgress({ steps, onDismiss }: SetupProgressProps) {
  const completed = steps.filter((step) => step.done).length
  const current = steps.find((step) => !step.done)

  return (
    <div className="shrink-0 border-b bg-surface-2/50">
      <div className="flex items-center gap-3 px-3 py-2">
        <span className="shrink-0 text-xs font-semibold text-muted-foreground">
          Setup
          <span className="ml-1.5 font-mono font-normal">
            {completed}/{steps.length}
          </span>
        </span>
        <ol
          className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto"
          aria-label="Workflow setup progress"
        >
          {steps.map((step) => (
            <li key={step.id} className="shrink-0">
              <span
                className={cn(
                  'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2 py-0.5 text-xs',
                  step.done
                    ? 'border-success/30 bg-success/10 text-success'
                    : step.id === current?.id
                      ? 'border-accent-dim bg-accent/10 font-medium text-foreground'
                      : 'border-border text-muted-foreground',
                )}
                aria-current={step.id === current?.id ? 'step' : undefined}
              >
                {step.done ? (
                  <Check className="h-3 w-3" aria-hidden="true" />
                ) : (
                  <span
                    className={cn(
                      'h-1.5 w-1.5 rounded-full',
                      step.id === current?.id ? 'bg-accent' : 'bg-muted-foreground/50',
                    )}
                    aria-hidden="true"
                  />
                )}
                {step.label}
              </span>
            </li>
          ))}
        </ol>

        {current?.actionLabel && current.onAction ? (
          <Button
            size="xs"
            variant="secondary"
            className="shrink-0"
            onClick={current.onAction}
          >
            {current.actionLabel}
          </Button>
        ) : null}
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 shrink-0"
          aria-label="Dismiss setup progress"
          onClick={onDismiss}
        >
          <X className="h-3.5 w-3.5" aria-hidden="true" />
        </Button>
      </div>

      {current ? (
        <p className="px-3 pb-2 text-xs text-muted-foreground">{current.hint}</p>
      ) : null}
    </div>
  )
}
