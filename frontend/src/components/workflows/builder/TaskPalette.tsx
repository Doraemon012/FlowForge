import { Box, GripVertical } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  SUPPORTED_TASK_TYPES,
  TASK_TYPE_META,
  type SupportedTaskType,
} from './types'

interface TaskPaletteProps {
  onAddTask: (type: SupportedTaskType, position?: { x: number; y: number }) => void
  className?: string
}

export function TaskPalette({ onAddTask, className }: TaskPaletteProps) {
  const handleDragStart = (event: React.DragEvent<HTMLButtonElement>, type: SupportedTaskType) => {
    event.dataTransfer.setData('application/flowforge-task', type)
    event.dataTransfer.effectAllowed = 'move'
  }

  return (
    <div
      className={cn('flex h-full flex-col overflow-hidden', className)}
      aria-label="Task palette"
    >
      <div className="flex items-center gap-2 border-b px-4 py-3">
        <Box className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
        <h2 className="font-display text-sm font-semibold tracking-tight">Tasks</h2>
      </div>
      <div className="flex-1 space-y-1 overflow-y-auto p-2">
        {SUPPORTED_TASK_TYPES.map((type) => {
          const meta = TASK_TYPE_META[type]
          const Icon = meta.icon
          return (
            <button
              key={type}
              type="button"
              draggable
              onDragStart={(event) => handleDragStart(event, type)}
              onClick={() => onAddTask(type)}
              className="group flex w-full items-center gap-2.5 rounded-lg border border-transparent p-2 text-left transition-all hover:border-border/80 hover:bg-secondary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label={`Add ${meta.label} task`}
            >
              <GripVertical
                className="h-4 w-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100"
                aria-hidden="true"
              />
              <span
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-black/5"
                style={{
                  color: meta.accent,
                  backgroundColor: `color-mix(in oklch, ${meta.accent} 10%, var(--card))`,
                }}
              >
                <Icon className="h-4 w-4" aria-hidden="true" />
              </span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium">{meta.label}</span>
                <span className="block truncate text-xs text-muted-foreground">
                  {meta.description}
                </span>
              </span>
            </button>
          )
        })}
      </div>
      <div className="border-t px-4 py-3">
        <p className="text-xs leading-relaxed text-muted-foreground">
          Drag a task onto the canvas, or click to add it.
        </p>
      </div>
    </div>
  )
}
