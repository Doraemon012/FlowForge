import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  RotateCcw,
  ShieldAlert,
  Sparkles,
  UserPlus,
  Wand2,
} from 'lucide-react'
import { ApiError } from '@/api/client'
import type { WorkflowReviewWarning, WorkflowTask } from '@/api/types'
import { useAuth } from '@/hooks/use-auth'
import { useTrialUsage } from '@/hooks/use-trial'
import { useAiStatus, useEditWorkflow, useGenerateWorkflow } from '@/hooks/use-workflows'
import { TRIAL_EXHAUSTED_MESSAGE } from '@/components/layout/TrialIndicator'
import { diffDefinitions } from '@/lib/definition-diff'
import { isTrialModeSpent } from '@/lib/trial-usage'
import { DefinitionDiffView } from '@/components/workflows/DefinitionDiffView'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'

const PROMPT_LIMIT = 4000
const INSTRUCTION_LIMIT = 2000

const EXAMPLE_PROMPTS = [
  'Fetch the weather for a city, then email a summary to ops@example.com.',
  'Call an API, wait five seconds, then post the result to a webhook.',
  'Check whether a priority field equals "high" and email the on-call address when it does.',
]

const EXAMPLE_INSTRUCTIONS = [
  'Add a ten second delay before the first task.',
  'Email ops@example.com whenever the workflow finishes.',
  'Remove the last task.',
]

type AiMode = 'create' | 'refine'

interface AiWorkflowDialogProps {
  projectId: string
  workflowId: string
  open: boolean
  onOpenChange: (open: boolean) => void
  /** The definition currently in the builder, used as the basis for refinement. */
  tasks: WorkflowTask[]
  onGenerated: (tasks: WorkflowTask[]) => void
}

/**
 * AI workflow assistance.
 *
 * Two modes share one constrained backend: **Create** turns a description into a
 * new definition and **Refine** revises the definition currently in the builder
 * from an instruction. In both cases the server validates the model's answer
 * before returning it, so this dialog only ever previews a definition that
 * already passes server-side validation. When no provider is configured the
 * feature is disabled with an explanation rather than pretending to work.
 */
