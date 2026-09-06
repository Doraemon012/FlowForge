import { DocsSection, DocsParagraph } from '@/components/docs/DocsSection'
import { DocsCallout } from '@/components/docs/DocsCallout'
import { DocsVersionBadge } from '@/components/docs/DocsVersionBadge'
import { DocsDiagram } from '@/components/docs/DocsDiagram'

export function InterviewPage() {
  return (
    <>
      <div className="docs-hero">
        <div className="docs-eyebrow">Reference</div>
        <h1 className="docs-title">How FlowForge works</h1>
        <p className="docs-lead">
          A concise technical overview of the architecture, reliability model, and the
          design trade-offs that shape FlowForge.
        </p>
        <div className="docs-hero-badges">
          <DocsVersionBadge label="V1" />
        </div>
      </div>

      <DocsSection title="What it is">
        <DocsParagraph>
          FlowForge is a durable distributed workflow orchestration platform. You define a
          versioned DAG of tasks and trigger runs. Each run is an execution persisted from
          start to finish.
        </DocsParagraph>
      </DocsSection>

      <DocsSection title="Two planes">
        <DocsParagraph>
          The control plane decides and persists authoritative state: the API, orchestrator,
          and scheduler. The execution plane does the work: independent workers and the
          queue. The control-plane API never executes task code — it routes and persists.
        </DocsParagraph>
      </DocsSection>

      <DocsSection title="Reliability model">
        <DocsParagraph>
          Workers claim tasks under bounded leases and heartbeat while alive. When a worker
          dies, its lease expires and another worker reclaims the task, giving at-least-once
          execution. Results are fenced against stale workers. Retries use exponential
          backoff with jitter, and timeouts are explicit.
        </DocsParagraph>
      </DocsSection>

      <DocsSection title="Why it matters">
        <DocsParagraph>
          Every attempt is recorded, state survives restarts, versions are immutable, and
          observability makes failures explainable. It is not exactly-once, so side-effecting
          tasks should use deterministic idempotency keys where the external system supports
          them.
        </DocsParagraph>
        <DocsDiagram label="reliability">
          <svg viewBox="0 0 720 180" width="100%" role="img" aria-label="Control plane and execution plane with durable state">
            {(() => {
              const nodes = [
                { x: 20, y: 20, w: 200, h: 44, label: 'Control plane', sub: 'decides + persists' },
                { x: 260, y: 20, w: 200, h: 44, label: 'Queue', sub: 'durable delivery' },
                { x: 500, y: 20, w: 200, h: 44, label: 'Workers', sub: 'execute tasks' },
                { x: 20, y: 110, w: 200, h: 44, label: 'PostgreSQL', sub: 'source of truth' },
                { x: 260, y: 110, w: 200, h: 44, label: 'Execution plane', sub: 'does the work' },
              ]
              return (
                <g>
                  {nodes.map((n) => (
                    <g key={n.label}>
                      <rect x={n.x} y={n.y} width={n.w} height={n.h} rx={8} fill="var(--surface-2)" stroke="var(--border-strong)" />
                      <text x={n.x + n.w / 2} y={n.y + 20} textAnchor="middle" fill="var(--text)" fontSize="12.5" fontWeight="600">{n.label}</text>
                      <text x={n.x + n.w / 2} y={n.y + 36} textAnchor="middle" fill="var(--muted)" fontSize="10">{n.sub}</text>
                    </g>
                  ))}
                  <path d="M220 42 C240 42, 240 42, 260 42" fill="none" stroke="var(--accent)" strokeWidth="1.4" />
                  <path d="M460 42 C480 42, 480 42, 500 42" fill="none" stroke="var(--accent)" strokeWidth="1.4" />
                  <path d="M120 64 L120 110" fill="none" stroke="var(--accent)" strokeWidth="1.4" strokeDasharray="4 4" />
                </g>
              )
            })()}
          </svg>
        </DocsDiagram>
      </DocsSection>

      <DocsCallout variant="v1" title="In short">
        FlowForge is a PostgreSQL-backed queue with atomic claim, an immutable version
        model, and an execution engine that records every attempt. It is at-least-once, not
        exactly-once.
      </DocsCallout>
    </>
  )
}
