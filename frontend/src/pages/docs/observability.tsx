import { DocsSection, DocsParagraph } from '@/components/docs/DocsSection'
import { DocsCallout } from '@/components/docs/DocsCallout'
import { DocsVersionBadge } from '@/components/docs/DocsVersionBadge'
import { DocsTable } from '@/components/docs/DocsTable'

export function ObservabilityPage() {
  return (
    <>
      <div className="docs-hero">
        <div className="docs-eyebrow">Guides & References</div>
        <h1 className="docs-title">Observability</h1>
        <p className="docs-lead">
          Every execution, task run, and attempt is recorded. The backend exposes
          project-isolated observability endpoints, and the V1 frontend surfaces attempt
          history and execution views.
        </p>
        <div className="docs-hero-badges">
          <DocsVersionBadge label="V1" />
        </div>
      </div>

      <DocsSection title="What the backend exposes">
        <DocsParagraph>
          The backend exposes project-isolated endpoints for execution events, persisted
          logs, attempt history, worker activity, queue and lease health, and metrics.
        </DocsParagraph>
        <DocsTable
          headers={['Capability', 'Notes']}
          rows={[
            ['Execution events', 'Lifecycle events for each execution.'],
            ['Persisted logs', 'Task output and log entries, with credentials redacted.'],
            ['Attempt history', 'Append-only record of every attempt for a task run.'],
            ['Worker activity', 'Worker registration and heartbeat status.'],
          ]}
        />
      </DocsSection>

      <DocsSection title="What the V1 frontend surfaces">
        <DocsParagraph>
          The V1 app shows <strong>attempt history</strong> on the execution detail page and
          the execution list/detail with polling. Log and event streaming are backend
          capabilities; the V1 app does not render live streams yet.
        </DocsParagraph>
      </DocsSection>

      <DocsSection title="Redaction">
        <DocsParagraph>
          Credential material is never logged or returned. Outputs may be replaced by{' '}
          <strong>artifact references</strong> when values are large or sensitive.
        </DocsParagraph>
      </DocsSection>

      <DocsCallout variant="deferred" title="Frontend gap">
        Worker/queue/metrics UI and real-time log/event streaming are not surfaced in the V1
        app. The backend supports these endpoints; the UI does not render them yet.
      </DocsCallout>
    </>
  )
}
