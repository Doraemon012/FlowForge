import { DocsSection, DocsParagraph } from '@/components/docs/DocsSection'
import { DocsCallout } from '@/components/docs/DocsCallout'
import { DocsVersionBadge } from '@/components/docs/DocsVersionBadge'
import { DocsTable } from '@/components/docs/DocsTable'

export function StackPage() {
  return (
    <>
      <div className="docs-hero">
        <div className="docs-eyebrow">Concepts</div>
        <h1 className="docs-title">Technology stack</h1>
        <p className="docs-lead">
          The V1 stack is deliberately small. Control plane, durable state, queue, workers,
          and frontend are all chosen to keep moving parts down.
        </p>
        <div className="docs-hero-badges">
          <DocsVersionBadge label="V1" />
        </div>
      </div>

      <DocsSection title="Stack at a glance">
        <DocsTable
          headers={['Layer', 'Technology', 'Why (V1)']}
          rows={[
            ['Control plane', 'Go', 'Concurrency, single binary, strong standard library.'],
            ['Durable state', 'PostgreSQL', 'Atomicity, transactional state, source of truth, no extra infrastructure.'],
            ['Queue', 'PostgreSQL-backed queue', 'Durable atomic claiming, delayed retries, recovery, no separate broker.'],
            ['Workers', 'Independent Go processes', 'Separate scale, health, lease and heartbeat, recovery.'],
            ['Frontend', 'React + TypeScript + Vite', 'Developer-tool UX, typed contracts, fast builds.'],
            ['UI primitives', 'Tailwind + shadcn/ui + Lucide', 'Cohesive, accessible primitives and icons.'],
            ['Workflow canvas', 'React Flow (XYFlow)', 'Professional DAG editing: pan, zoom, minimap, edges.'],
            ['Server state', 'TanStack Query', 'Reconciles with the authoritative backend after mutations.'],
            ['Forms & validation', 'React Hook Form + Zod', 'Predictable forms and typed validation.'],
          ]}
        />
      </DocsSection>

      <DocsSection title="Why these choices">
        <DocsParagraph>
          The V1 goal is to ship a single durable engine without a sprawling service
          topology. A PostgreSQL-backed queue keeps delivery durable and atomic without a
          separate message broker, which is a meaningful simplification for a self-hosted
          deployment.
        </DocsParagraph>
        <DocsParagraph>
          Workers are independent processes so they can be scaled and restarted separately
          from the control plane. When a worker disappears, the queue simply reclaims its
          work — no state is lost.
        </DocsParagraph>
      </DocsSection>

      <DocsCallout variant="deferred" title="Not in V1">
        Kubernetes-native execution, multi-region deployment, and a plugin marketplace are
        future concerns, not part of the V1 stack.
      </DocsCallout>
    </>
  )
}
