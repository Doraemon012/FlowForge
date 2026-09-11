import { CalendarClock } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { ScheduleSection } from './ScheduleSection'
import { WebhookSection } from './WebhookSection'

interface TriggersDialogProps {
  projectId: string
  workflowId: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

/**
 * Trigger management for a workflow. Both trigger kinds (schedule and webhook)
 * target the workflow's active version, so this surface also states that
 * relationship explicitly to keep the activation semantics unambiguous.
 */
export function TriggersDialog({
  projectId,
  workflowId,
  open,
  onOpenChange,
}: TriggersDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarClock className="h-5 w-5 text-accent" aria-hidden="true" />
            Triggers
          </DialogTitle>
          <DialogDescription>
            Set up automatic runs for this workflow. Schedules and webhooks run the{' '}
            <strong>active version</strong>, so publish and activate one before relying on them.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <ScheduleSection projectId={projectId} workflowId={workflowId} />
          <WebhookSection projectId={projectId} workflowId={workflowId} />
        </div>

        <p className="text-xs text-muted-foreground">
          Manual runs use the same active version. Activation makes a version runnable; it does not
          start runs by itself.
        </p>
      </DialogContent>
    </Dialog>
  )
}
