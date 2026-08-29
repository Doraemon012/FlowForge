import { useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import type { WorkflowTask } from '@/api/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

const SUPPORTED_TYPES = ['http', 'transform', 'delay', 'conditional', 'email'] as const

interface ConfigFieldProps {
  value: Record<string, unknown>
  onChange: (config: Record<string, unknown>) => void
  label: string
  disabled?: boolean
}

function ConfigField({ value, onChange, label, disabled }: ConfigFieldProps) {
  const [text, setText] = useState(() => JSON.stringify(value ?? {}, null, 2))

  const handleChange = (next: string) => {
    setText(next)
    try {
      const parsed = JSON.parse(next)
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        onChange(parsed)
      }
    } catch {
      // Invalid JSON is preserved in the textarea; validated on save/publish.
    }
  }

  return (
    <div className="space-y-1.5">
      <Label htmlFor={label}>{label}</Label>
      <textarea
        id={label}
        value={text}
        onChange={(event) => handleChange(event.target.value)}
        disabled={disabled}
        rows={4}
        className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 font-mono text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label={label}
      />
    </div>
  )
}

interface TaskListEditorProps {
  tasks: WorkflowTask[]
  onChange: (tasks: WorkflowTask[]) => void
  disabled?: boolean
}

export function TaskListEditor({ tasks, onChange, disabled }: TaskListEditorProps) {
  const addTask = () => {
    onChange([
      ...tasks,
      {
        id: `task-${tasks.length + 1}`,
        type: 'transform',
        config: {},
        depends_on: [],
      },
    ])
  }

  const updateTask = (index: number, updates: Partial<WorkflowTask>) => {
    onChange(tasks.map((task, i) => (i === index ? { ...task, ...updates } : task)))
  }

  const removeTask = (index: number) => {
    onChange(tasks.filter((_, i) => i !== index))
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold">Tasks</h3>
        <Button type="button" variant="outline" size="sm" onClick={addTask} disabled={disabled}>
          <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
          Add task
        </Button>
      </div>

      {tasks.length === 0 ? (
        <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
          No tasks yet. Add a task to build your workflow.
        </p>
      ) : (
        <div className="space-y-3">
          {tasks.map((task, index) => (
            <div key={`${task.id}-${index}`} className="space-y-3 rounded-lg border p-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Task {index + 1}</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`Remove task ${index + 1}`}
                  onClick={() => removeTask(index)}
                  disabled={disabled}
                >
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                </Button>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor={`task-${index}-id`}>ID</Label>
                  <Input
                    id={`task-${index}-id`}
                    value={task.id}
                    onChange={(event) => updateTask(index, { id: event.target.value })}
                    disabled={disabled}
                    aria-label={`Task ${index + 1} ID`}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor={`task-${index}-type`}>Type</Label>
                  <select
                    id={`task-${index}-type`}
                    value={task.type}
                    onChange={(event) => updateTask(index, { type: event.target.value })}
                    disabled={disabled}
                    className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    aria-label={`Task ${index + 1} type`}
                  >
                    {SUPPORTED_TYPES.map((type) => (
                      <option key={type} value={type}>
                        {type}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <ConfigField
                label={`Task ${index + 1} config (JSON)`}
                value={task.config}
                onChange={(config) => updateTask(index, { config })}
                disabled={disabled}
              />

              <div className="space-y-1.5">
                <Label htmlFor={`task-${index}-depends`}>Depends on (comma-separated task IDs)</Label>
                <Input
                  id={`task-${index}-depends`}
                  value={(task.depends_on ?? []).join(', ')}
                  onChange={(event) => {
                    const depends_on = event.target.value
                      .split(',')
                      .map((part) => part.trim())
                      .filter(Boolean)
                    updateTask(index, { depends_on })
                  }}
                  disabled={disabled}
                  placeholder="e.g. task-1, task-2"
                  aria-label={`Task ${index + 1} depends on`}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
