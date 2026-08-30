import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowLeft, CheckCircle, Play, PlayCircle, Save, ShieldCheck } from 'lucide-react'
import { toast } from 'sonner'
import { ApiError } from '@/api/client'
import type { Workflow, WorkflowTask } from '@/api/types'
import {
  useDeactivateWorkflow,
  usePublishWorkflow,
  useUpdateWorkflow,
  useValidateWorkflow,
} from '@/hooks/use-workflows'
import { useCreateExecution } from '@/hooks/use-executions'
import { WorkflowBuilderLayout } from '@/components/workflows/builder/WorkflowBuilderLayout'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

function getStatusVariant(status: string): 'success' | 'secondary' | 'warning' | 'info' {
  switch (status) {
    case 'active':
      return 'success'
    case 'paused':
      return 'warning'
    case 'draft':
      return 'secondary'
    default:
      return 'info'
  }
}

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

  const navigate = useNavigate()
  const updateMutation = useUpdateWorkflow(projectId, workflow.id)
  const validateMutation = useValidateWorkflow(projectId, workflow.id)
  const publishMutation = usePublishWorkflow(projectId, workflow.id)
  const deactivateMutation = useDeactivateWorkflow(projectId, workflow.id)
  const createExecutionMutation = useCreateExecution(projectId, workflow.id)

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

  const handleRun = async () => {
    if (!workflow.active_version_id) return
    try {
      const execution = await createExecutionMutation.mutateAsync({})
      toast.success('Execution started')
      navigate(`/app/projects/${projectId}/executions/${execution.id}`)
    } catch (error) {
      if (error instanceof ApiError) {
        toast.error(error.message)
      } else {
        toast.error('Could not start the execution.')
      }
    }
  }

  const saveIsPending = updateMutation.isPending
  const validateIsPending = validateMutation.isPending || updateMutation.isPending
  const publishIsPending = publishMutation.isPending || updateMutation.isPending
  const deactivateIsPending = deactivateMutation.isPending

  const headerLeft = (
    <>
      <Link
        to={`/app/projects/${projectId}/workflows`}
        className="inline-flex shrink-0 items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
        aria-label="Back to workflows"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
      </Link>
      <Input
        value={name}
        onChange={(event) => setName(event.target.value)}
        aria-invalid={name.trim().length === 0 || name.length > 200}
        className="h-9 w-40 sm:w-64"
        aria-label="Workflow name"
      />
      <Badge variant={getStatusVariant(workflow.status)} className="capitalize">
        {workflow.status}
      </Badge>
      {hasChanges ? (
        <span
          role="status"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-warning"
        >
          <span className="h-2 w-2 rounded-full bg-warning" aria-hidden="true" />
          Unsaved
        </span>
      ) : null}
    </>
  )

  const headerActions = (
    <>
      <Button onClick={handleSave} loading={saveIsPending} disabled={!hasChanges} size="sm">
        <Save className="mr-2 h-4 w-4" aria-hidden="true" />
        Save
      </Button>
      <Button variant="outline" onClick={handleValidate} loading={validateIsPending} size="sm">
        <ShieldCheck className="mr-2 h-4 w-4" aria-hidden="true" />
        Validate
      </Button>
      <Button variant="outline" onClick={handlePublish} loading={publishIsPending} size="sm">
        <PlayCircle className="mr-2 h-4 w-4" aria-hidden="true" />
        Publish
      </Button>
      <Button
        onClick={handleRun}
        loading={createExecutionMutation.isPending}
        disabled={!workflow.active_version_id}
        size="sm"
        title={
          workflow.active_version_id
            ? 'Run the active version'
            : 'Publish and activate a version to run'
        }
      >
        <Play className="mr-2 h-4 w-4" aria-hidden="true" />
        Run
      </Button>
      <Button asChild variant="ghost" size="sm">
        <Link to={`/app/projects/${projectId}/executions`}>Runs</Link>
      </Button>
      <Button asChild variant="ghost" size="sm">
        <Link to={`/app/projects/${projectId}/workflows/${workflow.id}/versions`}>Versions</Link>
      </Button>
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
    </>
  )

  const headerSecondary = (
    <div className="flex flex-wrap items-center gap-3">
      <Input
        value={description}
        onChange={(event) => setDescription(event.target.value)}
        placeholder="Workflow description"
        className="h-8 max-w-md flex-1 text-sm text-muted-foreground"
        aria-label="Workflow description"
      />
      {validationMessage ? (
        <span className="inline-flex items-center gap-1.5 text-sm text-success">
          <CheckCircle className="h-4 w-4" aria-hidden="true" />
          {validationMessage}
        </span>
      ) : null}
      {validationErrors.length > 0 ? (
        <span className="inline-flex items-center gap-1.5 text-sm text-destructive" role="alert">
          <span className="h-2 w-2 rounded-full bg-destructive" aria-hidden="true" />
          Workflow validation failed
          <span className="text-muted-foreground">
            ({validationErrors.length} error{validationErrors.length === 1 ? '' : 's'})
          </span>
        </span>
      ) : null}
    </div>
  )

  return (
    <WorkflowBuilderLayout
      key={workflow.id}
      initialTasks={tasks}
      onTasksChange={setTasks}
      validationErrors={validationErrors}
      headerLeft={headerLeft}
      headerActions={headerActions}
      headerSecondary={headerSecondary}
    />
  )
}