export function AiWorkflowDialog({
  projectId,
  workflowId,
  open,
  onOpenChange,
  tasks,
  onGenerated,
}: AiWorkflowDialogProps) {
  const [mode, setMode] = useState<AiMode>('create')
  const [prompt, setPrompt] = useState('')
  const [instruction, setInstruction] = useState('')
  const [preview, setPreview] = useState<WorkflowTask[] | null>(null)
  const [warnings, setWarnings] = useState<WorkflowReviewWarning[]>([])
  const [error, setError] = useState<string | null>(null)
  const [errorList, setErrorList] = useState<string[]>([])
  // Create mode replaces whatever is already in the graph. Require an explicit
  // acknowledgement so a generated definition can never silently destroy the
  // tasks the user already has.
  const [replaceAcknowledged, setReplaceAcknowledged] = useState(false)

  const navigate = useNavigate()
  const { logout } = useAuth()
  const statusQuery = useAiStatus()
  const trialQuery = useTrialUsage()
  const generateMutation = useGenerateWorkflow(projectId, workflowId)
  const editMutation = useEditWorkflow(projectId, workflowId)

  // The server enforces the trial AI limit; these numbers only drive the UI so
  // a trial visitor can see the allowance and is not offered an action that
  // will be refused. A registered user sees none of this.
  const trial = trialQuery.data?.is_trial ? trialQuery.data : null
  const trialBlocked =
    trial !== null && isTrialModeSpent(trial, mode === 'create' ? 'generation' : 'edit')

  const unavailable = statusQuery.data?.enabled === false
  const isPending = generateMutation.isPending || editMutation.isPending
  const hasTasks = tasks.length > 0
  // Create mode produces a whole new definition, so applying it over an
  // existing graph destroys the current tasks. Refine mode edits in place and
  // needs no confirmation.
  const replacingExisting = mode === 'create' && hasTasks
  // Show the AI's changes at the field level - especially for Refine, where the
  // assistant edits the existing graph in place and the user needs to see
  // exactly which tasks moved, not just the resulting task list.
  const previewDiff = diffDefinitions({ tasks }, { tasks: preview ?? [] })

  // Default to refining when there is already something to refine; a fresh
  // workflow naturally starts in create mode. Re-evaluated each time the dialog
  // is opened so it always matches what the user is looking at.
  useEffect(() => {
    if (open) {
      setMode(tasks.length > 0 ? 'refine' : 'create')
    }
  }, [open, tasks.length])

  const text = mode === 'create' ? prompt : instruction
  const setText = mode === 'create' ? setPrompt : setInstruction
  const limit = mode === 'create' ? PROMPT_LIMIT : INSTRUCTION_LIMIT

  const refineBlocked = mode === 'refine' && !hasTasks
  const canSubmit =
    text.trim().length > 0 &&
    !isPending &&
    !unavailable &&
    !refineBlocked &&
    !trialBlocked

  const reset = () => {
    setPreview(null)
    setWarnings([])
    setError(null)
    setErrorList([])
    setReplaceAcknowledged(false)
  }

  const switchMode = (next: AiMode) => {
    if (next === mode) return
    reset()
    setMode(next)
  }

  const handleClose = (next: boolean) => {
    if (!next && isPending) return
    if (!next) {
      reset()
      setPrompt('')
      setInstruction('')
    }
    onOpenChange(next)
  }

  const handleSubmit = async () => {
    if (!canSubmit) return
    setError(null)
    setErrorList([])
    setPreview(null)
    setWarnings([])
    setReplaceAcknowledged(false)
    try {
      const result =
        mode === 'create'
          ? await generateMutation.mutateAsync(prompt.trim())
          : await editMutation.mutateAsync({
              instruction: instruction.trim(),
              definition: { tasks },
            })
      setPreview(result.definition.tasks ?? [])
      setWarnings(result.warnings ?? [])
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === 'trial_ai_limit_reached') {
          // The server refused the request because the trial allowance is
          // spent. Show the same explanation the indicator uses; the banner
          // above also appears once the usage query refreshes.
          setError(TRIAL_EXHAUSTED_MESSAGE)
        } else {
          setError(
            err.code === 'ai_invalid_workflow'
              ? 'The assistant could not produce a valid workflow. Nothing in your graph was changed.'
              : err.message,
          )
          if (err.errors && err.errors.length > 0) {
            setErrorList(err.errors)
          }
        }
      } else {
        setError(
          mode === 'create'
            ? 'Could not generate a workflow. Please try again.'
            : 'Could not refine the workflow. Please try again.',
        )
      }
    }
  }

  const handleApply = () => {
    if (!preview) return
    if (replacingExisting && !replaceAcknowledged) return
    onGenerated(preview)
    handleClose(false)
    setPrompt('')
    setInstruction('')
  }

  const examples = mode === 'create' ? EXAMPLE_PROMPTS : EXAMPLE_INSTRUCTIONS
  const placeholder =
    mode === 'create'
      ? 'e.g. Fetch the weather for a city, then email a summary to ops@example.com.'
      : 'e.g. Add a delay of ten seconds before the first task.'

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-accent" aria-hidden="true" />
            AI workflow assistant
          </DialogTitle>
          <DialogDescription>
            {mode === 'create'
              ? 'Describe what the workflow should do. FlowForge generates a definition and validates it before showing it to you.'
              : 'Describe the change you want. FlowForge revises the current definition and validates the result before showing it to you.'}
          </DialogDescription>
        </DialogHeader>

        <div
          className="inline-flex w-fit items-center rounded-lg border border-border bg-card p-0.5"
          role="tablist"
          aria-label="AI mode"
        >
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'create'}
            onClick={() => switchMode('create')}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-md px-3 py-1 text-sm font-medium transition-colors',
              mode === 'create'
                ? 'bg-muted text-foreground'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <Sparkles className="h-4 w-4" aria-hidden="true" />
            Create
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'refine'}
            onClick={() => switchMode('refine')}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-md px-3 py-1 text-sm font-medium transition-colors',
              mode === 'refine'
                ? 'bg-muted text-foreground'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <Wand2 className="h-4 w-4" aria-hidden="true" />
            Refine
          </button>
        </div>

        {unavailable ? (
          <div className="flex items-start gap-2 rounded-lg border border-border bg-muted p-3 text-sm text-muted-foreground">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>
              AI assistance is not configured on this server. Set{' '}
              <code className="font-mono">FLOWFORGE_AI_PROVIDER</code> to{' '}
              <code className="font-mono">openai</code> or{' '}
              <code className="font-mono">cohere</code> and provide that provider's{' '}
              API key to enable it.
            </span>
          </div>
        ) : null}

        {refineBlocked ? (
          <div className="flex items-start gap-2 rounded-lg border border-border bg-muted p-3 text-sm text-muted-foreground">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>
              This workflow has no tasks yet. Switch to <strong>Create</strong> to
              start one, or add tasks in the graph first.
            </span>
          </div>
        ) : null}

        {trialBlocked ? (
          <div className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm text-warning">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <div className="space-y-2">
              <p>{TRIAL_EXHAUSTED_MESSAGE}</p>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  logout()
                  navigate('/signup', { replace: true })
                }}
              >
                <UserPlus className="mr-2 h-4 w-4" aria-hidden="true" />
                Create a free account
              </Button>
            </div>
          </div>
        ) : null}

        <div className="space-y-2">
          <textarea
            value={text}
            onChange={(event) => {
              setText(event.target.value.slice(0, limit))
              if (error || preview) reset()
            }}
            disabled={unavailable || isPending || refineBlocked || trialBlocked}
            rows={5}
            spellCheck={false}
            placeholder={placeholder}
            aria-label={mode === 'create' ? 'Workflow description' : 'Change instruction'}
            className="w-full resize-none rounded-lg border border-border bg-background p-3 text-sm outline-none focus:border-accent disabled:opacity-60"
          />
          {text.length === 0 && !refineBlocked ? (
            <div className="flex flex-wrap gap-1.5">
              {examples.map((example) => (
                <button
                  key={example}
                  type="button"
                  onClick={() => setText(example)}
                  disabled={unavailable}
                  className="rounded-full border border-border px-2.5 py-1 text-left text-xs text-muted-foreground transition-colors hover:border-accent hover:text-foreground disabled:opacity-50"
                >
                  {example}
                </button>
              ))}
            </div>
          ) : (
            <p className="text-right text-xs text-muted-foreground">
              {text.length}/{limit}
            </p>
          )}
        </div>

        {trial && !trialBlocked ? (
          <p className="text-xs text-muted-foreground">
            {mode === 'create'
              ? `${trial.remaining.generation} of ${trial.limits.generation} trial AI generations left`
              : `${trial.remaining.edit} of ${trial.limits.edit} trial AI refinements left`}
            {' · '}
            {trial.remaining.total} of {trial.limits.total} AI actions left in the trial
          </p>
        ) : null}

        {error ? (
          <div
            className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive"
            role="alert"
          >
            <p className="font-medium">{error}</p>
            {errorList.length > 0 ? (
              <ul className="mt-1 list-disc space-y-0.5 pl-5">
                {errorList.map((item, index) => (
                  <li key={index}>{item}</li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}

        {preview ? (
          <div className="rounded-lg border border-border bg-muted p-3">
            <p className="text-sm font-semibold">
              {mode === 'create' ? 'Generated' : 'Revised to'} {preview.length} task
              {preview.length === 1 ? '' : 's'}
            </p>
            {preview.length === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">
                The assistant returned no tasks. Try rephrasing the request.
              </p>
            ) : (
              <div className="mt-3">
                <DefinitionDiffView
                  diff={previewDiff}
                  beforeLabel="Current graph"
                  afterLabel={mode === 'create' ? 'Generated' : 'Revised'}
                />
              </div>
            )}
            <p className="mt-2 text-xs text-muted-foreground">
              {mode === 'create'
                ? 'Applying replaces the current graph. Nothing is saved until you press Save.'
                : 'Applying updates the current graph. Nothing is saved until you press Save.'}
            </p>

            {warnings.length > 0 ? (
              <div className="mt-3 rounded-md border border-warning/40 bg-warning/10 p-2.5">
                <p className="flex items-center gap-1.5 text-xs font-semibold text-warning">
                  <ShieldAlert className="h-3.5 w-3.5" aria-hidden="true" />
                  Review before running ({warnings.length})
                </p>
                <ul className="mt-1.5 space-y-1">
                  {warnings.map((warning, index) => (
                    <li
                      key={`${warning.code}-${index}`}
                      className="flex items-start gap-1.5 text-xs leading-relaxed"
                    >
                      <AlertTriangle
                        className={cn(
                          'mt-0.5 h-3.5 w-3.5 shrink-0',
                          warning.severity === 'warning'
                            ? 'text-warning'
                            : 'text-muted-foreground',
                        )}
                        aria-hidden="true"
                      />
                      <span className="min-w-0 text-muted-foreground">{warning.message}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {replacingExisting ? (
              <label className="mt-3 flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-2.5 text-xs text-destructive">
                <input
                  type="checkbox"
                  checked={replaceAcknowledged}
                  onChange={(event) => setReplaceAcknowledged(event.target.checked)}
                  className="mt-0.5 h-3.5 w-3.5 shrink-0 accent-destructive"
                />
                <span>
                  I understand this replaces the {tasks.length} task
                  {tasks.length === 1 ? '' : 's'} currently in the graph.
                </span>
              </label>
            ) : null}
          </div>
        ) : null}

        <DialogFooter className="gap-2">
          {preview ? (
            <>
              <Button variant="ghost" size="sm" onClick={reset} disabled={isPending}>
                <RotateCcw className="mr-2 h-4 w-4" aria-hidden="true" />
                Start over
              </Button>
              <Button
                size="sm"
                onClick={handleApply}
                disabled={replacingExisting && !replaceAcknowledged}
                variant={replacingExisting ? 'destructive' : 'default'}
              >
                {replacingExisting ? 'Replace graph' : 'Apply to graph'}
                <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />
              </Button>
            </>
          ) : (
            <Button size="sm" onClick={handleSubmit} loading={isPending} disabled={!canSubmit}>
              {mode === 'create' ? (
                <Sparkles className="mr-2 h-4 w-4" aria-hidden="true" />
              ) : (
                <Wand2 className="mr-2 h-4 w-4" aria-hidden="true" />
              )}
              {mode === 'create' ? 'Generate' : 'Refine'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
