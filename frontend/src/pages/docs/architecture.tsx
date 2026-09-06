import { DocsSection, DocsSubsection, DocsParagraph } from '@/components/docs/DocsSection'
import { DocsCallout } from '@/components/docs/DocsCallout'
import { DocsVersionBadge } from '@/components/docs/DocsVersionBadge'
import { DocsDiagram } from '@/components/docs/DocsDiagram'

export function ArchitecturePage() {
  return (
    <>
      <div className="docs-hero">
        <div className="docs-eyebrow">Concepts</div>
        <h1 className="docs-title">System architecture</h1>
        <p className="docs-lead">
          FlowForge is split into a control plane that decides and persists authoritative
          state, and an execution plane that actually runs task code.
        </p>
        <div className="docs-hero-badges">
          <DocsVersionBadge label="V1" />
        </div>
      </div>

      <DocsSection title="High-level flow">
        <DocsDiagram label="architecture-flow">
          <svg viewBox="0 0 720 320" width="100%" role="img" aria-label="Architecture flow from developer through API and orchestrator to workers and external systems">
            {(() => {
              const nodes = [
                { x: 20, y: 140, w: 120, h: 44, label: 'Developer', fill: 'var(--surface-2)' },
                { x: 170, y: 140, w: 120, h: 44, label: 'Dashboard / UI', fill: 'var(--surface-2)' },
                { x: 320, y: 140, w: 120, h: 44, label: 'Control-plane API', fill: 'var(--surface-2)', stroke: 'var(--accent)' },
                { x: 470, y: 140, w: 120, h: 44, label: 'Orchestrator', fill: 'var(--surface-2)' },
                { x: 320, y: 40, w: 120, h: 44, label: 'Scheduler', fill: 'var(--surface-2)' },
                { x: 620, y: 140, w: 80, h: 44, label: 'Queue', fill: 'var(--surface-2)' },
                { x: 20, y: 250, w: 120, h: 44, label: 'Workers', fill: 'var(--surface-2)' },
                { x: 170, y: 250, w: 120, h: 44, label: 'Task runtime', fill: 'var(--surface-2)' },
                { x: 320, y: 250, w: 120, h: 44, label: 'External systems', fill: 'var(--surface-2)' },
              ]
              const edges = [
                'M140 162 C155 162, 155 162, 170 162',
                'M290 162 C305 162, 305 162, 320 162',
                'M440 162 C455 162, 455 162, 470 162',
                'M590 162 C605 162, 605 162, 620 162',
                'M380 140 L380 84',
                'M660 162 L660 210 L140 210 L140 250',
                'M140 272 C155 272, 155 272, 170 272',
                'M290 272 C305 272, 305 272, 320 272',
              ]
              return (
                <g>
                  {edges.map((d, i) => (
                    <path key={i} d={d} fill="none" stroke="var(--accent)" strokeWidth="1.4" markerEnd="url(#archArrow)" />
                  ))}
                  <defs>
                    <marker id="archArrow" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
                      <path d="M0,0 L6,3 L0,6 Z" fill="var(--accent)" />
                    </marker>
                  </defs>
                  {nodes.map((n) => (
                    <g key={n.label}>
                      <rect x={n.x} y={n.y} width={n.w} height={n.h} rx={8} fill={n.fill} stroke={n.stroke || 'var(--border-strong)'} />
                      <text x={n.x + n.w / 2} y={n.y + 26} textAnchor="middle" fill="var(--text)" fontSize="12.5" fontWeight="600">{n.label}</text>
                    </g>
                  ))}
                  <text x={360} y={320} textAnchor="middle" fill="var(--muted)" fontSize="11">PostgreSQL is the durable source of truth</text>
                </g>
              )
            })()}
          </svg>
        </DocsDiagram>
      </DocsSection>

      <DocsSection title="Two planes">
        <DocsSubsection title="Control plane">
          <DocsParagraph>
            The control plane decides what should run and persists the authoritative state.
            It contains the control-plane API, the orchestrator, and the scheduler. When you
            create a workflow, publish a version, or trigger a run, you are talking to the
            control plane. It validates input, persists state, and returns — it never
            executes task code.
          </DocsParagraph>
        </DocsSubsection>
        <DocsSubsection title="Execution plane">
          <DocsParagraph>
            The execution plane does the work. Independent worker processes claim queued
            tasks, execute them, and report results. This separation lets workers scale
            independently and lets the control plane stay authoritative even when workers
            crash.
          </DocsParagraph>
        </DocsSubsection>
      </DocsSection>

      <DocsCallout variant="v1" title="The API never executes task code">
        The control-plane API only persists state and returns a{' '}
        <strong>202 Accepted</strong> response. Tasks are claimed and executed by
        independent workers.
      </DocsCallout>

      <DocsCallout variant="security" title="Concepts only">
        These docs describe behavior, not internal mechanics. They never expose internal
        URLs, queue-table names, or lease tokens.
      </DocsCallout>
    </>
  )
}
