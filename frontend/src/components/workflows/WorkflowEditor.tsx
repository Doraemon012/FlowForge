import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowLeft, CheckCircle, Play, PlayCircle, Save, ShieldCheck } from 'lucide-react'
import { toast } from 'sonner'
import { ApiError } from '@/api/client'
import type { Workflow, WorkflowTask } from '@/api/types'
import {
  useActivateWorkflowVersion,
  useDeactivateWorkflow,
  usePublishWorkflow,
  useUpdateWorkflow,
  useValidateWorkflow,
} from '@/hooks/use-workflows'
import { useCreateExecution } from '@/hooks/use-executions'
import { WorkflowBuilderLayout } from '@/components/workflows/builder/WorkflowBuilderLayout'
import { WorkflowGuide, type GuideStep } from '@/components/workflows/WorkflowGuide'
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

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`
  return `{${Object.keys(value as Record<string, unknown>)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify((value as Record<string, unknown>)[key])}`)
    .join(',')}}`
}

function normalizeTask(task: WorkflowTask): string {
  return stableStringify({
    id: task.id,
    type: task.type,
    config: task.config ?? {},
    depends_on: [...(task.depends_on ?? [])].sort(),
  })
}

function tasksEqual(a: WorkflowTask[], b: WorkflowTask[]): boolean {
  if (a.length !== b.length) return false
  return a.every((task, index) => normalizeTask(task) === normalizeTask(b[index]))
}

interface WorkflowEditorProps {
  projectId: string
  workflow: Workflow
}

export function WorkflowEditor({ projectId, workflow }: WorkflowEditorProps) {
  const initialTasks = workflow.draft_definition?.tasks ?? []
  const [name, setName] = useState(workflow.name)
  const [description, setDescription] = useState(workflow.description)
  const [tasks, setTasks] = useState<WorkflowTask[]>(initialTasks)
  const [savedState, setSavedState] = useState(() => ({
    name: workflow.name,
    description: workflow.description,
    tasks: initialTasks,
  }))
  const [validationErrors, setValidationErrors] = useState<string[]>([])
  const [validationMessage, setValidationMessage] = useState<string | null>(null)
  const [hasRun, setHasRun] = useState(false)

  const navigate = useNavigate()
  const updateMutation = useUpdateWorkflow(projectId, workflow.id)
  const validateMutation = useValidateWorkflow(projectId, workflow.id)
  const publishMutation = usePublishWorkflow(projectId, workflow.id)
  const activateMutation = useActivateWorkflowVersion(projectId, workflow.id)
  const deactivateMutation = useDeactivateWorkflow(projectId, workflow.id)
  const createExecutionMutation = useCreateExecution(projectId, workflow.id)

  // Track the last-saved snapshot so "Unsaved" is computed against what is
  // actually persisted, not against a prop that may still be stale while the
  // query cache is being updated.
  const hasChanges =
    name !== savedState.name ||
    description !== savedState.description ||
    !tasksEqual(tasks, savedState.tasks)

  // Run is gated on a clean, saved, active definition: running must never
  // execute a stale server-side version while the builder holds newer edits.
  const runBlockedReason = hasChanges
    ? 'Save your changes before running'
    : !workflow.active_version_id
      ? 'Publish and activate a version to run'
      : null

  // A successful validation only describes the definition that was checked.
  // As soon as it changes, drop the stale "valid" marker so the validated
  // state never overstates what is true.
  useEffect(() => {
    if (hasChanges) {
      setValidationMessage(null)
    }
  }, [hasChanges])

  const syncFromSaved = (updated: Workflow) => {
    const savedTasks = updated.draft_definition?.tasks ?? []
    setName(updated.name)
    setDescription(updated.description)
    setTasks(savedTasks)
    setSavedState({
      name: updated.name,
      description: updated.description,
      tasks: savedTasks,
    })
  }

  const handleSave = async () => {
    try {
      const updated = await updateMutation.mutateAsync({
        name,
        description,
        definition: { tasks },
      })
      syncFromSaved(updated)
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
      // Validate the definition currently in the builder — including unsaved
      // changes — without persisting it. Saving happens only through Save/
      // Publish, so the unsaved/saved distinction stays truthful.
      const result = await validateMutation.mutateAsync({ tasks })
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
      const updated = await updateMutation.mutateAsync({
        name,
        description,
        definition: { tasks },
      })
      syncFromSaved(updated)
      const version = await publishMutation.mutateAsync()
      await activateMutation.mutateAsync(version.id)
      toast.success(`Workflow version ${version.version_number} published and activated`, {
        action: {
          label: 'Manage versions',
          onClick: () =>
            navigate(`/app/projects/${projectId}/workflows/${workflow.id}/versions`),
        },
      })
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
      setHasRun(true)
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
  const validateIsPending = validateMutation.isPending
  const publishIsPending =
    publishMutation.isPending || activateMutation.isPending || updateMutation.isPending
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

  // Contextual, in-product guidance. Steps 1–2 (project, workflow) are already
  // complete by the time a user is in the builder, so they are shown as done
  // and the rest are derived from the builder's own state. This keeps the guide
  // truthful without adding another configuration surface.
  const guideSteps: GuideStep[] = [
    {
      id: 'project',
      label: 'Create a project',
      hint: 'Group related workflows under a project.',
      done: true,
    },
    {
      id: 'workflow',
      label: 'Create a workflow',
      hint: 'Each workflow is versioned and can be activated independently.',
      done: true,
    },
    {
      id: 'tasks',
      label: 'Add and configure tasks',
      hint: 'Add tasks from the palette, then set their configuration.',
      done: tasks.length > 0,
    },
    {
      id: 'connect',
      label: 'Connect tasks',
      hint: 'Drag from a task\u2019s right handle to another\u2019s left handle to set the order.',
      done: tasks.some((task) => (task.depends_on ?? []).length > 0),
    },
    {
      id: 'save',
      label: 'Save your changes',
      hint: 'Run stays disabled until the latest edits are saved.',
      done: !hasChanges,
    },
    {
      id: 'validate',
      label: 'Validate the workflow',
      hint: 'Validation checks the definition without saving it.',
      done: Boolean(validationMessage) && validationErrors.length === 0,
    },
    {
      id: 'publish',
      label: 'Publish and activate',
      hint: 'Publishing snapshots a version; activating makes it runnable.',
      done: Boolean(workflow.active_version_id),
    },
    {
      id: 'run',
      label: 'Run the workflow',
      hint: 'Start a manual run of the active version.',
      done: hasRun,
    },
    {
      id: 'inspect',
      label: 'Inspect results and logs',
      hint: 'Open a run to see per-task output and failures.',
      done: hasRun,
    },
  ]

  const headerActions = (
    <>
      <WorkflowGuide steps={guideSteps} />
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
        disabled={Boolean(runBlockedReason)}
        size="sm"
        title={runBlockedReason ?? 'Run the active version'}
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
