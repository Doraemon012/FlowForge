import { useEffect, useState } from 'react'
import { CalendarClock, Pencil, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { ApiError } from '@/api/client'
import {
  useCreateSchedule,
  useDeleteSchedule,
  useSchedule,
  useUpdateSchedule,
} from '@/hooks/use-triggers'
import { useWorkflow } from '@/hooks/use-workflows'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { formatDateTime } from '@/lib/utils'

const CRON_PRESETS: { label: string; expression: string }[] = [
  { label: 'Every 15 minutes', expression: '*/15 * * * *' },
  { label: 'Hourly', expression: '0 * * * *' },
  { label: 'Daily at 09:00', expression: '0 9 * * *' },
  { label: 'Weekdays at 09:00', expression: '0 9 * * 1-5' },
  { label: 'Weekly on Monday', expression: '0 9 * * 1' },
]

const COMMON_TIMEZONES = [
  'UTC',
  'America/New_York',
  'America/Chicago',
  'America/Los_Angeles',
  'Europe/London',
  'Europe/Berlin',
  'Asia/Kolkata',
  'Asia/Singapore',
  'Australia/Sydney',
]

function browserTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  } catch {
    return 'UTC'
  }
}

interface ScheduleSectionProps {
  projectId: string
  workflowId: string
}

/**
 * Schedule trigger management. A workflow has at most one schedule, which the
 * server reports as a 404 until it exists; the query maps that to `null`.
 */
