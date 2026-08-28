import { Link } from 'react-router-dom'
import {
  ArrowRight,
  GitBranch,
  History,
  RefreshCw,
  Workflow,
} from 'lucide-react'
import { Button } from '@/components/ui/button'

const features = [
  {
    icon: GitBranch,
    title: 'Graph-based definitions',
    description:
      'Model work as a directed acyclic graph of dependent tasks, then publish immutable versions.',
  },
  {
    icon: RefreshCw,
    title: 'Fault-tolerant execution',
    description:
      'Durable leases and heartbeats let live workers recover work abandoned by failed ones.',
  },
  {
    icon: History,
    title: 'Complete attempt history',
    description:
      'Every retry and recovery is recorded, so you always know exactly what happened.',
  },
]

function FlowPreview() {
  const nodes = [
    { label: 'HTTP Request', sub: 'Fetch transcript', state: 'succeeded' },
    { label: 'Transform', sub: 'Normalize data', state: 'succeeded' },
    { label: 'Email', sub: 'Send summary', state: 'pending' },
  ]

  return (
    <div className="flex flex-wrap items-center justify-center gap-4">
      {nodes.map((node, index) => (
        <div key={node.label} className="flex items-center gap-4">
          <div className="flex flex-col rounded-lg border bg-card px-4 py-3 text-left shadow-sm">
            <span className="text-sm font-medium">{node.label}</span>
            <span className="text-xs text-muted-foreground">{node.sub}</span>
          </div>
          {index < nodes.length - 1 ? (
            <span className="text-muted-foreground" aria-hidden="true">
              →
            </span>
          ) : null}
        </div>
      ))}
    </div>
  )
}

export function LandingPage() {
  return (
    <div className="flex min-h-svh flex-col">
      <header className="flex h-16 shrink-0 items-center justify-between border-b px-6">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground shadow-sm">
            <Workflow className="h-5 w-5" aria-hidden="true" />
          </div>
          <span className="text-lg font-semibold tracking-tight">FlowForge</span>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" asChild>
            <Link to="/login">Sign in</Link>
          </Button>
          <Button asChild>
            <Link to="/signup">Create account</Link>
          </Button>
        </div>
      </header>

      <main className="flex-1">
        <section className="mx-auto flex max-w-6xl flex-col items-center gap-10 px-6 py-24 text-center">
          <div className="space-y-4">
            <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
              Reliable workflow execution,{' '}
              <span className="text-primary">built for developers</span>
            </h1>
            <p className="mx-auto max-w-2xl text-lg text-muted-foreground">
              Define a graph of tasks once. FlowForge runs it asynchronously,
              recovers from failures, and records every attempt.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <Button size="lg" asChild>
              <Link to="/signup">
                Get started
                <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />
              </Link>
            </Button>
            <Button size="lg" variant="outline" asChild>
              <Link to="/login">Sign in</Link>
            </Button>
          </div>

          <FlowPreview />
        </section>

        <section className="border-t bg-card/50">
          <div className="mx-auto grid max-w-6xl gap-8 px-6 py-16 sm:grid-cols-3">
            {features.map((feature) => (
              <div key={feature.title} className="space-y-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-md border bg-background">
                  <feature.icon className="h-4 w-4 text-primary" aria-hidden="true" />
                </div>
                <h2 className="text-base font-semibold">{feature.title}</h2>
                <p className="text-sm text-muted-foreground">{feature.description}</p>
              </div>
            ))}
          </div>
        </section>
      </main>

      <footer className="border-t py-6 text-center text-sm text-muted-foreground">
        FlowForge — durable distributed workflow orchestration
      </footer>
    </div>
  )
}
