import { DocsSection, DocsParagraph } from '@/components/docs/DocsSection'
import { DocsCallout } from '@/components/docs/DocsCallout'
import { DocsVersionBadge } from '@/components/docs/DocsVersionBadge'
import { DocsCodeBlock } from '@/components/docs/DocsCodeBlock'
import { DocsTable } from '@/components/docs/DocsTable'

export function AddingTasksPage() {
  const taskTypes = [
    ['http', 'Performs an HTTP request.', 'Requires a configured endpoint / credential.'],
    ['transform', 'Applies a transformation to input.', 'Runs end-to-end in the simple samples.'],
    ['delay', 'Waits for a configured duration.', 'Runs end-to-end in the simple samples.'],
    ['conditional', 'Evaluates a condition and branches.', 'Runs end-to-end in the simple samples.'],
    ['email', 'Sends an email notification.', 'Requires a configured credential / provider.'],
  ]
  return (
    <>
      <div className="docs-hero">
        <div className="docs-eyebrow">Getting Started</div>
        <h1 className="docs-title">Add tasks</h1>
        <p className="docs-lead">
          A task is a single unit of work. Add one from the palette on the left and
          configure it in the panel on the right.
        </p>
        <div className="docs-hero-badges">
          <DocsVersionBadge label="V1" />
        </div>
      </div>

      <DocsSection title="From the palette">
        <DocsParagraph>
          In the builder, drag a task type from the <strong>task palette</strong> onto the
          canvas, or click it. Select a task and use the <strong>config panel</strong> to set
          its fields. The config panel adapts to the selected task type.
        </DocsParagraph>
      </DocsSection>

      <DocsSection title="Task shape">
        <DocsCodeBlock
          language="json"
          title="Task definition"
          code={`{
  "id": "normalize",
  "type": "transform",
  "config": { "expression": "..." },
  "depends_on": []
}`}
        />
      </DocsSection>

      <DocsSection title="Supported V1 types">
        <DocsTable
          headers={['Type', 'What it does', 'V1 config note']}
          rows={taskTypes.map((r) => r.map((cell, i) => (i === 0 ? <strong key={cell}>{cell}</strong> : cell)))}
        />
      </DocsSection>

      <DocsCallout variant="v1" title="All five are V1">
        The simple follow-along samples use <code>transform</code>, <code>conditional</code>,
        and <code>delay</code> so they run with zero external setup.
      </DocsCallout>

      <DocsCallout variant="warning" title="http & email need setup">
        <code>http</code> and <code>email</code> require configured credentials and endpoints.
        The simple tutorials deliberately avoid them.
      </DocsCallout>
    </>
  )
}
