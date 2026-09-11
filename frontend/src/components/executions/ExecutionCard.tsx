import { Link } from 'react-router-dom'
import { ChevronRight, PlayCircle, Square, Wrench } from 'lucide-react'
import { toast } from 'sonner'
import { ApiError } from '@/api/client'
import type { Execution } from '@/api/types'
import { isExecutionActive, useCancelExecution } from '@/hooks/use-executions'
import { cn, formatDateTime } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { ExecutionStatusBadge } from './ExecutionStatusBadge'

interface ExecutionCardProps {
  projectId: string
  execution: Execution
  workflowName?: string
}

/**
 * Deep-link from a failed run straight into the builder with the offending
 * task focused — the same target `RunDiagnosis` links to on the detail page.
 */
function builderTaskLink(projectId: string, workflowId: string, taskId: string): string {
  return `/app/projects/${projectId}/workflows/${workflowId}?task=${encodeURIComponent(taskId)}`
}

export function ExecutionCard({ projectId, execution, workflowName }: ExecutionCardProps) {
  // A failed run should say why, right where the user scans the list. The
  // reason is already part of the execution payload, so this costs no request.
  const isFailed = execution.status === 'failed'
  // The failed task id (when a task actually failed) lets the list offer a
  // one-click route back to the task to fix — no per-execution fetch needed.
  const failedTaskId = isFailed ? execution.failed_task_id : undefined

  // A run that is still pending or running can be stopped from the list, so the
  // user does not have to open it first. Cancel is idempotent on the server, and
  // the hook invalidates the list, so the card settles to "cancelled" on its own.
  const isActive = isExecutionActive(execution.status)
  const cancelMutation = useCancelExecution(execution.id, projectId)

  const handleCancel = async () => {
    try {
      await cancelMutation.mutateAsync()
      toast.success('Run cancelled')
    } catch (error) {
      if (error instanceof ApiError) {
        toast.error(error.message)
      } else {
        toast.error('Could not cancel the run.')
      }
    }
  }

  return (
    <div
      className={cn(
        'group overflow-hidden rounded-lg border border-border bg-surface shadow-surface transition-all duration-150 hover:-translate-y-0.5 hover:border-border-strong hover:shadow-surface-md',
        isFailed && 'border-failed/40 bg-failed/[0.03]',
      )}
    >
      <Link
        to={`/app/projects/${projectId}/executions/${execution.id}`}
        className="flex items-center justify-between p-4"
      >
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-surface-2 text-muted transition-colors group-hover:border-accent-dim group-hover:text-accent">
            <PlayCircle className="h-4 w-4" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <p className="truncate text-sm font-medium transition-colors group-hover:text-accent">
                {workflowName ?? execution.workflow_id}
              </p>
              <ExecutionStatusBadge status={execution.status} />
            </div>
            <p className="mt-0.5 text-xs text-muted">
              Created {formatDateTime(execution.created_at)}
              {execution.completed_at ? ` · Completed ${formatDateTime(execution.completed_at)}` : ''}
            </p>
            {isFailed && execution.failure_reason ? (
              <p
                className="mt-1 line-clamp-2 text-xs text-failed"
                title={execution.failure_reason}
              >
                {execution.failure_reason}
              </p>
            ) : null}
            <p className="truncate font-mono text-xs text-muted">{execution.id}</p>
          </div>
        </div>
        <ChevronRight
          className="h-4 w-4 shrink-0 text-muted transition-transform group-hover:translate-x-0.5"
          aria-hidden="true"
        />
      </Link>

      {failedTaskId ? (
        <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 border-t border-failed/20 bg-failed/[0.04] px-4 py-2">
          <span className="text-xs text-muted">Fix the failing task, then re-run.</span>
          <Link
            to={builderTaskLink(projectId, execution.workflow_id, failedTaskId)}
            className="inline-flex shrink-0 items-center gap-1.5 text-xs font-medium text-accent underline-offset-4 hover:underline"
          >
            <Wrench className="h-3.5 w-3.5" aria-hidden="true" />
            Open <span className="font-mono">{failedTaskId}</span> in builder
          </Link>
        </div>
      ) : null}

      {isActive ? (
        <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 border-t border-border bg-surface-2 px-4 py-2">
          <span className="text-xs text-muted">This run is still active.</span>
          <Button
            variant="outline"
            size="sm"
            onClick={handleCancel}
            loading={cancelMutation.isPending}
            disabled={cancelMutation.isPending}
          >
            <Square className="mr-2 h-3.5 w-3.5" aria-hidden="true" />
            Cancel run
          </Button>
        </div>
      ) : null}
    </div>
  )
}
