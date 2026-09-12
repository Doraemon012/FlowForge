import { DocsSection, DocsParagraph } from '@/components/docs/DocsSection'
import { DocsCallout } from '@/components/docs/DocsCallout'
import { DocsTable } from '@/components/docs/DocsTable'
import { DocsDiagram } from '@/components/docs/DocsDiagram'

export function ConceptsPage() {
  return (
    <>
      <div className="docs-hero">
        <div className="docs-eyebrow">Concepts</div>
        <h1 className="docs-title">Core concepts & terminology</h1>
        <p className="docs-lead">
          A short conceptual model and the vocabulary you'll see throughout the docs and
          the FlowForge UI.
        </p>
      </div>

      <DocsSection title="The mental model">
        <DocsParagraph>
          FlowForge models work as a hierarchy of four main objects:{' '}
          <code>Project</code> → <code>Workflow</code> → <code>Version</code> →{' '}
          <code>Execution</code>. Everything below a project is owned by that project and
          isolated from other projects.
        </DocsParagraph>
        <DocsDiagram label="object-model">
          <svg viewBox="0 0 700 120" width="100%" role="img" aria-label="Project to Workflow to Version to Execution hierarchy">
            {(() => {
              const boxes = [
                { x: 10, y: 30, w: 150, label: 'Project', sub: 'ownership unit' },
                { x: 200, y: 30, w: 150, label: 'Workflow', sub: 'named DAG' },
                { x: 390, y: 30, w: 150, label: 'Version', sub: 'immutable' },
                { x: 580, y: 30, w: 110, label: 'Execution', sub: 'one run' },
              ]
              return (
                <g>
                  {boxes.map((b) => (
                    <g key={b.label}>
                      <rect x={b.x} y={b.y} width={b.w} height={60} rx={8} fill="var(--surface-2)" stroke="var(--border-strong)" />
                      <text x={b.x + b.w / 2} y={b.y + 26} textAnchor="middle" fill="var(--text)" fontSize="14" fontWeight="600">{b.label}</text>
                      <text x={b.x + b.w / 2} y={b.y + 44} textAnchor="middle" fill="var(--muted)" fontSize="11">{b.sub}</text>
                    </g>
                  ))}
                  {[0, 1, 2].map((i) => (
                    <path
                      key={i}
                      d={`M${160 + i * 190} 60 C${175 + i * 190} 60, ${185 + i * 190} 60, ${200 + i * 190} 60`}
                      fill="none"
                      stroke="var(--accent)"
                      strokeWidth="1.5"
                    />
                  ))}
                </g>
              )
            })()}
          </svg>
        </DocsDiagram>
      </DocsSection>

      <DocsSection title="Defined terms">
        <DocsTable
          headers={['Term', 'Meaning']}
          rows={[
            ['Project', 'The isolation boundary and ownership unit. A single owner creates and controls a project.'],
            ['Workflow', 'A named, versioned collection of tasks plus their dependencies.'],
            ['Task', 'A single unit of work with a type, a config object, and optional dependency references.'],
            ['DAG', 'A directed acyclic graph of tasks. Dependencies flow one way — no cycles are allowed.'],
            ['Workflow Version', 'An immutable published snapshot of a draft definition.'],
            ['Execution', 'One run of a specific workflow version, persisted from creation to terminal state.'],
            ['Task Run', 'One task within an execution. An execution contains one task run per task in the graph.'],
            ['Attempt', 'One try of a task run. Attempt history is append-only and never overwritten.'],
            ['Worker', 'A process that leases and executes tasks. Workers are independent from the API and orchestrator.'],
            ['Queue', 'Durable delivery between the orchestrator and workers. Backed by PostgreSQL.'],
            ['Lease', 'Bounded ownership of a task by a worker. Described at the user level; never a raw token.'],
            ['Heartbeat', 'A liveness signal from a worker. Missing heartbeats allow the lease to expire.'],
            ['Idempotency', 'Safe duplicate-trigger protection. Reusing an Idempotency-Key returns the original result.'],
            ['At-least-once', 'A task may run more than once when completion is ambiguous (for example, the result is lost).'],
          ]}
        />
      </DocsSection>

      <DocsCallout variant="success" title="Every term is a real concept">
        Every term above corresponds to something real in the backend and, where noted, the
        frontend.
      </DocsCallout>
    </>
  )
}
