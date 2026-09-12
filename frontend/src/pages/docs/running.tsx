import { DocsSection, DocsParagraph } from '@/components/docs/DocsSection'
import { DocsCallout } from '@/components/docs/DocsCallout'
import { DocsCodeBlock } from '@/components/docs/DocsCodeBlock'

export function RunningPage() {
  return (
    <>
      <div className="docs-hero">
        <div className="docs-eyebrow">Getting Started</div>
        <h1 className="docs-title">Run a workflow</h1>
        <p className="docs-lead">
          Trigger an execution from an active version. FlowForge returns immediately with an
          execution ID; your work is picked up by a worker asynchronously.
        </p>
      </div>

      <DocsSection title="In the UI">
        <DocsParagraph>
          Open a workflow with an <strong>active version</strong> and click{' '}
          <strong>Run</strong>. You can optionally provide an input payload. The app
          navigates to the execution detail page, which polls at a controlled 2-second
          interval until the execution reaches a terminal state.
        </DocsParagraph>
      </DocsSection>

      <DocsSection title="Via the API">
        <DocsParagraph>
          The endpoint returns <strong>202 Accepted</strong> immediately with an execution
          ID. The frontend never blocks waiting for completion.
        </DocsParagraph>
        <DocsCodeBlock
          language="bash"
          title="POST /api/v1/projects/{project_id}/workflows/{workflow_id}/executions"
          code={`curl -X POST http://localhost:8080/api/v1/projects/$PROJECT_ID/workflows/$WORKFLOW_ID/executions \\
  -H "Authorization: Bearer $TOKEN" \\
  -H "Content-Type: application/json" \\
  -H "Idempotency-Key: order-123" \\
  -d '{"input":{"orderId":"123","amount":120}}'`}
        />
      </DocsSection>

      <DocsSection title="Idempotency">
        <DocsParagraph>
          Reusing the same <code>Idempotency-Key</code> with the same input returns the
          original acceptance rather than creating a duplicate execution. Reusing the key
          with different input is rejected.
        </DocsParagraph>
      </DocsSection>

      <DocsCallout variant="v1" title="A successful request never implies task success">
        A <code>202 Accepted</code> tells you the run was durably accepted — it does not
        mean every task succeeded. Monitor the execution detail page for the actual outcome.
      </DocsCallout>

      <DocsCallout variant="warning" title="Run is disabled?">
        The <strong>Run</strong> button is disabled until a version is{' '}
        <strong>active</strong>. Publish a version, then activate it on the Versions page.
      </DocsCallout>
    </>
  )
}
