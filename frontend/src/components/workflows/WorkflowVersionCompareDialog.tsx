import { useState } from 'react'
import { GitCompareArrows } from 'lucide-react'
import type * as React from 'react'
import type { WorkflowVersion } from '@/api/types'
import { diffDefinitions } from '@/lib/definition-diff'
import { DefinitionDiffView } from '@/components/workflows/DefinitionDiffView'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'

interface WorkflowVersionCompareDialogProps {
  version: WorkflowVersion
  /** The version to compare against. When omitted, all tasks are shown as added. */
  previousVersion?: WorkflowVersion
  trigger?: React.ReactNode
}

/**
 * Show what changed between two published versions. This is the "what did this
 * release actually change?" view - most useful right after an AI edit or an
 * incremental fix, where reading two raw definitions side by side is painful.
 */
export function WorkflowVersionCompareDialog({
  version,
  previousVersion,
  trigger,
}: WorkflowVersionCompareDialogProps) {
  const [open, setOpen] = useState(false)
  const diff = diffDefinitions(previousVersion?.definition, version.definition)
  const beforeLabel = previousVersion ? `Version ${previousVersion.version_number}` : 'Empty'
  const afterLabel = `Version ${version.version_number}`

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button type="button" variant="outline" size="sm">
            <GitCompareArrows className="mr-2 h-4 w-4" aria-hidden="true" />
            Compare
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[80vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Compare versions</DialogTitle>
          <DialogDescription>
            {previousVersion
              ? `Task-level changes from version ${previousVersion.version_number} to version ${version.version_number}.`
              : `Version ${version.version_number} is the initial published version; all of its tasks are listed as added.`}
          </DialogDescription>
        </DialogHeader>
        <DefinitionDiffView diff={diff} beforeLabel={beforeLabel} afterLabel={afterLabel} />
      </DialogContent>
    </Dialog>
  )
}
