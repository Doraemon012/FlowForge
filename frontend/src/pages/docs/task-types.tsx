import { DocsSection, DocsParagraph } from '@/components/docs/DocsSection'
import { DocsCallout } from '@/components/docs/DocsCallout'
import { DocsTable } from '@/components/docs/DocsTable'

export function TaskTypesPage() {
  return (
    <>
      <div className="docs-hero">
        <div className="docs-eyebrow">Guides & References</div>
        <h1 className="docs-title">Supported task types</h1>
        <p className="docs-lead">
          FlowForge ships five built-in task types behind a stable task contract. Each has a
          type, a config object, and optional dependency references.
        </p>
      </div>

      <DocsSection title="The built-in task set">
        <DocsTable
          headers={['Type', 'What it does', 'Config note']}
          rows={[
            ['http', 'Performs an HTTP request.', 'Requires a configured endpoint or credential.'],
            ['transform', 'Applies a transformation to input.', 'Runs end-to-end in the simple samples.'],
            ['delay', 'Waits for a configured duration.', 'Runs end-to-end in the simple samples.'],
            ['conditional', 'Evaluates a condition and branches.', 'Runs end-to-end in the simple samples.'],
            ['email', 'Sends an email notification.', 'Requires a configured credential or provider.'],
          ]}
        />
      </DocsSection>

      <DocsSection title="Task contract">
        <DocsParagraph>
          Every task has an <code>id</code>, a <code>type</code>, a <code>config</code>{' '}
          object, and a <code>depends_on</code> list. The config fields are type-specific,
          and the builder's config panel adapts to the selected type.
        </DocsParagraph>
      </DocsSection>

      <DocsCallout variant="success" title="Which types run with no setup">
        The simple follow-along samples use <code>transform</code>, <code>conditional</code>,
        and <code>delay</code> so they run end-to-end with zero external setup.{' '}
        <code>http</code> and <code>email</code> are fully supported types but need
        configured credentials or endpoints.
      </DocsCallout>
    </>
  )
}
