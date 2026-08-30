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
      className="group flex items-center justify-between rounded-xl border border-border/80 bg-card p-4 shadow-sm transition-all duration-150 hover:-translate-y-0.5 hover:border-border hover:shadow-md"
    >
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-border/80 bg-secondary/50 text-muted-foreground transition-colors group-hover:border-primary/30 group-hover:text-primary">
          <PlayCircle className="h-4 w-4" aria-hidden="true" />
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="truncate text-sm font-medium transition-colors group-hover:text-primary">
              {workflowName ?? execution.workflow_id}
            </p>
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
