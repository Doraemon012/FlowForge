import { DocsSection, DocsParagraph } from '@/components/docs/DocsSection'
import { DocsCallout } from '@/components/docs/DocsCallout'
import { DocsVersionBadge } from '@/components/docs/DocsVersionBadge'
import { DocsDiagram } from '@/components/docs/DocsDiagram'

export function DagPage() {
  return (
    <>
      <div className="docs-hero">
        <div className="docs-eyebrow">Getting Started</div>
        <h1 className="docs-title">Build the DAG</h1>
        <p className="docs-lead">
          Connect tasks with dependencies to form a directed acyclic graph. Dependencies
          flow one way — cycles are not allowed.
        </p>
        <div className="docs-hero-badges">
          <DocsVersionBadge label="V1" />
        </div>
      </div>

      <DocsSection title="Connecting tasks">
        <DocsParagraph>
          Draw an edge from a task to each of its dependents, or set its{' '}
          <code>depends_on</code> list directly. A task runs only after all of its required
          predecessors succeed.
        </DocsParagraph>
        <DocsDiagram label="dag-example">
          <svg viewBox="0 0 640 260" width="100%" role="img" aria-label="A linear and branched DAG example">
            {(() => {
              const n1 = { x: 20, y: 100, w: 140, h: 46, label: 'start' }
              const n2 = { x: 230, y: 20, w: 140, h: 46, label: 'branch-a' }
              const n3 = { x: 230, y: 180, w: 140, h: 46, label: 'branch-b' }
              const n4 = { x: 460, y: 100, w: 140, h: 46, label: 'end' }
              return (
                <g>
                  <rect x={n1.x} y={n1.y} width={n1.w} height={n1.h} rx={8} fill="var(--surface-2)" stroke="var(--border-strong)" />
                  <rect x={n2.x} y={n2.y} width={n2.w} height={n2.h} rx={8} fill="var(--surface-2)" stroke="var(--accent)" />
                  <rect x={n3.x} y={n3.y} width={n3.w} height={n3.h} rx={8} fill="var(--surface-2)" stroke="var(--border-strong)" />
                  <rect x={n4.x} y={n4.y} width={n4.w} height={n4.h} rx={8} fill="var(--surface-2)" stroke="var(--success)" />
                  {[
                    `M${n1.x + n1.w} ${n1.y + 23} L${n2.x} ${n2.y + 23}`,
                    `M${n1.x + n1.w} ${n1.y + 23} L${n3.x} ${n3.y + 23}`,
                    `M${n2.x + n2.w} ${n2.y + 23} L${n4.x} ${n4.y + 23}`,
                    `M${n3.x + n3.w} ${n3.y + 23} L${n4.x} ${n4.y + 23}`,
                  ].map((d, i) => (
                    <path key={i} d={d} fill="none" stroke="var(--accent)" strokeWidth="1.6" />
                  ))}
                  {[n1, n2, n3, n4].map((n) => (
                    <text key={n.label} x={n.x + n.w / 2} y={n.y + 28} textAnchor="middle" fill="var(--text)" fontSize="12">{n.label}</text>
                  ))}
                </g>
              )
            })()}
          </svg>
        </DocsDiagram>
      </DocsSection>

      <DocsSection title="Rules">
        <DocsParagraph>
          A valid DAG has no cycles, no unknown dependencies, no self-dependencies, and no
          duplicate task IDs. Every dependency must resolve to another task in the same
          definition.
        </DocsParagraph>
        <DocsParagraph muted>
          Independent tasks with no path between them may run concurrently, potentially on
          different workers.
        </DocsParagraph>
      </DocsSection>

      <DocsCallout variant="v1" title="Client + server validation">
        The builder performs client-side cycle detection and duplicate-edge guards, and the
        server validation is authoritative when you validate or publish.
      </DocsCallout>
    </>
  )
}
