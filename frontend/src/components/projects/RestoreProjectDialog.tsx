import { useState } from 'react'
import { ArchiveRestore } from 'lucide-react'
import type * as React from 'react'
import { toast } from 'sonner'
import { ApiError } from '@/api/client'
import type { Project } from '@/api/types'
import { useRestoreProject } from '@/hooks/use-projects'
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

interface RestoreProjectDialogProps {
  project: Project
  trigger?: React.ReactNode
}

/**
 * Puts an archived project back into service. Restoring is a status change
 * rather than a rebuild, so the dialog is a confirmation and nothing more: the
 * project's workflows, versions and run history were kept while it was
 * archived, and they are usable again the moment it is restored.
 */
export function RestoreProjectDialog({ project, trigger }: RestoreProjectDialogProps) {
  const [open, setOpen] = useState(false)
  const { mutateAsync, isPending } = useRestoreProject()

  const handleRestore = async () => {
    try {
      await mutateAsync(project.id)
      setOpen(false)
      toast.success('Project restored')
    } catch (error) {
      if (error instanceof ApiError) {
        toast.error(error.message)
      } else {
        toast.error('Could not restore the project.')
      }
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button variant="outline" size="sm">
            <ArchiveRestore className="mr-2 h-4 w-4" aria-hidden="true" />
            Restore
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Restore project</DialogTitle>
          <DialogDescription>
            "{project.name}" will be active again and its workflows can be edited, published
            and run. Everything it held while archived - workflows, versions and run history -
            is still there.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button type="button" onClick={handleRestore} loading={isPending}>
            Restore project
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
