import { MinusCircle, PencilLine, PlusCircle } from 'lucide-react'
import type { DefinitionDiff, FieldChange, TaskChange } from '@/lib/definition-diff'
import { getTaskTypeMeta } from '@/components/workflows/builder/types'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

function TypeBadge({ type }: { type: string }) {
  const meta = getTaskTypeMeta(type)
  const Icon = meta.icon
  return (
    <Badge variant="secondary" className="gap-1 font-normal">
      <Icon className="h-3 w-3" aria-hidden="true" />
      {meta.label}
    </Badge>
  )
}

function AddedOrRemovedRow({ change }: { change: TaskChange }) {
  const task = change.after ?? change.before
  if (!task) return null
  const isAdded = change.kind === 'added'
  return (
    <li className="flex flex-wrap items-center gap-2 text-sm">
      {isAdded ? (
        <PlusCircle className="h-4 w-4 text-success" aria-hidden="true" />
      ) : (
        <MinusCircle className="h-4 w-4 text-destructive" aria-hidden="true" />
      )}
      <span className="font-medium">{task.id}</span>
      <TypeBadge type={task.type} />
      {(task.depends_on ?? []).length > 0 ? (
        <span className="text-xs text-muted-foreground">
          depends on {[...(task.depends_on ?? [])].join(', ')}
        </span>
      ) : null}
    </li>
  )
}

function FieldRow({ field }: { field: FieldChange }) {
  return (
    <div className="rounded-lg border border-border/60 bg-surface/60 p-2.5">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {field.label}
      </p>
      <div className="mt-1.5 grid gap-1.5 sm:grid-cols-2">
        <div className="rounded-md border border-destructive/20 bg-destructive/5 p-2">
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-destructive">
            Before
          </p>
          <pre className="overflow-x-auto whitespace-pre-wrap break-words font-mono text-xs leading-relaxed text-muted-foreground">
            {field.before}
          </pre>
        </div>
        <div className="rounded-md border border-success/20 bg-success/5 p-2">
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-success">
            After
          </p>
          <pre className="overflow-x-auto whitespace-pre-wrap break-words font-mono text-xs leading-relaxed">
            {field.after}
          </pre>
        </div>
      </div>
    </div>
  )
}

function ChangedRow({ change }: { change: TaskChange }) {
  return (
    <li className="space-y-2 rounded-xl border border-border/80 bg-card p-3">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <PencilLine className="h-4 w-4 text-warning" aria-hidden="true" />
        <span className="font-medium">{change.taskId}</span>
        {change.after ? <TypeBadge type={change.after.type} /> : null}
      </div>
      <div className="space-y-2">
        {change.fields.map((field) => (
          <FieldRow key={field.field} field={field} />
        ))}
      </div>
    </li>
  )
}

interface DefinitionDiffViewProps {
  diff: DefinitionDiff
  /** Label for the older side, e.g. "Version 2". */
  beforeLabel?: string
  /** Label for the newer side, e.g. "Version 3". */
  afterLabel?: string
}

/**
 * Renders a `DefinitionDiff` as a readable change list: which tasks were added,
 * removed, or modified, and - for modified tasks - exactly which fields moved
 * and from what to what.
 */
export function DefinitionDiffView({ diff, beforeLabel, afterLabel }: DefinitionDiffViewProps) {
  const heading =
    beforeLabel && afterLabel ? `${beforeLabel} \u2192 ${afterLabel}` : 'Changes'

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm font-medium">{heading}</p>
        <Badge variant={diff.hasChanges ? 'warning' : 'secondary'}>{diff.summary}</Badge>
      </div>

      {!diff.hasChanges ? (
        <p className="rounded-xl border border-dashed border-border/80 bg-card/40 p-6 text-center text-sm text-muted-foreground">
          These definitions are identical at the task level.
        </p>
      ) : (
        <div className="space-y-4">
          {diff.added.length > 0 ? (
            <section>
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Added ({diff.added.length})
              </h4>
              <ul className="space-y-1.5">
                {diff.added.map((change) => (
                  <AddedOrRemovedRow key={change.taskId} change={change} />
                ))}
              </ul>
            </section>
          ) : null}

          {diff.removed.length > 0 ? (
            <section>
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Removed ({diff.removed.length})
              </h4>
              <ul className="space-y-1.5">
                {diff.removed.map((change) => (
                  <AddedOrRemovedRow key={change.taskId} change={change} />
                ))}
              </ul>
            </section>
          ) : null}

          {diff.changed.length > 0 ? (
            <section>
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Changed ({diff.changed.length})
              </h4>
              <ul className={cn('space-y-2')}>
                {diff.changed.map((change) => (
                  <ChangedRow key={change.taskId} change={change} />
                ))}
              </ul>
            </section>
          ) : null}

          {diff.unchangedCount > 0 ? (
            <p className="text-xs text-muted-foreground">
              {diff.unchangedCount} task{diff.unchangedCount === 1 ? '' : 's'} unchanged.
            </p>
          ) : null}
        </div>
      )}
    </div>
  )
}
