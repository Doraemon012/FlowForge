import type { TaskRun } from '@/api/types'
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
}

export function TaskRunItem({ taskRun }: TaskRunItemProps) {
  const output = formatOutput(taskRun.output)
  const failure = taskRun.failure_reason

  return (
    <div className="rounded-xl border border-border/80 bg-card p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate font-mono text-sm font-medium">{taskRun.task_id}</span>
          <TaskRunStatusBadge status={taskRun.status} />
        </div>
        <span className="shrink-0 text-xs text-muted-foreground">
          {formatDateTime(taskRun.created_at)}
        </span>
      </div>
      <div className="mt-3 space-y-2 text-sm">
        {taskRun.started_at ? (
          <p className="text-muted-foreground">Started {formatDateTime(taskRun.started_at)}</p>
        ) : null}
        {taskRun.completed_at ? (
          <p className="text-muted-foreground">
            Completed {formatDateTime(taskRun.completed_at)}
          </p>
        ) : null}
        {failure ? (
          <p className="text-destructive">
            <span className="font-medium">Failure:</span> {failure}
          </p>
        ) : null}
        {output ? (
          <div>
            <p className="mb-1 font-medium text-muted-foreground">Output</p>
            <pre className="max-h-56 overflow-auto rounded-lg border border-border/60 bg-muted/50 p-3 font-mono text-xs leading-relaxed text-muted-foreground">{output}</pre>
          </div>
        ) : null}
      </div>
    </div>
  )
}
