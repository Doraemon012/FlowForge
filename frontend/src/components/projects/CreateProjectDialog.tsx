import { useState } from 'react'
import { Plus } from 'lucide-react'
import type * as React from 'react'
import { toast } from 'sonner'
import type { Project } from '@/api/types'
import { ProjectForm } from '@/components/projects/ProjectForm'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'

interface CreateProjectDialogProps {
  trigger?: React.ReactNode
  onCreated?: (project: Project) => void
}

export function CreateProjectDialog({ trigger, onCreated }: CreateProjectDialogProps) {
  const [open, setOpen] = useState(false)

  const handleSuccess = (project: Project) => {
    setOpen(false)
    toast.success('Project created')
    onCreated?.(project)
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button>
            <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
            Create project
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create project</DialogTitle>
          <DialogDescription>
            Projects are the home for your workflows, versions, and executions.
          </DialogDescription>
        </DialogHeader>
        <ProjectForm onSuccess={handleSuccess} onCancel={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  )
}
