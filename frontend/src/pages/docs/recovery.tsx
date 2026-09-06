import { DocsSection, DocsParagraph } from '@/components/docs/DocsSection'
import { DocsCallout } from '@/components/docs/DocsCallout'
import { DocsVersionBadge } from '@/components/docs/DocsVersionBadge'
import { DocsSteps } from '@/components/docs/DocsSteps'
import { DocsTable } from '@/components/docs/DocsTable'

export function RecoveryPage() {
  return (
    <>
      <div className="docs-hero">
        <div className="docs-eyebrow">Guides & References</div>
        <h1 className="docs-title">Retries, workers & recovery</h1>
        <p className="docs-lead">
          Workers claim queued tasks under a bounded lease and heartbeat while alive. When a
          worker dies, the lease expires and another worker reclaims the work.
        </p>
        <div className="docs-hero-badges">
          <DocsVersionBadge label="V1" />
        </div>
      </div>

      <DocsSection title="Leases & heartbeats">
        <DocsParagraph>
          A worker claims a queued task under a <strong>bounded lease</strong> and sends{' '}
          <strong>heartbeats</strong> while it is alive. A result or heartbeat that arrives
          with a stale lease is rejected — this is <strong>fencing</strong>, which prevents a
          late worker from overwriting a recovered attempt.
        </DocsParagraph>
      </DocsSection>

      <DocsSection title="Worker loss & at-least-once">
        <DocsParagraph>
          If a worker stops heartbeating, its lease expires. Another live worker reclaims the
          task and retries it. This means a task may run more than once when completion is
          ambiguous — this is <strong>at-least-once</strong> execution.
        </DocsParagraph>
        <DocsSteps
          steps={[
            {
              title: 'Attempt 1 · Worker A',
              description:
                'Worker A claims the task and begins executing. It dies before reporting a result.',
            },
            {
              title: 'Lease expires',
              description: 'After the lease timeout, the task is eligible for reclamation.',
            },
            {
              title: 'Attempt 2 · Worker B',
              description:
                'Worker B reclaims the task and succeeds. The result is fenced so a late result from Worker A is ignored.',
            },
          ]}
        />
      </DocsSection>

      <DocsSection title="Retries, backoff & timeouts">
        <DocsTable
          headers={['Mechanism', 'What it does']}
          rows={[
            ['Exponential backoff', 'Retries wait progressively longer between attempts.'],
            ['Jitter', 'Adds randomness to avoid synchronized retries.'],
            ['Transient errors', 'May be retried according to the retry policy.'],
            ['Terminal errors', 'Do not retry; the task run fails.'],
            ['Timeouts', 'Produce an explicit outcome and do not silently succeed.'],
          ]}
        />
      </DocsSection>

      <DocsCallout variant="security" title="Concepts only">
        These docs describe behavior, not internal machinery. They never expose lease
        tokens, database locks, raw queue records, or internal transaction details.
      </DocsCallout>

      <DocsCallout variant="warning" title="Not exactly-once">
        FlowForge does <strong>not</strong> guarantee exactly-once execution. Side-effecting
        tasks should use deterministic idempotency keys where the external system supports
        them.
      </DocsCallout>
    </>
  )
}
