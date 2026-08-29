import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Trash2 } from 'lucide-react'
import type * as React from 'react'
import { toast } from 'sonner'
import { ApiError } from '@/api/client'
import type { Project } from '@/api/types'
import { useDeleteProject } from '@/hooks/use-projects'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'

interface DeleteProjectDialogProps {
  project: Project
  trigger?: React.ReactNode
}

export function DeleteProjectDialog({ project, trigger }: DeleteProjectDialogProps) {
  const [open, setOpen] = useState(false)
  const navigate = useNavigate()
  const { mutateAsync, isPending } = useDeleteProject()

  const handleDelete = async () => {
    try {
      await mutateAsync(project.id)
      setOpen(false)
      toast.success('Project archived')
      navigate('/app/projects')
    } catch (error) {
      if (error instanceof ApiError) {
        toast.error(error.message)
      } else {
        toast.error('Could not archive the project.')
      }
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button variant="destructive" size="sm">
            <Trash2 className="mr-2 h-4 w-4" aria-hidden="true" />
            Delete
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete project</DialogTitle>
          <DialogDescription>
            This will archive "{project.name}". Workflows in this project will no longer be
            accessible. This action is not reversible.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button type="button" variant="destructive" onClick={handleDelete} loading={isPending}>
            Delete project
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
