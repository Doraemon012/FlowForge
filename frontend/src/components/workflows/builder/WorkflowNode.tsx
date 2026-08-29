import { AlertCircle } from 'lucide-react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import { cn } from '@/lib/utils'
import { summarizeTaskConfig } from './graph-utils'
import type { WorkflowGraphNode } from './types'

export function WorkflowNode({ data, selected }: NodeProps<WorkflowGraphNode>) {
  const { task, typeMeta, validationErrors } = data
  const Icon = typeMeta.icon
  const hasErrors = validationErrors.length > 0

  return (
    <div
      className={cn(
        'relative flex w-52 flex-col rounded-lg border bg-card px-3 py-2.5 shadow-sm transition-colors',
        selected
          ? 'border-ring ring-2 ring-ring/30'
          : 'border-border hover:border-muted-foreground/40',
        hasErrors && 'border-destructive ring-1 ring-destructive/40',
      )}
      data-node-id={task.id}
    >
      <Handle
        type="target"
        position={Position.Left}
        className="!h-3 !w-3 !border-2 !border-background !bg-muted-foreground"
      />
      <div className="flex items-center gap-2">
        <span
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border bg-secondary/60"
          style={{ color: typeMeta.accent }}
        >
          <Icon className="h-4 w-4" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium leading-tight">{typeMeta.label}</p>
          <p className="truncate font-mono text-xs leading-tight text-muted-foreground">
            {task.id}
          </p>
        </div>
      </div>
      <div className="mt-2 rounded border bg-secondary/30 px-2 py-1">
        <p className="truncate font-mono text-[10px] leading-4 text-muted-foreground">
          {summarizeTaskConfig(task)}
        </p>
      </div>
      {hasErrors ? (
        <div className="mt-1.5 flex items-center gap-1 text-destructive">
          <AlertCircle className="h-3 w-3 shrink-0" aria-hidden="true" />
          <span className="text-xs">
            {validationErrors.length} error{validationErrors.length === 1 ? '' : 's'}
          </span>
        </div>
      ) : null}
      <Handle
        type="source"
        position={Position.Right}
        className="!h-3 !w-3 !border-2 !border-background !bg-muted-foreground"
      />
    </div>
  )
}
