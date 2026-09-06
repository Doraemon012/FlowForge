import { Link } from 'react-router-dom'
import {
  Boxes,
  FolderKanban,
  GitBranch,
  Play,
  Route,
  Workflow as WorkflowIcon,
} from 'lucide-react'
import { DocsSection, DocsParagraph } from '@/components/docs/DocsSection'
import { DocsCallout } from '@/components/docs/DocsCallout'
import { DocsVersionBadge } from '@/components/docs/DocsVersionBadge'
import { DocsTable } from '@/components/docs/DocsTable'
import { DocsCardGrid } from '@/components/docs/DocsCardGrid'

export function IntroductionPage() {
  return (
    <>
      <div className="docs-hero">
        <div className="docs-eyebrow">Getting Started</div>
        <h1 className="docs-title">Durable distributed workflow orchestration</h1>
        <p className="docs-lead">
          Define a graph of tasks once. FlowForge runs it asynchronously, recovers from
          worker failures automatically, and records every attempt — so you always know
          what happened.
        </p>
        <div className="docs-hero-badges">
          <DocsVersionBadge label="V1" />
        </div>
      </div>

      <DocsSection title="What FlowForge is">
        <DocsParagraph>
          FlowForge is a workflow orchestration platform. You describe <em>what</em> should run
          as a directed acyclic graph (DAG) of tasks, and FlowForge takes care of{' '}
          <em>when</em> and <em>where</em> it runs. Each trigger produces an{' '}
          <strong>execution</strong> — a single run of a specific workflow version — that is
          persisted from start to finish.
        </DocsParagraph>
        <DocsParagraph>
          When a worker crashes mid-task, FlowForge automatically reclaims the work and
          retries it on another worker. Every attempt is recorded, every state transition
          is durable, and every version you publish is immutable.
        </DocsParagraph>
      </DocsSection>

      <DocsSection title="What FlowForge is not">
        <DocsParagraph muted>
          FlowForge replaces a hand-rolled "cron + queue + retry" stack with a single
          durable, observable engine.
        </DocsParagraph>
        <DocsTable
          headers={['', 'Cron + queues + retry logic', 'FlowForge']}
          rows={[
            [
              <strong key="l">Retries</strong>,
              'Re-invented per job, typically fire-and-forget',
              'Built-in exponential backoff with jitter, lease-based recovery',
            ],
            [
              <strong key="l">State</strong>,
              'Lost when workers restart',
              'Durable — every step, every attempt, persisted',
            ],
            [
              <strong key="l">Visibility</strong>,
              'Debug via grep across three services',
              'Timeline + attempt history for every run',
            ],
            [
              <strong key="l">Versioning</strong>,
              'Rarely exists',
              'Immutable versions + one-click activate/deactivate',
            ],
          ]}
        />
      </DocsSection>

      <DocsCallout variant="v1" title="Key differentiators">
        <ul style={{ margin: 0, paddingLeft: 18 }}>
          <li>Reliable distributed execution with bounded leases and heartbeats</li>
          <li>Durable state — PostgreSQL is the source of truth</li>
          <li>At-least-once semantics so work is never silently dropped</li>
          <li>Immutable published versions with activation control</li>
          <li>Observability: events, persisted logs, attempt history</li>
        </ul>
      </DocsCallout>

      <DocsSection title="Start here">
        <DocsCardGrid
          cards={[
            {
              title: 'Create a project',
              description: 'Projects are the ownership and isolation boundary.',
              to: '/docs/creating-a-project',
              icon: FolderKanban,
            },
            {
              title: 'Create a workflow',
              description: 'A workflow is a named, versioned collection of tasks.',
              to: '/docs/creating-a-workflow',
              icon: WorkflowIcon,
            },
            {
              title: 'Add tasks',
              description: 'Configure individual units of work with a type and config.',
              to: '/docs/adding-tasks',
              icon: Boxes,
            },
            {
              title: 'Build a DAG',
              description: 'Connect tasks with dependencies to form an acyclic graph.',
              to: '/docs/dag',
              icon: GitBranch,
            },
            {
              title: 'Publish & activate',
              description: 'Save a draft, publish an immutable version, activate it.',
              to: '/docs/versions',
              icon: Route,
            },
            {
              title: 'Run a workflow',
              description: 'Trigger an execution and monitor it to completion.',
              to: '/docs/running',
              icon: Play,
            },
          ]}
        />
      </DocsSection>

      <DocsCallout variant="deferred" title="Non-goals in V1">
        Team collaboration and roles, SSO, billing, a plugin marketplace, multi-region
        deployment, exactly-once execution, and AI-generated workflows are labeled{' '}
        <strong>Deferred</strong> throughout the docs.{' '}
        <Link to="/docs/features" className="inline-link">
          See the V1 feature list
        </Link>{' '}
        for the complete picture.
      </DocsCallout>
    </>
  )
}
