import { DocsSection, DocsParagraph } from '@/components/docs/DocsSection'
import { DocsCallout } from '@/components/docs/DocsCallout'
import { DocsVersionBadge } from '@/components/docs/DocsVersionBadge'
import { DocsTable } from '@/components/docs/DocsTable'

export function TaskTypesPage() {
  return (
    <>
      <div className="docs-hero">
        <div className="docs-eyebrow">Guides & References</div>
        <h1 className="docs-title">Supported task types</h1>
        <p className="docs-lead">
          V1 ships five built-in task types behind a stable task contract. Each has a type,
          a config object, and optional dependency references.
        </p>
        <div className="docs-hero-badges">
          <DocsVersionBadge label="V1" />
        </div>
      </div>

      <DocsSection title="The V1 task set">
        <DocsTable
          headers={['Type', 'What it does', 'V1 config note']}
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

      <DocsCallout variant="v1" title="All five are V1">
        The simple follow-along samples use <code>transform</code>, <code>conditional</code>,
        and <code>delay</code> so they run end-to-end with zero external setup.{' '}
        <code>http</code> and <code>email</code> are real V1 types but need configured
        credentials or endpoints.
      </DocsCallout>
    </>
  )
}
