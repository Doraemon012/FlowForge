import { useState } from 'react'
import { Eye } from 'lucide-react'
import type * as React from 'react'
import type { WorkflowVersion } from '@/api/types'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { formatDateTime } from '@/lib/utils'

const SUPPORTED_TYPE_LABELS: Record<string, string> = {
  http: 'HTTP',
  transform: 'Transform',
  delay: 'Delay',
  conditional: 'Conditional',
  email: 'Email',
}

interface WorkflowVersionDetailsDialogProps {
  version: WorkflowVersion
  trigger?: React.ReactNode
}

export function WorkflowVersionDetailsDialog({
  version,
  trigger,
}: WorkflowVersionDetailsDialogProps) {
  const [open, setOpen] = useState(false)
  const tasks = version.definition?.tasks ?? []

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button type="button" variant="ghost" size="sm">
            <Eye className="mr-2 h-4 w-4" aria-hidden="true" />
            Inspect
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[80vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Version {version.version_number}</DialogTitle>
          <DialogDescription>
            Published {formatDateTime(version.created_at)} · {tasks.length} task
            {tasks.length === 1 ? '' : 's'}
          </DialogDescription>
        </DialogHeader>

        {tasks.length === 0 ? (
          <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
            This version has no tasks.
          </p>
        ) : (
          <div className="space-y-3">
            {tasks.map((task, index) => (
              <div key={`${task.id}-${index}`} className="rounded-lg border p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{task.id}</p>
                    <p className="text-xs text-muted-foreground">
                      {SUPPORTED_TYPE_LABELS[task.type] ?? task.type}
                    </p>
                  </div>
                  {task.depends_on && task.depends_on.length > 0 ? (
                    <Badge variant="secondary">
                      Depends on {task.depends_on.join(', ')}
                    </Badge>
                  ) : (
                    <Badge variant="outline">No dependencies</Badge>
                  )}
                </div>
                <pre className="mt-3 overflow-x-auto rounded-md bg-muted/50 p-3 font-mono text-xs">
                  {JSON.stringify(task.config ?? {}, null, 2)}
                </pre>
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
