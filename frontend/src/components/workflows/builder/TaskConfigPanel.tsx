import { Settings2, Trash2, X } from 'lucide-react'
import type { WorkflowTask } from '@/api/types'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { getTaskTypeMeta, TASK_CONFIG_FIELDS, type ConfigFieldSpec, type SupportedTaskType } from './types'

interface TaskConfigPanelProps {
  task: WorkflowTask | null
  onChange: (patch: Partial<WorkflowTask>) => void
  onDelete: () => void
  onClose: () => void
  className?: string
}

export function TaskConfigPanel({
  task,
  onChange,
  onDelete,
  onClose,
  className,
}: TaskConfigPanelProps) {
  if (!task) {
    return (
      <div
        className={cn('flex h-full flex-col items-center justify-center border-l bg-card p-6 text-center', className)}
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
  const fields = TASK_CONFIG_FIELDS[task.type as SupportedTaskType] ?? []

  return (
    <div className={cn('flex h-full flex-col overflow-hidden bg-card', className)}>
      <div className="flex items-center justify-between border-b p-3">
        <div className="flex items-center gap-2">
          <span
            className="flex h-7 w-7 items-center justify-center rounded-md border bg-secondary/60"
            style={{ color: meta.accent }}
          >
            <Icon className="h-4 w-4" aria-hidden="true" />
          </span>
          <div>
            <h2 className="text-sm font-semibold">Configure task</h2>
            <p className="font-mono text-xs text-muted-foreground">{task.id}</p>
          </div>
        </div>
        <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Close task configuration" onClick={onClose}>
          <X className="h-4 w-4" aria-hidden="true" />
        </Button>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        <div className="space-y-1.5">
          <Label htmlFor="task-config-node-id">Task ID</Label>
          <Input
            id="task-config-node-id"
            value={task.id}
            onChange={(event) => onChange({ id: event.target.value })}
            aria-invalid={task.id.trim().length === 0}
          />
          <p className="text-xs text-muted-foreground">
            Used to reference this task from downstream dependencies.
          </p>
        </div>

        {fields.map((field) => (
          <ConfigField
            key={field.key}
            field={field}
            value={task.config?.[field.key]}
            onChange={(value) =>
              onChange({ config: { ...(task.config ?? {}), [field.key]: value } })
            }
          />
        ))}
      </div>

      <div className="border-t p-3">
        <Button variant="destructive" size="sm" className="w-full" onClick={onDelete}>
          <Trash2 className="mr-2 h-4 w-4" aria-hidden="true" />
          Delete task
        </Button>
      </div>
    </div>
  )
}

interface ConfigFieldProps {
  field: ConfigFieldSpec
  value: unknown
  onChange: (value: unknown) => void
}

function ConfigField({ field, value, onChange }: ConfigFieldProps) {
  const id = `task-config-${field.key}`
  const current = value ?? ''

  const help = field.help ? (
    <p className="text-xs text-muted-foreground">{field.help}</p>
  ) : null

  if (field.type === 'select') {
    return (
      <div className="space-y-1.5">
        <Label htmlFor={id}>
          {field.label}
          {field.required ? <span className="text-destructive"> *</span> : null}
        </Label>
        <select
          id={id}
          value={String(current)}
          onChange={(event) => onChange(event.target.value)}
          className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={field.label}
        >
          {field.options?.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
        {help}
      </div>
    )
  }

  if (field.type === 'textarea') {
    return (
      <div className="space-y-1.5">
        <Label htmlFor={id}>
          {field.label}
          {field.required ? <span className="text-destructive"> *</span> : null}
        </Label>
        <textarea
          id={id}
          value={String(current)}
          onChange={(event) => onChange(event.target.value)}
          placeholder={field.placeholder}
          rows={3}
          className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 font-mono text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={field.label}
        />
        {help}
      </div>
    )
  }

  if (field.type === 'number') {
    return (
      <div className="space-y-1.5">
        <Label htmlFor={id}>
          {field.label}
          {field.required ? <span className="text-destructive"> *</span> : null}
        </Label>
        <Input
          id={id}
          type="number"
          value={current === '' ? '' : String(current)}
          onChange={(event) => onChange(event.target.value === '' ? undefined : Number(event.target.value))}
          placeholder={field.placeholder}
          aria-label={field.label}
        />
        {help}
      </div>
    )
  }

  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>
        {field.label}
        {field.required ? <span className="text-destructive"> *</span> : null}
      </Label>
      <Input
        id={id}
        type="text"
        value={String(current)}
        onChange={(event) => onChange(event.target.value)}
        placeholder={field.placeholder}
        aria-label={field.label}
      />
      {help}
    </div>
  )
}
