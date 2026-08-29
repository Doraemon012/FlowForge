import { useState } from 'react'
import { Link } from 'react-router-dom'
import { CheckCircle, PlayCircle, Save, ShieldCheck } from 'lucide-react'
import { toast } from 'sonner'
import { ApiError } from '@/api/client'
import type { Workflow, WorkflowTask } from '@/api/types'
import { useUpdateWorkflow, useValidateWorkflow, usePublishWorkflow, useDeactivateWorkflow } from '@/hooks/use-workflows'
import { TaskListEditor } from '@/components/workflows/TaskListEditor'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

interface WorkflowEditorProps {
  projectId: string
  workflow: Workflow
}

export function WorkflowEditor({ projectId, workflow }: WorkflowEditorProps) {
  const [name, setName] = useState(workflow.name)
  const [description, setDescription] = useState(workflow.description)
  const [tasks, setTasks] = useState<WorkflowTask[]>(workflow.draft_definition?.tasks ?? [])
  const [validationErrors, setValidationErrors] = useState<string[]>([])
  const [validationMessage, setValidationMessage] = useState<string | null>(null)

  const updateMutation = useUpdateWorkflow(projectId, workflow.id)
  const validateMutation = useValidateWorkflow(projectId, workflow.id)
  const publishMutation = usePublishWorkflow(projectId, workflow.id)
  const deactivateMutation = useDeactivateWorkflow(projectId, workflow.id)

  const originalTasks = workflow.draft_definition?.tasks ?? []
  const hasChanges =
    name !== workflow.name ||
    description !== workflow.description ||
    JSON.stringify(tasks) !== JSON.stringify(originalTasks)

  const handleSave = async () => {
    try {
      await updateMutation.mutateAsync({
        name,
        description,
        definition: { tasks },
      })
      toast.success('Workflow saved')
    } catch (error) {
      if (error instanceof ApiError) {
        toast.error(error.message)
      } else {
        toast.error('Could not save the workflow. Please try again.')
      }
    }
  }

  const handleValidate = async () => {
    try {
      await updateMutation.mutateAsync({
        name,
        description,
        definition: { tasks },
      })
      const result = await validateMutation.mutateAsync()
      setValidationErrors(result.errors)
      setValidationMessage(result.valid ? 'Workflow is valid.' : null)
    } catch (error) {
      if (error instanceof ApiError && error.errors) {
        setValidationErrors(error.errors)
        setValidationMessage(null)
      } else if (error instanceof ApiError) {
        setValidationErrors([error.message])
        setValidationMessage(null)
      } else {
        setValidationErrors(['Could not validate the workflow. Please try again.'])
      }
    }
  }

  const handlePublish = async () => {
    try {
      await updateMutation.mutateAsync({
        name,
        description,
        definition: { tasks },
      })
      const version = await publishMutation.mutateAsync()
      toast.success(`Workflow version ${version.version_number} published`)
    } catch (error) {
      if (error instanceof ApiError && error.errors) {
        setValidationErrors(error.errors)
        toast.error('Workflow could not be published: invalid definition')
      } else if (error instanceof ApiError) {
        toast.error(error.message)
      } else {
        toast.error('Could not publish the workflow.')
      }
    }
  }

  const handleDeactivate = async () => {
    if (!workflow.active_version_id) return
    try {
      await deactivateMutation.mutateAsync(workflow.active_version_id)
      toast.success('Workflow deactivated')
    } catch (error) {
      if (error instanceof ApiError) {
        toast.error(error.message)
      } else {
        toast.error('Could not deactivate the workflow.')
      }
    }
  }

  const saveIsPending = updateMutation.isPending
  const validateIsPending = validateMutation.isPending || updateMutation.isPending
  const publishIsPending = publishMutation.isPending || updateMutation.isPending
  const deactivateIsPending = deactivateMutation.isPending

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        {hasChanges ? (
          <span
            role="status"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-warning"
          >
            <span className="h-2 w-2 rounded-full bg-warning" aria-hidden="true" />
            Unsaved changes
          </span>
        ) : null}
        <Button onClick={handleSave} loading={saveIsPending} disabled={!hasChanges}>
          <Save className="mr-2 h-4 w-4" aria-hidden="true" />
          Save
        </Button>
        <Button variant="outline" onClick={handleValidate} loading={validateIsPending}>
          <ShieldCheck className="mr-2 h-4 w-4" aria-hidden="true" />
          Validate
        </Button>
        <Button variant="outline" onClick={handlePublish} loading={publishIsPending}>
          <PlayCircle className="mr-2 h-4 w-4" aria-hidden="true" />
          Publish version
        </Button>
        <Link
          to={`/app/projects/${projectId}/workflows/${workflow.id}/versions`}
          className="inline-flex h-9 items-center px-4 text-sm font-medium underline-offset-4 hover:underline"
        >
          View versions
        </Link>
        {workflow.active_version_id ? (
          <Button
            variant="destructive"
            size="sm"
            onClick={handleDeactivate}
            loading={deactivateIsPending}
          >
            Deactivate
          </Button>
        ) : null}
      </div>

      {validationMessage ? (
        <div className="flex items-center gap-2 rounded-md border border-success/30 bg-success/5 px-3 py-2 text-sm text-success">
          <CheckCircle className="h-4 w-4" aria-hidden="true" />
          {validationMessage}
        </div>
      ) : null}

      {validationErrors.length > 0 ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm">
          <p className="font-medium text-destructive">Workflow validation failed</p>
          <ul className="mt-1 list-inside list-disc text-destructive">
            {validationErrors.map((error, index) => (
              <li key={index}>{error}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="workflow-editor-name">Name</Label>
          <Input
            id="workflow-editor-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            aria-invalid={name.trim().length === 0 || name.length > 200}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="workflow-editor-description">Description</Label>
          <Input
            id="workflow-editor-description"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
          />
        </div>
      </div>

      <TaskListEditor tasks={tasks} onChange={setTasks} />
    </div>
  )
}
