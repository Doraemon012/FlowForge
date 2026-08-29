import { Link } from 'react-router-dom'
import { ChevronRight, PlayCircle } from 'lucide-react'
import type { Execution } from '@/api/types'
import { formatDateTime } from '@/lib/utils'
import { ExecutionStatusBadge } from './ExecutionStatusBadge'

interface ExecutionCardProps {
  projectId: string
  execution: Execution
  workflowName?: string
}

export function ExecutionCard({ projectId, execution, workflowName }: ExecutionCardProps) {
  return (
    <Link
      to={`/app/projects/${projectId}/executions/${execution.id}`}
      className="group flex items-center justify-between rounded-lg border bg-card p-4 transition-colors hover:bg-accent/50"
    >
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border bg-secondary/50">
          <PlayCircle className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="truncate text-sm font-medium">{workflowName ?? execution.workflow_id}</p>
            <ExecutionStatusBadge status={execution.status} />
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Created {formatDateTime(execution.created_at)}
            {execution.completed_at ? ` · Completed ${formatDateTime(execution.completed_at)}` : ''}
          </p>
          <p className="truncate font-mono text-xs text-muted-foreground">{execution.id}</p>
        </div>
      </div>
      <ChevronRight
        className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5"
        aria-hidden="true"
      />
    </Link>
  )
}
