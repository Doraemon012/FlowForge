import { Link2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface TaskConnectionsProps {
  incoming: string[]
  outgoing: string[]
  onRemoveDependency?: (dependencyId: string) => void
}

/**
 * Describes how the selected task is wired into the graph. The explanation of
 * where a task's input comes from used to be a three-item list; it is now one
 * sentence derived from the actual connection count, so the panel says the one
 * thing that is true for this task instead of listing all three cases.
 */
export function TaskConnections({
  incoming,
  outgoing,
  onRemoveDependency,
}: TaskConnectionsProps) {
  const inputSource =
    incoming.length === 0
      ? 'the workflow\u2019s execution input'
      : incoming.length === 1
        ? `the output of ${incoming[0]}`
        : 'an object keyed by each upstream task ID'

  return (
    <section className="space-y-3 rounded-lg border border-border/70 bg-muted/30 p-3">
      <div className="flex items-center gap-2">
        <Link2 className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Connections
        </h3>
      </div>

      <div className="space-y-1.5">
        <p className="text-xs font-medium">
          Runs after
          {incoming.length > 0 ? (
            <span className="ml-1 font-normal text-muted-foreground">({incoming.length})</span>
          ) : null}
        </p>
        {incoming.length === 0 ? (
          <p className="text-xs text-muted-foreground">Nothing — this task can run first.</p>
        ) : (
          <ul className="space-y-1">
            {incoming.map((dependencyId) => (
              <li
                key={dependencyId}
                className="flex items-center gap-2 rounded-md border border-border/70 bg-card px-2 py-1"
              >
                <span className="min-w-0 flex-1 truncate font-mono text-xs">{dependencyId}</span>
                {onRemoveDependency ? (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 shrink-0"
                    aria-label={`Remove connection from ${dependencyId}`}
                    title="Remove connection"
                    onClick={() => onRemoveDependency(dependencyId)}
                  >
                    <X className="h-3.5 w-3.5" aria-hidden="true" />
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="space-y-1.5">
        <p className="text-xs font-medium">
          Feeds into
          {outgoing.length > 0 ? (
            <span className="ml-1 font-normal text-muted-foreground">({outgoing.length})</span>
          ) : null}
        </p>
        {outgoing.length === 0 ? (
          <p className="text-xs text-muted-foreground">Nothing yet — connect it to a next task.</p>
        ) : (
          <ul className="flex flex-wrap gap-1">
            {outgoing.map((taskId) => (
              <li
                key={taskId}
                className="rounded-md border border-border/70 bg-card px-2 py-0.5 font-mono text-xs"
              >
                {taskId}
              </li>
            ))}
          </ul>
        )}
      </div>

      <p className="border-t border-border/70 pt-2 text-xs text-muted-foreground">
        Input: {inputSource}.
      </p>
    </section>
  )
}
