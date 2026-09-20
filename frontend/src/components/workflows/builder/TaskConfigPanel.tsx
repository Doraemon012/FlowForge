import { ChevronRight, Settings2, Trash2, X } from 'lucide-react'
import type { WorkflowTask } from '@/api/types'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { TaskConnections } from './TaskConnections'
import {
  normalizeFieldValue,
  resolveFieldForTask,
  TaskConfigField,
} from './TaskConfigFields'
import { getTaskTypeMeta, TASK_CONFIG_FIELDS, type SupportedTaskType } from './types'

interface TaskConfigPanelProps {
  task: WorkflowTask | null
  onChange: (patch: Partial<WorkflowTask>) => void
  onDelete: () => void
  onClose: () => void
  incoming?: string[]
  outgoing?: string[]
  onRemoveDependency?: (dependencyId: string) => void
  className?: string
}

/**
 * The task inspector.
 *
 * Fields are split into what the task cannot work without (rendered inline)
 * and everything else (folded behind "Advanced"), because a new user adding an
 * HTTP task needs to see a URL, not credential plumbing. Connections follow,
 * then the destructive action, so the panel reads top-to-bottom as
 * "what is this / how do I set it up / how is it wired / remove it".
 */
export function TaskConfigPanel({
  task,
  onChange,
  onDelete,
  onClose,
  incoming = [],
  outgoing = [],
  onRemoveDependency,
  className,
}: TaskConfigPanelProps) {
  if (!task) {
    return (
      <div
        className={cn(
          'flex h-full flex-col items-center justify-center border-l bg-card p-6 text-center',
          className,
        )}
        aria-label="Task configuration"
      >
        <Settings2 className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
        <p className="mt-3 text-sm font-medium">Select a task</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Choose a task on the canvas to configure it.
        </p>
      </div>
    )
  }

  const meta = getTaskTypeMeta(task.type)
  const Icon = meta.icon
  const allFields = TASK_CONFIG_FIELDS[task.type as SupportedTaskType] ?? []
  const essentialFields = allFields.filter((field) => field.essential)
  const advancedFields = allFields.filter((field) => !field.essential)
  // A type with no `essential` markers (an unknown/custom type) would otherwise
  // render an empty Configuration section, so fall back to showing them inline.
  const inlineFields = essentialFields.length > 0 ? essentialFields : allFields

  const handleFieldChange = (key: string, value: unknown) =>
    onChange({
      config: {
        ...(task.config ?? {}),
        [key]: normalizeFieldValue(task.type, key, value),
      },
    })

  const renderField = (field: (typeof allFields)[number]) => {
    const resolved = resolveFieldForTask(field, task.type, task.config)
    return (
      <TaskConfigField
        key={field.key}
        field={resolved}
        value={task.config?.[field.key]}
        onChange={(value) => handleFieldChange(field.key, value)}
      />
    )
  }

  return (
    <div className={cn('flex h-full flex-col overflow-hidden bg-card', className)}>
      <header className="flex shrink-0 items-center gap-2.5 border-b px-3 py-2.5">
        <span
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-black/5"
          style={{
            color: meta.accent,
            backgroundColor: `color-mix(in oklch, ${meta.accent} 10%, var(--card))`,
          }}
        >
          <Icon className="h-4 w-4" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-sm font-semibold">{meta.label}</h2>
          <p className="truncate font-mono text-xs text-muted-foreground">{task.id}</p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 shrink-0"
          aria-label="Close task configuration"
          onClick={onClose}
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </Button>
      </header>

      <div className="flex-1 space-y-5 overflow-y-auto p-4">
        <section className="space-y-3">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Identity
          </h3>
          <div className="space-y-1.5">
            {/* The required marker sits beside the label, not inside it: text
                inside a <label> becomes part of the control's accessible name,
                so "Task ID *" would no longer be addressable as "Task ID". */}
            <div className="flex items-baseline gap-1">
              <Label htmlFor="task-config-node-id">Task ID</Label>
              <span className="text-xs text-destructive" aria-hidden="true">
                *
              </span>
            </div>
            <Input
              id="task-config-node-id"
              value={task.id}
              onChange={(event) => onChange({ id: event.target.value })}
              aria-invalid={task.id.trim().length === 0}
              aria-required
              className="font-mono"
            />
            <p className="text-xs text-muted-foreground">
              Downstream tasks reference this name. Renaming updates every connection
              automatically.
            </p>
          </div>
        </section>

        {inlineFields.length > 0 ? (
          <section className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Configuration
            </h3>
            {inlineFields.map(renderField)}
          </section>
        ) : null}

        {advancedFields.length > 0 ? (
          <details className="group rounded-lg border border-border/70 bg-muted/20">
            <summary className="flex cursor-pointer list-none items-center gap-1.5 px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground transition-colors hover:text-foreground [&::-webkit-details-marker]:hidden">
              <ChevronRight
                className="h-3.5 w-3.5 transition-transform group-open:rotate-90"
                aria-hidden="true"
              />
              Advanced options
              <span className="ml-auto font-normal normal-case tracking-normal text-muted-foreground">
                {advancedFields.length}
              </span>
            </summary>
            <div className="space-y-3 border-t border-border/70 p-3">
              {advancedFields.map(renderField)}
            </div>
          </details>
        ) : null}

        <TaskConnections
          incoming={incoming}
          outgoing={outgoing}
          onRemoveDependency={onRemoveDependency}
        />
      </div>

      <footer className="shrink-0 border-t p-3">
        <Button variant="destructive" size="sm" className="w-full" onClick={onDelete}>
          <Trash2 className="mr-2 h-4 w-4" aria-hidden="true" />
          Delete task
        </Button>
      </footer>
    </div>
  )
}
