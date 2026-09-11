import { DocsSection, DocsParagraph } from '@/components/docs/DocsSection'
import { DocsCallout } from '@/components/docs/DocsCallout'
import { DocsVersionBadge } from '@/components/docs/DocsVersionBadge'
import { DocsCodeBlock } from '@/components/docs/DocsCodeBlock'

export function CreatingAWorkflowPage() {
  return (
    <>
      <div className="docs-hero">
        <div className="docs-eyebrow">Getting Started</div>
        <h1 className="docs-title">Create a workflow</h1>
        <p className="docs-lead">
          A workflow is a named, versioned collection of tasks. Create one inside a project
          and open it in the builder.
        </p>
        <div className="docs-hero-badges">
          <DocsVersionBadge label="V1" />
        </div>
      </div>

      <DocsSection title="In the UI">
        <DocsParagraph>
          1. Open a project. 2. Click <strong>Create Workflow</strong>. 3. Enter a name and
          optional description. 4. Click <strong>Create</strong>. The workflow opens in the
          builder with an empty canvas.
        </DocsParagraph>
      </DocsSection>

      <DocsSection title="Or start from a template">
        <DocsParagraph>
          A blank canvas is not the only way in. The workflow empty states, the project
          overview, and the new-workflow page each offer ready-made{' '}
          <strong>starter templates</strong> — for example an http → transform → email
          pipeline, a status-guard branch, a scheduled digest, or a webhook relay. Choosing
          one creates an ordinary workflow with that definition already loaded, so you can
          run a real pipeline immediately and edit it from there. No template-specific state
          is created; it is the same create-workflow request as building by hand.
        </DocsParagraph>
      </DocsSection>

      <DocsSection title="Via the API">
        <DocsParagraph>
          A new workflow always starts as a <strong>draft</strong> with an empty task list.
        </DocsParagraph>
        <DocsCodeBlock
          language="bash"
          title="POST /api/v1/projects/{project_id}/workflows"
          code={`curl -X POST http://localhost:8080/api/v1/projects/$PROJECT_ID/workflows \\
  -H "Authorization: Bearer $TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{"name":"Order notification","description":"Notifies on new orders","definition":{"tasks":[]}}'`}
        />
      </DocsSection>

      <DocsCallout variant="info" title="Define tasks later">
        You don't have to add tasks when you create a workflow. The builder is the primary
        surface for adding and configuring tasks.
      </DocsCallout>
    </>
  )
}
