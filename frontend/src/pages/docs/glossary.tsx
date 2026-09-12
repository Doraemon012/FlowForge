import { DocsSection } from '@/components/docs/DocsSection'
import { DocsCallout } from '@/components/docs/DocsCallout'
import { DocsTable } from '@/components/docs/DocsTable'

export function GlossaryPage() {
  return (
    <>
      <div className="docs-hero">
        <div className="docs-eyebrow">Guides & References</div>
        <h1 className="docs-title">Glossary</h1>
        <p className="docs-lead">
          A quick reference for the terms used throughout the docs and the FlowForge UI.
        </p>
      </div>

      <DocsSection title="Terms">
        <DocsTable
          headers={['Term', 'Definition']}
          rows={[
            ['Active version', 'The published version that receives new triggers.'],
            ['Artifact reference', 'A reference to a stored output value, used in place of large or sensitive values.'],
            ['At-least-once', 'A task may run more than once when completion is ambiguous.'],
            ['Attempt', 'One try of a task run. Attempt history is append-only.'],
            ['Backoff', 'A strategy that increases the wait between retries (exponentially).'],
            ['Blocked', 'A task run waiting on a dependency that has not succeeded.'],
            ['Conditional', 'A task type that evaluates a condition and branches.'],
            ['Credential reference', 'A reference to stored credential material; never exposed in responses.'],
            ['DAG', 'A directed acyclic graph of tasks. Dependencies flow one way, no cycles.'],
            ['Delay', 'A task type that waits for a configured duration.'],
            ['Draft', 'The editable, unpublished definition of a workflow.'],
            ['Email', 'A task type that sends an email notification. Requires a credential/provider.'],
            ['Execution', 'One run of a specific workflow version.'],
            ['Fencing', 'Rejecting results from a stale worker after its lease has expired.'],
            ['Heartbeat', 'A liveness signal from a worker.'],
            ['HTTP', 'A task type that performs an HTTP request. Requires a configured endpoint/credential.'],
            ['Idempotency', 'Safe duplicate-trigger protection using an Idempotency-Key.'],
            ['Idempotency key', 'A client-supplied key that makes a trigger repeatable.'],
            ['Lease', 'Bounded ownership of a task by a worker.'],
            ['Project', 'The isolation boundary and ownership unit.'],
            ['Published version', 'An immutable snapshot of a draft definition.'],
            ['Queue', 'Durable delivery between the orchestrator and workers. Backed by PostgreSQL.'],
            ['Redaction', 'Removing sensitive material from logs and responses.'],
            ['Retry policy', 'A rule set that decides whether and how a failed task run is retried.'],
            ['Task', 'A single unit of work with a type, config object, and optional dependencies.'],
            ['Task run', 'One task within an execution.'],
            ['Transform', 'A task type that applies a transformation to input.'],
            ['Version', 'An immutable published snapshot of a workflow definition.'],
            ['Worker', 'A process that leases and executes tasks.'],
            ['Worker-lost', 'A state where a worker has stopped heartbeating and its lease expires.'],
            ['Workflow', 'A named, versioned collection of tasks plus dependencies.'],
          ]}
        />
      </DocsSection>

      <DocsCallout variant="success" title="Every term is a real concept">
        Every term in this glossary corresponds to something real in the backend and, where
        noted, the frontend.
      </DocsCallout>
    </>
  )
}
