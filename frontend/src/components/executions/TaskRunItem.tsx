import type { TaskAttempt, TaskRun } from '@/api/types'
import { formatDateTime } from '@/lib/utils'
import { TaskRunStatusBadge } from './TaskRunStatusBadge'

function formatOutput(output: unknown): string | null {
  if (output == null) return null
  try {
    return JSON.stringify(output, null, 2)
  } catch {
    return String(output)
  }
}

interface TaskRunItemProps {
  taskRun: TaskRun
  attempts?: TaskAttempt[]
}

function statusExplanation(status: string): string {
  switch (status) {
    case 'pending':
      return 'Waiting for the orchestrator to evaluate dependencies.'
    case 'queued':
      return 'Queued and waiting for an available worker.'
    case 'leased':
      return 'A worker has claimed this task and is preparing to run it.'
    case 'running':
      return 'A worker is executing this task.'
    case 'retry_scheduled':
      return 'This task will be attempted again after its retry backoff.'
    case 'blocked':
      return 'Blocked because a required dependency did not succeed.'
    case 'succeeded':
      return 'Completed successfully. The result is shown below.'
    case 'failed':
      return 'No more retries are available, or the failure is not retryable.'
    default:
      return ''
  }
}

export function TaskRunItem({ taskRun, attempts = [] }: TaskRunItemProps) {
  const output = formatOutput(taskRun.output)
  const failure = taskRun.failure_reason
  const latestAttempt = attempts[attempts.length - 1]
  const explanation = statusExplanation(taskRun.status)

  return (
    <div className="rounded-lg border border-border bg-surface p-4 shadow-surface">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate font-mono text-sm font-medium">{taskRun.task_id}</span>
          <TaskRunStatusBadge status={taskRun.status} />
        </div>
        <span className="shrink-0 text-xs text-muted">{formatDateTime(taskRun.created_at)}</span>
      </div>
      <div className="mt-3 space-y-2 text-sm">
        {explanation ? <p className="text-muted">{explanation}</p> : null}
        {latestAttempt?.worker_id ? (
          <p className="text-muted">
            Worker <span className="font-mono">{latestAttempt.worker_id}</span>
            {attempts.length > 1 ? ` · Attempt ${latestAttempt.attempt_number} of ${attempts.length}` : ''}
          </p>
        ) : null}
        {taskRun.started_at ? (
          <p className="text-muted">Started {formatDateTime(taskRun.started_at)}</p>
        ) : null}
        {taskRun.completed_at ? (
          <p className="text-muted">Completed {formatDateTime(taskRun.completed_at)}</p>
        ) : null}
        {failure ? (
          <p className="text-failed">
            <span className="font-medium">Failure:</span> {failure}
          </p>
        ) : null}
        {output ? (
          <div>
            <p className="mb-1 font-medium text-muted">Output</p>
            <pre className="max-h-56 overflow-auto rounded-lg border border-border bg-bg p-3 font-mono text-xs leading-relaxed text-muted">
              {output}
            </pre>
          </div>
        ) : null}
      </div>
    </div>
  )
}
