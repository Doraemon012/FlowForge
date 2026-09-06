import { DocsSection } from '@/components/docs/DocsSection'
import { DocsCallout } from '@/components/docs/DocsCallout'
import { DocsVersionBadge } from '@/components/docs/DocsVersionBadge'
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
        <h1 className="docs-title">V1 features</h1>
        <p className="docs-lead">
          What FlowForge V1 does today, and what it deliberately leaves for later.
        </p>
        <div className="docs-hero-badges">
          <DocsVersionBadge label="V1" />
        </div>
      </div>

      <DocsSection title="Explore by area">
        <DocsCardGrid
          cards={[
            { title: 'Projects', description: 'Ownership and isolation boundary.', to: '/docs/creating-a-project', icon: FolderKanban },
            { title: 'Workflows', description: 'Named, versioned DAG definitions.', to: '/docs/creating-a-workflow', icon: WorkflowIcon },
            { title: 'Executions', description: 'One run of a specific version.', to: '/docs/executions', icon: Play },
            { title: 'Recovery', description: 'Leases, retries, and worker loss.', to: '/docs/recovery', icon: RefreshCw },
            { title: 'Observability', description: 'Events, logs, attempt history.', to: '/docs/observability', icon: Activity },
            { title: 'Task types', description: 'The V1 built-in task set.', to: '/docs/task-types', icon: Mail },
          ]}
        />
      </DocsSection>

      <DocsSection title="Implemented capabilities">
        <DocsTable
          headers={['Capability', 'What it does in V1']}
          rows={[
            ['Authentication & ownership', 'Email/password accounts, slow password hashes, short-lived bearer tokens, single-owner projects.'],
            ['Workflow drafts & versions', 'Validate, publish immutable versions, activate/deactivate the version that receives new triggers.'],
            ['Execution engine', 'Persisted state, dependency gating, parallel branches, idempotency.'],
            ['Durable queue & workers', 'Atomic claiming, independent workers, concurrent execution.'],
            ['Reliability & recovery', 'Leases, heartbeats, fencing, retries with exponential backoff, timeouts, cancellation, worker-loss recovery.'],
            ['Triggers', 'Manual/API, signed webhooks, scheduler with timezone, missed-occurrence and duplicate suppression.'],
            ['V1 task set', 'http, transform, delay, conditional, email behind a stable task contract with credential references, redaction, artifact references, and safe I/O limits.'],
            ['Observability', 'Lifecycle events, persisted logs, attempt history.'],
            ['Retention', 'Offline cleanup of append-only tables.'],
          ]}
        />
      </DocsSection>

      <DocsCallout variant="deferred" title="Deferred features">
        Team collaboration and roles, CLI/workflow-as-code, richer integrations,
        notifications, quotas and priorities, worker pools, external identity providers,
        multi-region, and a plugin marketplace are all planned for later — not part of V1.
      </DocsCallout>
    </>
  )
}
