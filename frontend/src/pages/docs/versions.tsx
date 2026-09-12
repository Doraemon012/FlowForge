import { Link } from 'react-router-dom'
import { DocsSection, DocsParagraph } from '@/components/docs/DocsSection'
import { DocsCallout } from '@/components/docs/DocsCallout'
import { DocsCodeBlock } from '@/components/docs/DocsCodeBlock'
import { DocsDiagram } from '@/components/docs/DocsDiagram'
import { DocsTable } from '@/components/docs/DocsTable'

export function VersionsPage() {
  return (
    <>
      <div className="docs-hero">
        <div className="docs-eyebrow">Getting Started</div>
        <h1 className="docs-title">Save, publish & activate</h1>
        <p className="docs-lead">
          A workflow is a live draft until you publish it as an immutable version, then
          activate that version to receive new runs.
        </p>
      </div>

      <DocsSection title="The lifecycle">
        <DocsParagraph>
          <strong>Save</strong> persists your draft. <strong>Publish</strong> validates the
          draft and creates an immutable, numbered version — but it does not change which
          version receives new runs. <strong>Activate</strong> promotes a published version
          to be the one that new triggers use. <strong>Deactivate</strong> clears the active
          version and pauses the workflow.
        </DocsParagraph>
        <DocsDiagram label="version-lifecycle">
          <svg viewBox="0 0 700 120" width="100%" role="img" aria-label="Draft to Published Version to Active Version lifecycle">
            {(() => {
              const boxes = [
                { x: 10, y: 30, w: 170, label: 'Draft', sub: 'editable' },
                { x: 260, y: 30, w: 170, label: 'Published Version', sub: 'immutable' },
                { x: 510, y: 30, w: 170, label: 'Active Version', sub: 'receives runs' },
              ]
              return (
                <g>
                  {boxes.map((b) => (
                    <g key={b.label}>
                      <rect x={b.x} y={b.y} width={b.w} height={60} rx={8} fill="var(--surface-2)" stroke="var(--border-strong)" />
                      <text x={b.x + b.w / 2} y={b.y + 26} textAnchor="middle" fill="var(--text)" fontSize="13" fontWeight="600">{b.label}</text>
                      <text x={b.x + b.w / 2} y={b.y + 44} textAnchor="middle" fill="var(--muted)" fontSize="11">{b.sub}</text>
                    </g>
                  ))}
                  <path d="M180 60 C200 60, 210 60, 260 60" fill="none" stroke="var(--accent)" strokeWidth="1.5" />
                  <path d="M430 60 C460 60, 470 60, 510 60" fill="none" stroke="var(--accent)" strokeWidth="1.5" />
                  <text x="220" y="52" textAnchor="middle" fill="var(--accent)" fontSize="10">publish</text>
                  <text x="470" y="52" textAnchor="middle" fill="var(--accent)" fontSize="10">activate</text>
                </g>
              )
            })()}
          </svg>
        </DocsDiagram>
      </DocsSection>

      <DocsSection title="What each action does">
        <DocsTable
          headers={['Action', 'Effect']}
          rows={[
            ['Save', 'Persists the current draft. No version is created.'],
            ['Publish', 'Validates the draft and creates an immutable numbered version. Does not auto-activate.'],
            ['Activate', 'Sets the published version that receives new triggers. Workflow status becomes active.'],
            ['Deactivate', 'Clears the active version. Workflow status becomes paused.'],
          ]}
        />
      </DocsSection>

      <DocsSection title="Compare a version to the previous one">
        <DocsParagraph>
          Every published version is immutable, so the useful question after a change is
          "what did this version change?". On the Versions page each version row has a{' '}
          <strong>Compare</strong> action that opens a task-level diff against the previous
          version: which tasks were <strong>added</strong>, which were{' '}
          <strong>removed</strong>, and which <strong>changed</strong> — with the before and
          after value of every changed field (type, config, and dependencies). Version 1 is
          compared against an empty definition, so it reads as "the initial published
          version". This is the fastest way to review the effect of an AI edit or an
          incremental fix before you activate it.
        </DocsParagraph>
        <DocsTable
          headers={['Diff group', 'Meaning']}
          rows={[
            ['Added', 'Tasks present in this version but not the previous one.'],
            ['Removed', 'Tasks present in the previous version but not this one.'],
            ['Changed', 'Tasks in both, with at least one field (type, config, dependencies) differing — each field shown before → after.'],
          ]}
        />
        <DocsCallout variant="info" title="Also shown before you apply an AI change">
          The same field-level diff is shown inside the AI assistant before you apply a
          generated or refined definition, so an AI edit is reviewed the same way a
          published version is.
        </DocsCallout>
      </DocsSection>

      <DocsSection title="Via the API">
        <DocsParagraph>
          Publish a version, then activate it explicitly.
        </DocsParagraph>
        <DocsCodeBlock
          language="bash"
          title="Publish a version"
          code={`curl -X POST http://localhost:8080/api/v1/projects/$PROJECT_ID/workflows/$WORKFLOW_ID/versions \\
  -H "Authorization: Bearer $TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{}'`}
        />
        <DocsCodeBlock
          language="bash"
          title="Activate a version"
          code={`curl -X POST http://localhost:8080/api/v1/projects/$PROJECT_ID/workflows/$WORKFLOW_ID/versions/$VERSION_ID/activate \\
  -H "Authorization: Bearer $TOKEN"`}
        />
      </DocsSection>

      <DocsCallout variant="success" title="Publish ≠ Activate">
        Publishing creates an immutable snapshot but does <strong>not</strong> make it the
        version that receives runs. You must explicitly activate it. The app links to the
        Versions page after publishing.
      </DocsCallout>

      <DocsCallout variant="info" title="Run requires an active version">
        The <strong>Run</strong> button is only available when a workflow has an active
        version. See{' '}
        <Link to="/docs/running" className="inline-link">
          Running a workflow
        </Link>
        .
      </DocsCallout>
    </>
  )
}
