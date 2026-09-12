import { DocsSection } from '@/components/docs/DocsSection'
import { DocsTable } from '@/components/docs/DocsTable'
import { DocsCardGrid } from '@/components/docs/DocsCardGrid'
import {
  FolderKanban,
  Workflow as WorkflowIcon,
  Play,
  RefreshCw,
  Activity,
  Mail,
} from 'lucide-react'

export function FeaturesPage() {
  return (
    <>
      <div className="docs-hero">
        <div className="docs-eyebrow">Concepts</div>
        <h1 className="docs-title">Features</h1>
        <p className="docs-lead">
          The capabilities behind every workflow you run — what FlowForge does today.
        </p>
      </div>

      <DocsSection title="Explore by area">
        <DocsCardGrid
          cards={[
            { title: 'Projects', description: 'Ownership and isolation boundary.', to: '/docs/creating-a-project', icon: FolderKanban },
            { title: 'Workflows', description: 'Named, versioned DAG definitions.', to: '/docs/creating-a-workflow', icon: WorkflowIcon },
            { title: 'Executions', description: 'One run of a specific version.', to: '/docs/executions', icon: Play },
            { title: 'Recovery', description: 'Leases, retries, and worker loss.', to: '/docs/recovery', icon: RefreshCw },
            { title: 'Observability', description: 'Events, logs, attempt history.', to: '/docs/observability', icon: Activity },
            { title: 'Task types', description: 'The built-in task set.', to: '/docs/task-types', icon: Mail },
          ]}
        />
      </DocsSection>

      <DocsSection title="Implemented capabilities">
        <DocsTable
          headers={['Capability', 'What it does']}
          rows={[
            ['Authentication & ownership', 'Email/password accounts, slow password hashes, short-lived bearer tokens, single-owner projects.'],
            ['Workflow drafts & versions', 'Validate, publish immutable versions, activate/deactivate the version that receives new triggers.'],
            ['Execution engine', 'Persisted state, dependency gating, parallel branches, idempotency.'],
            ['Durable queue & workers', 'Atomic claiming, independent workers, concurrent execution.'],
            ['Reliability & recovery', 'Leases, heartbeats, fencing, retries with exponential backoff, timeouts, cancellation, worker-loss recovery.'],
            ['Triggers', 'Manual/API, signed webhooks, scheduler with timezone, missed-occurrence and duplicate suppression.'],
            ['Task types', 'http, transform, delay, conditional, email behind a stable task contract with credential references, redaction, artifact references, and safe I/O limits.'],
            ['Observability', 'Lifecycle events, persisted logs, attempt history.'],
            ['Retention', 'Offline cleanup of append-only tables.'],
          ]}
        />
      </DocsSection>
    </>
  )
}
