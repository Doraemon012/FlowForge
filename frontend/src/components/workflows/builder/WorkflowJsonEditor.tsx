import { useMemo, useState } from 'react'
import { AlertCircle, Braces, Check, RotateCcw, WandSparkles } from 'lucide-react'
import { toast } from 'sonner'
import type { WorkflowTask } from '@/api/types'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { formatDefinition, parseDefinition } from './definition-json'
import { SUPPORTED_TASK_TYPES, TASK_CONFIG_FIELDS, TASK_TYPE_META } from './types'

interface WorkflowJsonEditorProps {
  tasks: WorkflowTask[]
  onApply: (tasks: WorkflowTask[]) => void
  validationErrors: string[]
  validMessage?: string | null
  className?: string
}

/**
 * Structured (JSON) view of a workflow definition.
 *
 * The text is the same shape the API persists and executes
 * (`{ "tasks": [ { "id", "type", "config", "depends_on" } ] }`). It is parsed
 * locally for immediate structural feedback, and applied back to the graph only
 * when it is well formed, so the two representations can never silently
 * diverge.
 */
export function WorkflowJsonEditor({
  tasks,
  onApply,
  validationErrors,
  validMessage,
  className,
}: WorkflowJsonEditorProps) {
  const committed = useMemo(() => formatDefinition(tasks), [tasks])
  const [draft, setDraft] = useState(committed)
  const [base, setBase] = useState(committed)

  // Adopt external task changes (graph edits, AI generation) into the draft,
  // but never silently discard edits the user has not applied yet.
  if (committed !== base) {
    const hadUnappliedEdits = draft !== base
    setBase(committed)
    if (!hadUnappliedEdits) {
      setDraft(committed)
    }
  }

  const parsed = useMemo(() => parseDefinition(draft), [draft])
  const isDirty = draft !== committed
  const canApply = parsed.ok && isDirty
  const taskCount = parsed.ok ? parsed.tasks.length : null

  const handleFormat = () => {
    if (!parsed.ok) {
      toast.error(parsed.error)
      return
    }
    setDraft(formatDefinition(parsed.tasks))
  }

  const handleReset = () => {
    setDraft(committed)
  }

  const handleApply = () => {
    if (!parsed.ok) {
      toast.error(parsed.error)
      return
    }
    if (!isDirty) return
    // The parent shows the confirmation (with Undo) for every applied
    // definition, so this view does not raise its own duplicate toast.
    onApply(parsed.tasks)
  }

  return (
    <div className={cn('flex min-h-0 flex-1 flex-col', className)}>
      <div className="flex flex-wrap items-center gap-2 border-b bg-surface px-3 py-2">
        <Braces className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
        <span className="text-sm font-semibold tracking-tight">Definition</span>
        <span className="text-xs text-muted-foreground">
          {taskCount === null
            ? 'Fix the JSON to continue'
            : `${taskCount} task${taskCount === 1 ? '' : 's'}`}
          {isDirty ? ' · unapplied edits' : ''}
        </span>
        <div className="ml-auto flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleReset}
            disabled={!isDirty}
            title="Discard the edits in this view and reload the definition from the graph"
          >
            <RotateCcw className="mr-2 h-4 w-4" aria-hidden="true" />
            Reset
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleFormat}
            disabled={!parsed.ok}
            title="Re-indent the JSON"
          >
            <WandSparkles className="mr-2 h-4 w-4" aria-hidden="true" />
            Format
          </Button>
          <Button size="sm" onClick={handleApply} disabled={!canApply}>
            <Check className="mr-2 h-4 w-4" aria-hidden="true" />
            Apply to graph
          </Button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        <div className="flex min-w-0 flex-1 flex-col">
          <textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            spellCheck={false}
            aria-label="Workflow definition JSON"
            aria-invalid={!parsed.ok}
            className={cn(
              'min-h-0 flex-1 resize-none bg-background p-4 font-mono text-[13px] leading-5 outline-none',
              !parsed.ok && 'text-destructive',
            )}
          />
          <div className="shrink-0 space-y-1 border-t px-3 py-2">
            {!parsed.ok ? (
              <p className="flex items-start gap-1.5 text-sm text-destructive" role="alert">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                <span className="min-w-0 break-words">{parsed.error}</span>
              </p>
            ) : validationErrors.length > 0 ? (
              <div className="space-y-1" role="alert">
                {validationErrors.map((error, index) => (
                  <p key={index} className="flex items-start gap-1.5 text-sm text-destructive">
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                    <span className="min-w-0 break-words">{error}</span>
                  </p>
                ))}
              </div>
            ) : validMessage ? (
              <p className="flex items-center gap-1.5 text-sm text-success">
                <Check className="h-4 w-4" aria-hidden="true" />
                {validMessage}
              </p>
            ) : isDirty ? (
              <p className="text-sm text-muted-foreground">
                Apply these edits to the graph, then save to persist them.
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">
                Edit the definition below, then apply it to the graph. Validation runs against
                the definition currently shown.
              </p>
            )}
          </div>
        </div>

        <aside className="hidden w-72 shrink-0 overflow-y-auto border-l bg-surface p-3 lg:block">
          <h3 className="font-display text-sm font-semibold tracking-tight">Task reference</h3>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            A task is <code className="font-mono">{'{ id, type, config, depends_on }'}</code>.
            <code className="font-mono"> depends_on</code> lists the task ids that must succeed
            first &mdash; omit it for tasks that run at the start.
          </p>
          <div className="mt-3 space-y-3">
            {SUPPORTED_TASK_TYPES.map((type) => {
              const meta = TASK_TYPE_META[type]
              const Icon = meta.icon
              const fields = TASK_CONFIG_FIELDS[type]
              return (
                <div key={type} className="rounded-lg border border-border/70 bg-card p-2.5">
                  <div className="flex items-center gap-2">
                    <span
                      className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-black/5"
                      style={{
                        color: meta.accent,
                        backgroundColor: `color-mix(in oklch, ${meta.accent} 10%, var(--card))`,
                      }}
                    >
                      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                    </span>
                    <span className="text-xs font-semibold">{meta.label}</span>
                    <code className="ml-auto font-mono text-[11px] text-muted-foreground">
                      {type}
                    </code>
                  </div>
                  <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground">
                    {meta.description}
                  </p>
                  <ul className="mt-1.5 space-y-0.5">
                    {fields.map((field) => (
                      <li key={field.key} className="text-[11px] leading-relaxed">
                        <code className="font-mono text-foreground/80">
                          {field.key}
                          {field.required ? '*' : ''}
                        </code>
                        <span className="text-muted-foreground"> &mdash; {field.label}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )
            })}
          </div>
        </aside>
      </div>
    </div>
  )
}
