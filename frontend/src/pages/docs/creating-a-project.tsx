import { DocsSection, DocsParagraph } from '@/components/docs/DocsSection'
import { DocsCallout } from '@/components/docs/DocsCallout'
import { DocsCodeBlock } from '@/components/docs/DocsCodeBlock'

export function CreatingAProjectPage() {
  return (
    <>
      <div className="docs-hero">
        <div className="docs-eyebrow">Getting Started</div>
        <h1 className="docs-title">Create a project</h1>
        <p className="docs-lead">
          Projects are the ownership and isolation boundary. Every workflow and execution
          lives inside exactly one project.
        </p>
      </div>

      <DocsSection title="In the UI">
        <DocsParagraph>
          1. Sign up or log in. 2. On the dashboard, click{' '}
          <strong>Create Project</strong>. 3. Enter a name. 4. Click{' '}
          <strong>Create</strong>. The new project appears in the project list.
        </DocsParagraph>
        <DocsParagraph muted>
          The authenticated user becomes the project's single owner. The name is the only
          required field.
        </DocsParagraph>
      </DocsSection>

      <DocsSection title="Via the API">
        <DocsParagraph>
          Create a project with a bearer token from the authenticated user.
        </DocsParagraph>
        <DocsCodeBlock
          language="bash"
          title="POST /api/v1/projects"
          code={`curl -X POST http://localhost:8080/api/v1/projects \\
  -H "Authorization: Bearer $TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{"name":"My Project"}'`}
        />
      </DocsSection>

      <DocsSection title="Empty state, loading, and errors">
        <DocsParagraph>
          When you have no projects, the dashboard shows an empty state with a Create
          Project action. While a request is in flight, the UI stays responsive. A failed
          request surfaces an error message and lets you retry without losing the form.
        </DocsParagraph>
      </DocsSection>

      <DocsCallout variant="v1" title="Single-owner model">
        Each project has a single owner. Every project-owned resource is authorized by that
        ownership, which is what isolates one account's work from another's.
      </DocsCallout>
    </>
  )
}
