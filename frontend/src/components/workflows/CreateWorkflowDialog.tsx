import { useState } from 'react'
import { Plus } from 'lucide-react'
import type * as React from 'react'
import { toast } from 'sonner'
import type { Workflow } from '@/api/types'
import { WorkflowForm } from '@/components/workflows/WorkflowForm'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'

interface CreateWorkflowDialogProps {
  projectId: string
  trigger?: React.ReactNode
  onCreated?: (workflow: Workflow) => void
}

export function CreateWorkflowDialog({ projectId, trigger, onCreated }: CreateWorkflowDialogProps) {
  const [open, setOpen] = useState(false)

  const handleSuccess = (workflow: Workflow) => {
    setOpen(false)
    toast.success('Workflow created')
    onCreated?.(workflow)
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button>
            <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
            Create workflow
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create workflow</DialogTitle>
          <DialogDescription>
            Workflows turn a sequence of tasks into a repeatable execution.
          </DialogDescription>
        </DialogHeader>
        <WorkflowForm projectId={projectId} onSuccess={handleSuccess} onCancel={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  )
}