export function ScheduleSection({ projectId, workflowId }: ScheduleSectionProps) {
  const scheduleQuery = useSchedule(projectId, workflowId)
  const workflowQuery = useWorkflow(projectId, workflowId)
  const createMutation = useCreateSchedule(projectId, workflowId)
  const updateMutation = useUpdateSchedule(projectId, workflowId)
  const deleteMutation = useDeleteSchedule(projectId, workflowId)

  const schedule = scheduleQuery.data ?? null
  const isActive = Boolean(workflowQuery.data?.active_version_id)

  const [editing, setEditing] = useState(false)
  const [cron, setCron] = useState('')
  const [timezone, setTimezone] = useState(browserTimezone())

  // When a schedule appears (or is replaced), the form mirrors it so edits
  // start from the persisted values rather than stale local state.
  useEffect(() => {
    if (schedule) {
      setCron(schedule.cron_expression)
      setTimezone(schedule.timezone)
    }
  }, [schedule])

  const reportError = (error: unknown, fallback: string) => {
    if (error instanceof ApiError) {
      toast.error(error.message)
    } else {
      toast.error(fallback)
    }
  }

  const handleCreate = async () => {
    try {
      await createMutation.mutateAsync({ cron_expression: cron.trim(), timezone })
      toast.success('Schedule created')
      setEditing(false)
    } catch (error) {
      reportError(error, 'Could not create the schedule.')
    }
  }

  const handleUpdate = async () => {
    if (!schedule) return
    try {
      await updateMutation.mutateAsync({
        cron_expression: cron.trim(),
        timezone,
        enabled: schedule.enabled,
      })
      toast.success('Schedule updated')
      setEditing(false)
    } catch (error) {
      reportError(error, 'Could not update the schedule.')
    }
  }

  const handleToggleEnabled = async () => {
    if (!schedule) return
    try {
      await updateMutation.mutateAsync({
        cron_expression: schedule.cron_expression,
        timezone: schedule.timezone,
        enabled: !schedule.enabled,
      })
      toast.success(schedule.enabled ? 'Schedule paused' : 'Schedule resumed')
    } catch (error) {
      reportError(error, 'Could not change the schedule state.')
    }
  }

  const handleDelete = async () => {
    try {
      await deleteMutation.mutateAsync()
      toast.success('Schedule deleted')
      setEditing(false)
    } catch (error) {
      reportError(error, 'Could not delete the schedule.')
    }
  }

  const busy =
    createMutation.isPending || updateMutation.isPending || deleteMutation.isPending

  const form = (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor="schedule-cron">Cron expression</Label>
        <Input
          id="schedule-cron"
          value={cron}
          onChange={(event) => setCron(event.target.value)}
          placeholder="0 9 * * *"
          className="font-mono"
          spellCheck={false}
          autoComplete="off"
        />
        <div className="flex flex-wrap gap-1.5 pt-1">
          {CRON_PRESETS.map((preset) => (
            <button
              key={preset.expression}
              type="button"
              onClick={() => setCron(preset.expression)}
              className="rounded-full border border-border px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:border-accent hover:text-foreground"
            >
              {preset.label}
            </button>
          ))}
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="schedule-timezone">Timezone</Label>
        <Input
          id="schedule-timezone"
          value={timezone}
          onChange={(event) => setTimezone(event.target.value)}
          list="schedule-timezone-options"
          placeholder="UTC"
          spellCheck={false}
          autoComplete="off"
        />
        <datalist id="schedule-timezone-options">
          {COMMON_TIMEZONES.map((zone) => (
            <option key={zone} value={zone} />
          ))}
        </datalist>
      </div>
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          onClick={schedule ? handleUpdate : handleCreate}
          loading={busy}
          disabled={cron.trim().length === 0}
        >
          {schedule ? 'Save schedule' : 'Create schedule'}
        </Button>
        {schedule ? (
          <Button variant="ghost" size="sm" onClick={() => setEditing(false)} disabled={busy}>
            Cancel
          </Button>
        ) : null}
      </div>
    </div>
  )

  return (
    <section className="space-y-3" aria-labelledby="schedule-heading">
      <div className="flex items-start gap-2">
        <CalendarClock className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <div>
          <h3 id="schedule-heading" className="text-sm font-semibold">
            Schedule
          </h3>
          <p className="text-xs text-muted-foreground">
            Run the active version automatically on a cron cadence.
          </p>
        </div>
      </div>

      {scheduleQuery.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading schedule…</p>
      ) : null}

      {!scheduleQuery.isLoading && !schedule && !editing ? (
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">No schedule configured.</p>
          <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
            <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
            Add schedule
          </Button>
        </div>
      ) : null}

      {!scheduleQuery.isLoading && !schedule && editing ? form : null}

      {schedule ? (
        <div className="space-y-3 rounded-lg border border-border bg-muted/40 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <code className="rounded bg-background px-2 py-0.5 font-mono text-xs">
              {schedule.cron_expression}
            </code>
            <span className="text-xs text-muted-foreground">{schedule.timezone}</span>
            <Badge variant={schedule.enabled ? 'success' : 'warning'}>
              {schedule.enabled ? 'enabled' : 'paused'}
            </Badge>
            {!isActive ? (
              <span className="text-xs text-warning">
                Publish and activate a version — the schedule triggers the active version.
              </span>
            ) : null}
          </div>

          <dl className="grid grid-cols-1 gap-2 text-xs sm:grid-cols-2">
            <div>
              <dt className="text-muted-foreground">Next run</dt>
              <dd>{formatDateTime(schedule.next_occurrence ?? null)}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Last triggered</dt>
              <dd>{formatDateTime(schedule.last_triggered_at ?? null)}</dd>
            </div>
          </dl>

          {editing ? (
            form
          ) : (
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={handleToggleEnabled}
                loading={updateMutation.isPending}
              >
                {schedule.enabled ? 'Pause' : 'Resume'}
              </Button>
              <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
                <Pencil className="mr-2 h-4 w-4" aria-hidden="true" />
                Edit
              </Button>
              <Button
                size="sm"
                variant="destructive"
                onClick={handleDelete}
                loading={deleteMutation.isPending}
              >
                <Trash2 className="mr-2 h-4 w-4" aria-hidden="true" />
                Delete
              </Button>
            </div>
          )}
        </div>
      ) : null}

      <Separator />
    </section>
  )
}
