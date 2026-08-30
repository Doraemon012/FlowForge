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
      className="group flex items-center justify-between rounded-lg border border-border bg-surface p-4 shadow-surface transition-all duration-150 hover:-translate-y-0.5 hover:border-border-strong hover:shadow-surface-md"
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
          <p className="truncate font-mono text-xs text-muted">{execution.id}</p>
        </div>
      </div>
      <ChevronRight
        className="h-4 w-4 shrink-0 text-muted transition-transform group-hover:translate-x-0.5"
        aria-hidden="true"
      />
    </Link>
  )
}
