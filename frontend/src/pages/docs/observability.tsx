import { DocsSection, DocsParagraph } from '@/components/docs/DocsSection'
import { DocsCallout } from '@/components/docs/DocsCallout'
import { DocsTable } from '@/components/docs/DocsTable'

export function ObservabilityPage() {
  return (
    <>
      <div className="docs-hero">
        <div className="docs-eyebrow">Guides & References</div>
        <h1 className="docs-title">Observability</h1>
        <p className="docs-lead">
          Every execution, task run, and attempt is recorded. FlowForge exposes
          project-isolated observability endpoints, and the app surfaces attempt history and
          full execution views built on those durable records.
        </p>
      </div>

      <DocsSection title="What the API exposes">
        <DocsParagraph>
          The control plane exposes project-isolated endpoints for execution events, persisted
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

      <DocsSection title="What the app shows">
        <DocsParagraph>
          The execution detail page shows <strong>attempt history</strong>, per-task status,
          outputs, failures, worker assignments, and logs, refreshed by polling. Live
          log/event streaming is available from the API; the app reads the same durable
          records on refresh rather than opening a stream.
        </DocsParagraph>
      </DocsSection>

      <DocsSection title="Redaction">
        <DocsParagraph>
          Credential material is never logged or returned. Outputs may be replaced by{' '}
          <strong>artifact references</strong> when values are large or sensitive.
        </DocsParagraph>
      </DocsSection>

      <DocsCallout variant="info" title="Worker, queue, and metrics views">
        Worker activity, queue/lease health, and aggregate metrics are served by the API
        endpoints above and are used for operations. They are not currently rendered as
        dedicated pages in the app.
      </DocsCallout>
    </>
  )
}
