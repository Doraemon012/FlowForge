import { DocsSection } from '@/components/docs/DocsSection'
import { DocsCallout } from '@/components/docs/DocsCallout'
import { DocsVersionBadge } from '@/components/docs/DocsVersionBadge'

export function TroubleshootingPage() {
  return (
    <>
      <div className="docs-hero">
        <div className="docs-eyebrow">Guides & References</div>
        <h1 className="docs-title">Troubleshooting</h1>
        <p className="docs-lead">
          Common mistakes and how to fix them. If something isn't behaving as expected,
          start here.
        </p>
        <div className="docs-hero-badges">
          <DocsVersionBadge label="V1" />
        </div>
      </div>

      <DocsSection title="Common issues">
        <DocsCallout variant="warning" title="Run button is disabled">
          No version is active. Publish a version, then activate it on the Versions page.
        </DocsCallout>
        <DocsCallout variant="warning" title="Unknown dependency or cycle detected">
          Check the <code>depends_on</code> list for each task. Remove cycles and duplicate
          edges.
        </DocsCallout>
        <DocsCallout variant="warning" title="Duplicate task ID">
          Each task must have a unique <code>id</code>. Use distinct IDs for every task.
        </DocsCallout>
        <DocsCallout variant="warning" title="Validation fails with 422">
          Inspect the per-task error messages in the validation response. They point you to
          the exact task and field.
        </DocsCallout>
        <DocsCallout variant="warning" title="Execution stays running but nothing progresses">
          No live worker is processing the queue. Check that a worker is running.
        </DocsCallout>
        <DocsCallout variant="info" title="Attempt history shows not available (HTTP 501)">
          Observability may not be configured in this deployment. This is expected, not an
          error.
        </DocsCallout>
        <DocsCallout variant="info" title="http or email task never succeeds">
          These tasks require a configured credential or endpoint. The simple samples
          intentionally avoid them.
        </DocsCallout>
      </DocsSection>

      <DocsCallout variant="security" title="Keep secrets out of config">
        Never paste credentials or internal URLs into workflow config examples or
        definitions.
      </DocsCallout>
    </>
  )
}
