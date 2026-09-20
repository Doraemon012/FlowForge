import { useState } from 'react'
import {
  AlertCircle,
  CheckCircle2,
  ChevronUp,
  CircleDashed,
  Loader2,
  ShieldAlert,
  ShieldCheck,
} from 'lucide-react'
import type { WorkflowReviewWarning } from '@/api/types'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { taskIdFromValidationError } from './graph-utils'

interface BuilderStatusBarProps {
  taskCount: number
  connectionCount: number
  validationErrors: string[]
  validationMessage: string | null
  reviewWarnings: WorkflowReviewWarning[]
  hasChanges: boolean
  isValidating: boolean
  runBlockedReason: string | null
  onValidate: () => void
  /** Select and centre the task an error belongs to. */
  onFocusTask: (taskId: string) => void
}

/**
 * The builder's own status line.
 *
 * Validation used to report itself as a bare count in the header ("Workflow
 * validation failed (2 errors)") while the messages lived only on the offending
 * nodes, so the user had to hunt the canvas. This bar keeps the definition's
 * shape, save state, validation result and run eligibility visible at all
 * times, and turns failures into a clickable list that jumps to the node.
 */
export function BuilderStatusBar({
  taskCount,
  connectionCount,
  validationErrors,
  validationMessage,
  reviewWarnings,
  hasChanges,
  isValidating,
  runBlockedReason,
  onValidate,
  onFocusTask,
}: BuilderStatusBarProps) {
  const [problemsOpen, setProblemsOpen] = useState(false)
  const errorCount = validationErrors.length
  const isInvalid = errorCount > 0
  const isValidated = !hasChanges && !isInvalid && Boolean(validationMessage)

  return (
    <div className="shrink-0 border-t bg-surface text-xs">
      {problemsOpen && isInvalid ? (
        <div className="max-h-56 overflow-y-auto border-b bg-surface-2/60 px-3 py-2">
          <ul className="space-y-1">
            {validationErrors.map((error, index) => {
              const taskId = taskIdFromValidationError(error)
              return (
                <li key={`${error}-${index}`}>
                  {taskId ? (
                    <button
                      type="button"
                      onClick={() => onFocusTask(taskId)}
                      className="flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-surface-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <AlertCircle
                        className="mt-0.5 h-3.5 w-3.5 shrink-0 text-destructive"
                        aria-hidden="true"
                      />
                      <span className="min-w-0 flex-1 break-words leading-relaxed text-foreground">
                        {error}
                      </span>
                      <span className="shrink-0 font-mono text-muted-foreground">
                        {taskId} &rarr;
                      </span>
                    </button>
                  ) : (
                    <div className="flex items-start gap-2 px-2 py-1.5">
                      <AlertCircle
                        className="mt-0.5 h-3.5 w-3.5 shrink-0 text-destructive"
                        aria-hidden="true"
                      />
                      <span className="min-w-0 flex-1 break-words leading-relaxed text-foreground">
                        {error}
                      </span>
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
          {reviewWarnings.length > 0 ? (
            <ul className="mt-2 space-y-1 border-t pt-2">
              {reviewWarnings.map((warning, index) => (
                <li
                  key={`${warning.code}-${index}`}
                  className="flex items-start gap-2 px-2 py-1 text-muted-foreground"
                >
                  <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" aria-hidden="true" />
                  <span className="min-w-0 flex-1 leading-relaxed">{warning.message}</span>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-1.5">
        {isInvalid ? (
          <button
            type="button"
            onClick={() => setProblemsOpen((open) => !open)}
            aria-expanded={problemsOpen}
            className="inline-flex items-center gap-1.5 rounded-md px-1.5 py-0.5 font-medium text-destructive transition-colors hover:bg-destructive/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <AlertCircle className="h-3.5 w-3.5" aria-hidden="true" />
            {errorCount} problem{errorCount === 1 ? '' : 's'}
            <ChevronUp
              className={cn('h-3 w-3 transition-transform', !problemsOpen && 'rotate-180')}
              aria-hidden="true"
            />
          </button>
        ) : isValidated ? (
          <span
            role="status"
            className="inline-flex items-center gap-1.5 px-1.5 font-medium text-success"
          >
            <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
            Valid
          </span>
        ) : (
          <span role="status" className="inline-flex items-center gap-1.5 px-1.5 text-muted-foreground">
            <CircleDashed className="h-3.5 w-3.5" aria-hidden="true" />
            Not validated
          </span>
        )}

        {isValidating ? (
          <span className="inline-flex items-center gap-1.5 text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
            Checking…
          </span>
        ) : null}

        <span className="font-mono text-muted-foreground">
          {taskCount} task{taskCount === 1 ? '' : 's'} &middot; {connectionCount} connection
          {connectionCount === 1 ? '' : 's'}
        </span>

        {hasChanges ? (
          <span role="status" className="inline-flex items-center gap-1.5 text-warning">
            <span className="h-1.5 w-1.5 rounded-full bg-warning" aria-hidden="true" />
            Unsaved changes
          </span>
        ) : null}

        <span className="grow" />

        {runBlockedReason ? (
          <span role="status" className="text-muted-foreground">
            Run unavailable &mdash; {runBlockedReason.toLowerCase()}
          </span>
        ) : (
          <span role="status" className="inline-flex items-center gap-1.5 text-success">
            <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
            Ready to run
          </span>
        )}

        <Button
          variant="ghost"
          size="xs"
          onClick={onValidate}
          loading={isValidating}
          title="Check the current definition without saving it"
        >
          <ShieldCheck className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
          Validate
        </Button>
      </div>
    </div>
  )
}
