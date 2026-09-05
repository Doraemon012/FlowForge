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
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

export function CreateProjectDialog({
  trigger,
  onCreated,
  open,
  onOpenChange,
}: CreateProjectDialogProps) {
  const [internalOpen, setInternalOpen] = useState(false)
  const isControlled = open !== undefined
  const isOpen = isControlled ? open : internalOpen

  const handleOpenChange = (next: boolean) => {
    if (onOpenChange) {
      onOpenChange(next)
    } else {
      setInternalOpen(next)
    }
  }

  const handleSuccess = (project: Project) => {
    handleOpenChange(false)
    toast.success('Project created')
    onCreated?.(project)
  }

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
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
        <ProjectForm onSuccess={handleSuccess} onCancel={() => handleOpenChange(false)} />
      </DialogContent>
    </Dialog>
  )
}
