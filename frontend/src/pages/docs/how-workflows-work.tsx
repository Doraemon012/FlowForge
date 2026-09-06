import { DocsSection, DocsParagraph } from '@/components/docs/DocsSection'
import { DocsCallout } from '@/components/docs/DocsCallout'
import { DocsVersionBadge } from '@/components/docs/DocsVersionBadge'
import { DocsDiagram } from '@/components/docs/DocsDiagram'

export function HowWorkflowsWorkPage() {
  return (
    <>
      <div className="docs-hero">
        <div className="docs-eyebrow">Concepts</div>
        <h1 className="docs-title">How workflows work</h1>
        <p className="docs-lead">
          A workflow is a directed acyclic graph of tasks. You author a draft, publish an
          immutable version, activate it, and trigger runs.
        </p>
        <div className="docs-hero-badges">
          <DocsVersionBadge label="V1" />
        </div>
      </div>

      <DocsSection title="The mental model">
        <DocsParagraph>
          Think <code>Task A → Task B → Task C</code>, not{' '}
          <code>Queue → Worker → Lease → Attempt → DB</code>. You describe the{' '}
          <em>shape</em> of the work; FlowForge handles the mechanics of executing it.
        </DocsParagraph>
        <DocsParagraph>
          A workflow lives as a <strong>draft</strong> until you publish it as an{' '}
          <strong>immutable version</strong>. You then <strong>activate</strong> a version
          to make it the one that receives new runs.
        </DocsParagraph>
      </DocsSection>

      <DocsSection title="DAGs and dependencies">
        <DocsParagraph>
          Each task lists the tasks it depends on via <code>depends_on</code>. A task runs
          only when all of its required predecessors have succeeded. Independent tasks with
          no dependency between them may run concurrently, potentially on different workers.
        </DocsParagraph>
        <DocsDiagram label="simple-dag">
          <svg viewBox="0 0 640 240" width="100%" role="img" aria-label="A simple three-node DAG with a branch">
            {(() => {
              const nodes = [
                { x: 30, y: 90, w: 140, h: 48, label: 'transform: normalize', color: 'var(--accent)' },
                { x: 250, y: 20, w: 140, h: 48, label: 'conditional: route' },
                { x: 250, y: 160, w: 140, h: 48, label: 'delay: hold' },
                { x: 470, y: 90, w: 140, h: 48, label: 'notify' },
              ]
              const edges = [
                'M170 114 L250 54',
                'M170 114 L250 184',
                'M390 44 C420 44, 420 114, 470 114',
                'M390 184 C420 184, 420 114, 470 114',
              ]
              return (
                <g>
                  {edges.map((d, i) => (
                    <path key={i} d={d} fill="none" stroke="var(--accent)" strokeWidth="1.6" />
                  ))}
                  {nodes.map((n) => (
                    <g key={n.label}>
                      <rect x={n.x} y={n.y} width={n.w} height={n.h} rx={8} fill="var(--surface-2)" stroke={n.color || 'var(--border-strong)'} />
                      <text x={n.x + n.w / 2} y={n.y + 28} textAnchor="middle" fill="var(--text)" fontSize="12">{n.label}</text>
                    </g>
                  ))}
                </g>
              )
            })()}
          </svg>
        </DocsDiagram>
        <DocsParagraph muted>
          <code>normalize</code> must succeed before either <code>route</code> or{' '}
          <code>hold</code> begins. <code>route</code> and <code>hold</code> are independent
          of each other, so they run concurrently. <code>notify</code> waits for both.
        </DocsParagraph>
      </DocsSection>

      <DocsCallout variant="v1" title="Publish ≠ Activate">
        <strong>Run requires an active version.</strong> Publishing a version creates the
        immutable snapshot but does not activate it. You must activate it explicitly before
        any new run can use it.
      </DocsCallout>
    </>
  )
}
