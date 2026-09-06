import { DocsSection, DocsParagraph } from '@/components/docs/DocsSection'
import { DocsCallout } from '@/components/docs/DocsCallout'
import { DocsVersionBadge } from '@/components/docs/DocsVersionBadge'
import { DocsCodeBlock } from '@/components/docs/DocsCodeBlock'
import { DocsSteps } from '@/components/docs/DocsSteps'

export function ValidationPage() {
  return (
    <>
      <div className="docs-hero">
        <div className="docs-eyebrow">Getting Started</div>
        <h1 className="docs-title">Validation</h1>
        <p className="docs-lead">
          Validate a workflow before you publish. The builder and the server both check the
          graph and task configuration, so you catch problems early.
        </p>
        <div className="docs-hero-badges">
          <DocsVersionBadge label="V1" />
        </div>
      </div>

      <DocsSection title="In the builder">
        <DocsParagraph>
          Click <strong>Validate</strong> in the builder toolbar. The frontend performs
          immediate client-side checks — cycle detection, duplicate edges, missing or blank
          IDs, and unknown dependencies — and then calls the server for authoritative
          validation.
        </DocsParagraph>
        <DocsSteps
          steps={[
            {
              title: 'Click Validate',
              description: 'Runs client-side checks first, then calls the server endpoint.',
            },
            {
              title: 'Review the results',
              description:
                'Errors are associated with the relevant task, so you can fix them inline.',
            },
            {
              title: 'Fix and re-validate',
              description:
                'Repeat until the workflow validates cleanly before publishing.',
            },
          ]}
        />
      </DocsSection>

      <DocsSection title="Server rules">
        <DocsParagraph>
          The server accepts only a valid acyclic graph with supported task types,
          configuration objects, and valid dependency references. It rejects empty
          definitions, duplicate or blank IDs, unknown dependencies, self-dependencies,
          cycles, and unsupported types.
        </DocsParagraph>
        <DocsParagraph>
          Invalid input returns a <code>422</code> with deterministic field errors that
          identify the offending task, so the UI can surface actionable messages per task
          rather than a generic failure.
        </DocsParagraph>
      </DocsSection>

      <DocsSection title="Validation response">
        <DocsParagraph>
          The validate endpoint returns a <code>valid</code> flag plus a list of per-task
          errors.
        </DocsParagraph>
        <DocsCodeBlock
          language="json"
          title="POST /api/v1/projects/{project_id}/workflows/{workflow_id}/validate"
          code={`{
  "valid": false,
  "errors": [
    {
      "taskId": "route",
      "code": "unknown_dependency",
      "message": "Task 'route' depends on unknown task 'missing'."
    }
  ]
}`}
        />
      </DocsSection>

      <DocsCallout variant="warning" title="Actionable errors, not raw HTTP">
        The UI surfaces per-task error messages in developer-friendly language. You should
        never see a raw <code>HTTP 500</code> for a graph problem.
      </DocsCallout>
    </>
  )
}
