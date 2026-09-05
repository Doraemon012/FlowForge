import type { TaskAttempt } from '@/api/types'
import { Badge } from '@/components/ui/badge'
import { formatDateTime } from '@/lib/utils'
import { statusLabel } from './execution-status'

type AttemptVariant = 'success' | 'warning' | 'destructive' | 'info' | 'secondary'

function getAttemptVariant(status: string): AttemptVariant {
  switch (status) {
    case 'succeeded':
      return 'success'
    case 'worker_lost':
      return 'warning'
    case 'failed':
      return 'destructive'
    case 'running':
      return 'info'
    default:
      return 'secondary'
  }
}

function getDotColor(status: string): string {
  switch (status) {
    case 'succeeded':
      return 'var(--success)'
    case 'worker_lost':
      return 'var(--paused)'
    case 'failed':
      return 'var(--failed)'
    case 'running':
      return 'var(--running)'
    default:
      return 'var(--queued)'
  }
}

function attemptHint(status: string): string | null {
  switch (status) {
    case 'worker_lost':
      return 'The worker stopped responding. The task was re-queued automatically.'
    case 'failed':
      return 'This attempt did not complete.'
    case 'running':
      return 'This attempt is still running.'
    default:
      return null
  }
}

function groupByTask(attempts: TaskAttempt[]): Map<string, TaskAttempt[]> {
  const groups = new Map<string, TaskAttempt[]>()
  for (const attempt of attempts) {
    const existing = groups.get(attempt.task_id)
    if (existing) {
      existing.push(attempt)
    } else {
      groups.set(attempt.task_id, [attempt])
    }
  }
  return groups
}

interface AttemptHistoryProps {
  attempts: TaskAttempt[]
}

export function AttemptHistory({ attempts }: AttemptHistoryProps) {
  const groups = groupByTask(attempts)

  if (groups.size === 0) {
    return null
  }

  return (
    <div className="space-y-4">
      {Array.from(groups.entries()).map(([taskId, taskAttempts]) => {
        const last = taskAttempts[taskAttempts.length - 1]
        const recovered =
          taskAttempts.length > 1 && last.status === 'succeeded'

        return (
          <div
            key={taskId}
            className="rounded-lg border border-border bg-surface p-4 shadow-surface"
          >
            <div className="flex items-center justify-between gap-3">
              <span className="truncate font-mono text-sm font-medium">
                {taskId}
              </span>
              <span className="shrink-0 text-xs text-muted">
                {taskAttempts.length} attempt
                {taskAttempts.length === 1 ? '' : 's'}
              </span>
            </div>

            {recovered ? (
              <p className="mt-2 text-sm text-success">
                Recovered after {taskAttempts.length} attempt
                {taskAttempts.length === 1 ? '' : 's'}.
              </p>
            ) : null}

            <div className="mt-4 space-y-4">
              {taskAttempts.map((attempt, index) => {
                const hint = attemptHint(attempt.status)
                const classification = attempt.failure_classification
                  ? statusLabel(attempt.failure_classification)
                  : null
                return (
                  <div key={attempt.id} className="relative pl-5">
                    {index < taskAttempts.length - 1 ? (
                      <span
                        className="absolute left-[5px] top-4 h-full w-px bg-border"
                        aria-hidden="true"
                      />
                    ) : null}
                    <span
                      className="absolute left-0 top-1.5 h-2.5 w-2.5 rounded-full"
                      style={{ background: getDotColor(attempt.status) }}
                      aria-hidden="true"
                    />
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-xs text-muted">
                          Attempt {attempt.attempt_number}
                        </span>
                        <Badge variant={getAttemptVariant(attempt.status)}>
                          {statusLabel(attempt.status)}
                        </Badge>
                        {classification ? (
                          <Badge
                            variant={
                              attempt.failure_classification === 'terminal'
                                ? 'destructive'
                                : 'warning'
                            }
                          >
                            {classification}
                          </Badge>
                        ) : null}
                      </div>
                      {attempt.worker_id ? (
                        <p className="text-xs text-muted">
                          Worker: {attempt.worker_id}
                        </p>
                      ) : null}
                      <p className="text-xs text-muted">
                        Started {formatDateTime(attempt.started_at)}
                        {attempt.completed_at
                          ? ` · Completed ${formatDateTime(attempt.completed_at)}`
                          : ''}
                      </p>
                      {attempt.failure_reason ? (
                        <p className="text-xs text-failed">
                          {attempt.failure_reason}
                        </p>
                      ) : null}
                      {hint ? (
                        <p className="text-xs text-muted">{hint}</p>
                      ) : null}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}
