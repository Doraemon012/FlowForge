import { AlertCircle } from 'lucide-react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import { cn } from '@/lib/utils'
import { summarizeTaskConfig } from './graph-utils'
import type { WorkflowGraphNode } from './types'

export function WorkflowNode({ data, selected }: NodeProps<WorkflowGraphNode>) {
  const { task, typeMeta, validationErrors } = data
  const Icon = typeMeta.icon
  const hasErrors = validationErrors.length > 0
  const accent = typeMeta.accent

  return (
    <div
      className={cn(
        'relative flex w-56 flex-col rounded-xl border bg-card px-3.5 py-3 shadow-sm transition-all duration-150',
        selected
          ? 'border-primary/50 shadow-md ring-2 ring-primary/20'
          : 'border-border/80 hover:border-muted-foreground/30 hover:shadow-md',
        hasErrors && 'border-destructive/50 ring-1 ring-destructive/25',
      )}
      data-node-id={task.id}
    >
      <span
        className="absolute inset-y-3 left-0 w-1 rounded-r-full"
        style={{ backgroundColor: accent }}
        aria-hidden="true"
      />

      <Handle
        type="target"
        position={Position.Left}
        className="!h-3 !w-3 !border-2 !border-background !bg-muted-foreground"
      />
      <div className="flex items-center gap-2.5">
        <span
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-black/5"
          style={{
            color: accent,
            backgroundColor: `color-mix(in oklch, ${accent} 10%, var(--card))`,
          }}
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
      <div className="mt-2.5 rounded-lg border border-border/70 bg-muted/40 px-2.5 py-1.5">
        <p
          className={cn(
            'truncate font-mono text-[11px] leading-4',
            summarizeTaskConfig(task) === 'Not configured'
              ? 'italic text-muted-foreground/70'
              : 'text-muted-foreground',
          )}
        >
          {summarizeTaskConfig(task)}
        </p>
      </div>
      {hasErrors ? (
        <div className="mt-2 space-y-1 border-t border-destructive/20 pt-2">
          {validationErrors.slice(0, 2).map((error, index) => (
            <div key={index} className="flex items-start gap-1.5 text-destructive">
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span className="min-w-0 break-words text-[11px] leading-4" title={error}>
                {error}
              </span>
            </div>
          ))}
          {validationErrors.length > 2 ? (
            <p className="pl-5 text-[11px] font-medium text-destructive/80">
              +{validationErrors.length - 2} more error
              {validationErrors.length - 2 === 1 ? '' : 's'}
            </p>
          ) : null}
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
