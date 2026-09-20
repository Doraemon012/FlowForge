import { Link } from 'react-router-dom'
import {
  ArrowLeft,
  Braces,
  CalendarClock,
  ChevronDown,
  MoreHorizontal,
  Play,
  PlayCircle,
  RotateCcw,
  Save,
  ShieldOff,
  Sparkles,
  Workflow as WorkflowIcon,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import type { BuilderView } from './builder-view'

const STATUS_VARIANT: Record<string, 'success' | 'secondary' | 'warning' | 'info'> = {
  active: 'success',
  paused: 'warning',
  draft: 'secondary',
}

const STATUS_EXPLANATION: Record<string, string> = {
  active:
    'Active means this version is runnable. It runs when you press Run, or when a configured schedule or webhook triggers it \u2014 it does not run on its own.',
  paused: 'Paused means the active version is temporarily disabled and will not be triggered.',
  draft:
    'Draft means no version is active yet. Publish and activate a version to make it runnable.',
}

interface BuilderHeaderProps {
  projectId: string
  workflowId: string
  name: string
  onNameChange: (name: string) => void
  description: string
  onDescriptionChange: (description: string) => void
  status: string
  hasChanges: boolean
  view: BuilderView
  onViewChange: (view: BuilderView) => void
  hasActiveVersion: boolean
  isSaving: boolean
  isPublishing: boolean
  isRunning: boolean
  isDeactivating: boolean
  runBlockedReason: string | null
  onSave: () => void
  onPublish: () => void
  onDeactivate: () => void
  onRun: () => void
  onOpenAi: () => void
  onOpenTriggers: () => void
  onResetToSaved: () => void
}

/**
 * The builder header, in two tiers.
 *
 * Tier 1 answers "what am I editing and what is its state", and carries the
 * actions a workflow is actually built around: the AI assistant, Save, Publish,
 * Run. Tier 2 answers "what else can I do here" and holds the secondary
 * surfaces (the view switch, triggers, version history, the run log) behind one
 * overflow menu.
 *
 * Previously all eleven controls sat in a single wrapping row at identical
 * visual weight, which made `Run` indistinguishable from `Deactivate` and left
 * no obvious next action.
 */
export function BuilderHeader({
  projectId,
  workflowId,
  name,
  onNameChange,
  description,
  onDescriptionChange,
  status,
  hasChanges,
  view,
  onViewChange,
  hasActiveVersion,
  isSaving,
  isPublishing,
  isRunning,
  isDeactivating,
  runBlockedReason,
  onSave,
  onPublish,
  onDeactivate,
  onRun,
  onOpenAi,
  onOpenTriggers,
  onResetToSaved,
}: BuilderHeaderProps) {
  const nameInvalid = name.trim().length === 0 || name.length > 200
  const versionsPath = `/app/projects/${projectId}/workflows/${workflowId}/versions`
  const runsPath = `/app/projects/${projectId}/executions`

  return (
    <header className="shrink-0 border-b bg-surface">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2">
        <Link
          to={`/app/projects/${projectId}/workflows`}
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground"
          aria-label="Back to workflows"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        </Link>

        <input
          value={name}
          onChange={(event) => onNameChange(event.target.value)}
          aria-label="Workflow name"
          aria-invalid={nameInvalid}
          placeholder="Untitled workflow"
          className={cn(
            'min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-2 py-1 font-display text-base font-semibold tracking-tight outline-none transition-colors',
            'hover:border-border-strong hover:bg-surface-2',
            'focus-visible:border-accent-dim focus-visible:bg-bg',
            nameInvalid && 'border-destructive/60',
          )}
          style={{ maxWidth: '32rem' }}
        />

        <Badge
          variant={STATUS_VARIANT[status] ?? 'info'}
          className="shrink-0 capitalize"
          title={STATUS_EXPLANATION[status] ?? undefined}
        >
          {status}
        </Badge>

        {hasChanges ? (
          <span
            role="status"
            className="inline-flex shrink-0 items-center gap-1.5 text-xs font-medium text-warning"
          >
            <span className="h-1.5 w-1.5 rounded-full bg-warning" aria-hidden="true" />
            Unsaved
          </span>
        ) : null}

        {/* `ml-auto` rather than a `grow` spacer: a spacer is itself a flex
            item competing for free space, which halved the width the name
            input could take and clipped it to "Daily orde". */}
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {/* The AI assistant used to sit inside the overflow menu, which made
              a headline FlowForge capability read as a minor utility. It is
              promoted to its own button so it is discoverable at a glance, and
              given the accent-tinted `ai` variant so a third neutral button
              does not compete with `Save`/`Publish` for attention. It leads the
              group because it authors a definition, while Save/Publish/Run act
              on one that already exists. */}
          <Button
            variant="ai"
            size="sm"
            onClick={onOpenAi}
            title="Generate or refine this workflow with AI"
            aria-label="AI assistant"
          >
            <Sparkles className="mr-2 h-4 w-4" aria-hidden="true" />
            AI
          </Button>

          {/* Save is deliberately *not* the accent-filled variant: `Run` owns
              that. Two filled primary buttons side by side left the user
              choosing between two "obvious" actions; Save lifts to the
              bordered secondary weight when there is something to save,
              which is still clearly actionable. */}
          <Button
            onClick={onSave}
            loading={isSaving}
            disabled={!hasChanges}
            size="sm"
            variant={hasChanges ? 'secondary' : 'outline'}
            title={hasChanges ? 'Save the current definition' : 'Everything is saved'}
          >
            <Save className="mr-2 h-4 w-4" aria-hidden="true" />
            Save
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" loading={isPublishing}>
                <PlayCircle className="mr-2 h-4 w-4" aria-hidden="true" />
                Publish
                <ChevronDown className="ml-1.5 h-3.5 w-3.5" aria-hidden="true" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64">
              <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
                Snapshot the current definition as a new version.
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={onPublish}>
                <PlayCircle className="mr-2 h-4 w-4" aria-hidden="true" />
                Publish and activate
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link to={versionsPath}>
                  <WorkflowIcon className="mr-2 h-4 w-4" aria-hidden="true" />
                  Manage versions
                </Link>
              </DropdownMenuItem>
              {hasActiveVersion ? (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={onDeactivate}
                    disabled={isDeactivating}
                    className="text-destructive focus:text-destructive"
                  >
                    <ShieldOff className="mr-2 h-4 w-4" aria-hidden="true" />
                    Deactivate active version
                  </DropdownMenuItem>
                </>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" aria-label="More workflow actions">
                <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-60">
              <DropdownMenuItem onClick={onOpenTriggers}>
                <CalendarClock className="mr-2 h-4 w-4" aria-hidden="true" />
                Schedules and webhooks
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link to={runsPath}>
                  <Play className="mr-2 h-4 w-4" aria-hidden="true" />
                  Run history
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link to={versionsPath}>
                  <WorkflowIcon className="mr-2 h-4 w-4" aria-hidden="true" />
                  Version history
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={onResetToSaved}
                disabled={!hasChanges}
                className="text-destructive focus:text-destructive"
              >
                <RotateCcw className="mr-2 h-4 w-4" aria-hidden="true" />
                Discard unsaved changes
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <Button
            onClick={onRun}
            loading={isRunning}
            disabled={Boolean(runBlockedReason)}
            size="sm"
            title={runBlockedReason ?? 'Run the active version'}
          >
            <Play className="mr-2 h-4 w-4" aria-hidden="true" />
            Run
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-border/60 px-3 py-1.5">
        <input
          value={description}
          onChange={(event) => onDescriptionChange(event.target.value)}
          placeholder="Add a description…"
          aria-label="Workflow description"
          className="min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-2 py-1 text-sm text-muted-foreground outline-none transition-colors hover:border-border-strong hover:bg-surface-2 focus-visible:border-accent-dim focus-visible:bg-bg focus-visible:text-foreground"
          style={{ maxWidth: '40rem' }}
        />

        <div
          className="ml-auto inline-flex shrink-0 items-center rounded-lg border border-border bg-card p-0.5"
          role="tablist"
          aria-label="Authoring view"
        >
          <button
            type="button"
            role="tab"
            aria-selected={view === 'graph'}
            onClick={() => onViewChange('graph')}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-sm font-medium transition-colors',
              view === 'graph'
                ? 'bg-muted text-foreground'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <WorkflowIcon className="h-4 w-4" aria-hidden="true" />
            Build
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={view === 'json'}
            onClick={() => onViewChange('json')}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-sm font-medium transition-colors',
              view === 'json'
                ? 'bg-muted text-foreground'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <Braces className="h-4 w-4" aria-hidden="true" />
            JSON
          </button>
        </div>
      </div>
    </header>
  )
}
