import { useState } from 'react'
import { Plus, Sparkles, Workflow as WorkflowIcon } from 'lucide-react'
import { toast } from 'sonner'
import { ApiError } from '@/api/client'
import type { Workflow } from '@/api/types'
import { useCreateWorkflow } from '@/hooks/use-workflows'
import {
  WORKFLOW_TEMPLATES,
  templateTaskCount,
  type WorkflowTemplate,
} from '@/lib/workflow-templates'
import { getTaskTypeMeta } from '@/components/workflows/builder/types'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

interface WorkflowTemplateGalleryProps {
  projectId: string
  onCreated?: (workflow: Workflow) => void
  /** Compact hides the longer description - used in tighter empty states. */
  compact?: boolean
}

/**
 * Create a workflow from a ready-made, runnable example. This is the "first
 * workflow" path: instead of facing a blank canvas, a new user picks a working
 * pipeline, lands in the builder with it already loaded, and can run or edit it.
 */
export function WorkflowTemplateGallery({
  projectId,
  onCreated,
  compact = false,
}: WorkflowTemplateGalleryProps) {
  const createMutation = useCreateWorkflow(projectId)
  const [pendingId, setPendingId] = useState<string | null>(null)

  const handleUse = async (template: WorkflowTemplate) => {
    setPendingId(template.id)
    try {
      const workflow = await createMutation.mutateAsync({
        name: template.name,
        description: template.summary,
        definition: template.definition,
      })
      toast.success('Workflow created from template', {
        description: 'Review the tasks, then publish and run it.',
      })
      onCreated?.(workflow)
    } catch (error) {
      if (error instanceof ApiError) {
        toast.error(error.message)
      } else {
        toast.error('Could not create the workflow. Please try again.')
      }
    } finally {
      setPendingId(null)
    }
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {WORKFLOW_TEMPLATES.map((template) => {
        const taskCount = templateTaskCount(template)
        const isPending = pendingId === template.id
        return (
          <div
            key={template.id}
            className="flex flex-col gap-3 rounded-xl border border-border/80 bg-card p-4 shadow-sm"
          >
            <div className="flex items-start gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-surface-2">
                <Sparkles className="h-4 w-4 text-muted" aria-hidden="true" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium">{template.name}</p>
                <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                  {template.summary}
                </p>
              </div>
            </div>

            {!compact ? (
              <p className="text-xs leading-relaxed text-muted-foreground">
                {template.description}
              </p>
            ) : null}

            <div className="flex flex-wrap items-center gap-1.5">
              {template.tags.map((tag) => {
                const meta = getTaskTypeMeta(tag)
                const TagIcon = meta.icon
                return (
                  <Badge key={tag} variant="secondary" className="gap-1 font-normal">
                    <TagIcon className="h-3 w-3" aria-hidden="true" />
                    {meta.label}
                  </Badge>
                )
              })}
              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                <WorkflowIcon className="h-3 w-3" aria-hidden="true" />
                {taskCount} task{taskCount === 1 ? '' : 's'}
              </span>
            </div>

            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-auto self-start"
              onClick={() => handleUse(template)}
              loading={isPending}
              disabled={pendingId !== null && !isPending}
            >
              <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
              Use this template
            </Button>
          </div>
        )
      })}
    </div>
  )
}
