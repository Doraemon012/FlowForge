import { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import { ApiError } from '@/api/client'
import type { Workflow, WorkflowReviewWarning, WorkflowTask } from '@/api/types'
import {
  useActivateWorkflowVersion,
  useDeactivateWorkflow,
  usePublishWorkflow,
  useUpdateWorkflow,
  useValidateWorkflow,
} from '@/hooks/use-workflows'
import { useCreateExecution } from '@/hooks/use-executions'
import { useUnsavedChangesGuard } from '@/hooks/use-unsaved-changes-guard'
import {
  WorkflowBuilderLayout,
  type BuilderStatusData,
} from '@/components/workflows/builder/WorkflowBuilderLayout'
import { BuilderHeader } from '@/components/workflows/builder/BuilderHeader'
import { SetupProgress, type SetupStep } from '@/components/workflows/builder/SetupProgress'
import { WorkflowJsonEditor } from '@/components/workflows/builder/WorkflowJsonEditor'
import { AiWorkflowDialog } from '@/components/workflows/builder/AiWorkflowDialog'
import type { BuilderView, GraphSyncRequest } from '@/components/workflows/builder/builder-view'
import { TriggersDialog } from '@/components/workflows/triggers/TriggersDialog'

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
  // Advisory review warnings from the last validate/AI pass. They never block
  // anything — they flag definitions that are valid but probably need a look.
  const [reviewWarnings, setReviewWarnings] = useState<WorkflowReviewWarning[]>([])
  const [hasRun, setHasRun] = useState(false)
  const [view, setView] = useState<BuilderView>('graph')
  const [syncRequest, setSyncRequest] = useState<GraphSyncRequest | null>(null)
  const [aiOpen, setAiOpen] = useState(false)
  const [triggersOpen, setTriggersOpen] = useState(false)
  const [setupDismissed, setSetupDismissed] = useState(false)
  const syncRevision = useRef(0)

  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  // `?task=<id>` deep-links from a failed execution's diagnosis straight to the
  // task that needs fixing. Passing it to the builder selects and reveals it.
  const focusTaskId = searchParams.get('task')
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

  // Never let unsaved work disappear silently. Warn before leaving the editor
  // through the sidebar, the back arrow, or a refresh/tab close.
  useUnsavedChangesGuard(hasChanges)

  // Run is gated on a clean, saved, active definition: running must never
  // execute a stale server-side version while the builder holds newer edits.
  const runBlockedReason = hasChanges
    ? 'Save your changes before running'
    : !workflow.active_version_id
      ? 'Publish and activate a version to run'
      : null

  // A successful validation only describes the exact definition that was
  // checked. Track that definition's signature so that as soon as the tasks
  // change, both the stale "valid" marker and the review warnings are dropped —
  // the validated/reviewed state never describes a different definition than
  // the one on screen.
  const definitionSignature = stableStringify(tasks)
  const validatedSignature = useRef<string | null>(null)
  useEffect(() => {
    if (
      validatedSignature.current !== null &&
      validatedSignature.current !== definitionSignature
    ) {
      setValidationMessage(null)
      setReviewWarnings([])
      validatedSignature.current = null
    }
  }, [definitionSignature])

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

  // Push a definition produced outside the graph (structured JSON editor or the
  // AI assistant) back into the graph. Bumping the revision guarantees the
  // builder applies it even if the tasks look identical to a previous request.
  const applyExternalTasks = (nextTasks: WorkflowTask[]) => {
    const previousTasks = tasks
    // Applying a new definition invalidates whatever validation/review state
    // described the previous one, so clear it instead of leaving a stale
    // "valid"/"failed" marker beside a definition it never described.
    setTasks(nextTasks)
    syncRevision.current += 1
    setSyncRequest({ revision: syncRevision.current, tasks: nextTasks })
    setValidationErrors([])
    setValidationMessage(null)
    setReviewWarnings([])
    validatedSignature.current = null
    // Replacing the graph is destructive to unsaved work: offer a one-click Undo
    // so an applied AI/JSON definition is never an irreversible surprise.
    toast('Definition applied to the graph', {
      description: 'Review the changes, then Save to persist them.',
      action: {
        label: 'Undo',
        onClick: () => {
          setTasks(previousTasks)
          syncRevision.current += 1
          setSyncRequest({ revision: syncRevision.current, tasks: previousTasks })
        },
      },
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
      setReviewWarnings(result.warnings ?? [])
      validatedSignature.current = definitionSignature
    } catch (error) {
      if (error instanceof ApiError && error.errors) {
        setValidationErrors(error.errors)
        setValidationMessage(null)
        setReviewWarnings(error.warnings ?? [])
        validatedSignature.current = definitionSignature
      } else if (error instanceof ApiError) {
        setValidationErrors([error.message])
        setValidationMessage(null)
        setReviewWarnings([])
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
      // A run can be rejected because the project around the workflow is
      // retired rather than because the workflow is broken. Archiving is
      // reversible, so the API answers 409 project_archived when the project is
      // archived - including when the archive lands while the request is in
      // flight - and 404 for a workflow that genuinely is not there. Neither is
      // a fault to explain with a generic message, so the user is pointed at
      // restoring the project.
      if (error instanceof ApiError && error.code === 'project_archived') {
        toast.error(
          'This project is archived, so its workflows cannot run. Restore it to run them again.',
        )
      } else if (error instanceof ApiError) {
        toast.error(error.message)
      } else {
        toast.error('Could not start the execution.')
      }
    }
  }

  // Restore the definition to the last saved snapshot without a round trip.
  const handleResetToSaved = () => {
    setTasks(savedState.tasks)
    syncRevision.current += 1
    setSyncRequest({ revision: syncRevision.current, tasks: savedState.tasks })
    setValidationErrors([])
    setValidationMessage(null)
    setReviewWarnings([])
    validatedSignature.current = null
    toast.success('Reverted to the last saved definition')
  }

  const connectionCount = tasks.reduce(
    (total, task) => total + (task.depends_on?.length ?? 0),
    0,
  )

  // The setup strip mirrors the order work actually happens in, and every step
  // is derived from builder state rather than hardcoded. It stops being useful
  // once the workflow is live and has been run, so it disappears then.
  const setupSteps: SetupStep[] = [
    {
      id: 'tasks',
      label: 'Add tasks',
      hint: 'Pick a task from the palette on the left to place it on the canvas.',
      done: tasks.length > 0,
    },
    {
      id: 'connect',
      label: 'Connect',
      hint: 'Drag from one task\u2019s right handle to another\u2019s left handle to set the order they run in.',
      done: connectionCount > 0 || tasks.length === 1,
    },
    {
      id: 'save',
      label: 'Save',
      hint: 'Save persists the definition. Run stays disabled until there is nothing unsaved.',
      done: !hasChanges,
      actionLabel: hasChanges ? 'Save now' : undefined,
      onAction: hasChanges ? () => void handleSave() : undefined,
    },
    {
      id: 'validate',
      label: 'Validate',
      // No inline action: Validate lives permanently in the status bar a few
      // pixels below this strip, and two identical buttons read as two
      // different operations.
      hint: 'Validate below the canvas to check the definition for errors without saving it.',
      done: Boolean(validationMessage) && validationErrors.length === 0,
    },
    {
      id: 'publish',
      label: 'Publish',
      hint: 'Publishing snapshots the definition as a new version and activates it so it can run.',
      done: Boolean(workflow.active_version_id),
      actionLabel: 'Publish',
      onAction: () => void handlePublish(),
    },
    {
      id: 'run',
      label: 'Run',
      hint: 'Start a manual run of the active version and inspect the results.',
      done: hasRun,
      actionLabel: runBlockedReason ? undefined : 'Run now',
      onAction: runBlockedReason ? undefined : () => void handleRun(),
    },
  ]

  const setupComplete = Boolean(workflow.active_version_id) && hasRun
  const showSetup = !setupDismissed && !setupComplete

  const statusData: BuilderStatusData = {
    taskCount: tasks.length,
    connectionCount,
    validationErrors,
    validationMessage,
    reviewWarnings,
    hasChanges,
    isValidating: validateMutation.isPending,
    runBlockedReason,
    onValidate: () => void handleValidate(),
  }

  const saveIsPending = updateMutation.isPending
  const publishIsPending =
    publishMutation.isPending || activateMutation.isPending || updateMutation.isPending

  const header = (
    <BuilderHeader
      projectId={projectId}
      workflowId={workflow.id}
      name={name}
      onNameChange={setName}
      description={description}
      onDescriptionChange={setDescription}
      status={workflow.status}
      hasChanges={hasChanges}
      view={view}
      onViewChange={setView}
      hasActiveVersion={Boolean(workflow.active_version_id)}
      isSaving={saveIsPending}
      isPublishing={publishIsPending}
      isRunning={createExecutionMutation.isPending}
      isDeactivating={deactivateMutation.isPending}
      runBlockedReason={runBlockedReason}
      onSave={() => void handleSave()}
      onPublish={() => void handlePublish()}
      onDeactivate={() => void handleDeactivate()}
      onRun={() => void handleRun()}
      onOpenAi={() => setAiOpen(true)}
      onOpenTriggers={() => setTriggersOpen(true)}
      onResetToSaved={handleResetToSaved}
    />
  )

  const jsonEditor =
    view === 'json' ? (
      <WorkflowJsonEditor
        tasks={tasks}
        onApply={applyExternalTasks}
        validationErrors={validationErrors}
        validMessage={validationMessage}
      />
    ) : null

  return (
    <>
      <WorkflowBuilderLayout
        key={workflow.id}
        header={header}
        setupProgress={
          showSetup ? (
            <SetupProgress steps={setupSteps} onDismiss={() => setSetupDismissed(true)} />
          ) : null
        }
        status={statusData}
        initialTasks={tasks}
        onTasksChange={setTasks}
        validationErrors={validationErrors}
        view={view}
        jsonEditor={jsonEditor}
        syncRequest={syncRequest}
        focusTaskId={focusTaskId}
        onOpenAi={() => setAiOpen(true)}
      />
      <AiWorkflowDialog
        projectId={projectId}
        workflowId={workflow.id}
        open={aiOpen}
        onOpenChange={setAiOpen}
        tasks={tasks}
        onGenerated={(generated) => {
          applyExternalTasks(generated)
          setView('graph')
        }}
      />
      <TriggersDialog
        projectId={projectId}
        workflowId={workflow.id}
        open={triggersOpen}
        onOpenChange={setTriggersOpen}
      />
    </>
  )
}
