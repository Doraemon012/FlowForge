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

function FlowGraph() {
  const nodes = [
    { label: 'HTTP', sub: 'Fetch transcript', x: 10, y: 34, accent: 'oklch(0.64 0.13 235)' },
    { label: 'Transform', sub: 'Normalize data', x: 210, y: 14, accent: 'oklch(0.72 0.14 190)' },
    { label: 'Email', sub: 'Send summary', x: 210, y: 54, accent: 'oklch(0.60 0.15 340)' },
  ]

  return (
    <div className="relative w-full max-w-xl overflow-hidden rounded-xl border border-border/70 bg-card shadow-surface-lg">
      <div className="flex items-center gap-1.5 border-b border-border/70 bg-muted/30 px-4 py-2.5">
        <span className="h-2 w-2 rounded-full bg-destructive/70" aria-hidden="true" />
        <span className="h-2 w-2 rounded-full bg-warning/70" aria-hidden="true" />
        <span className="h-2 w-2 rounded-full bg-success/70" aria-hidden="true" />
        <span className="ml-2 font-mono text-xs text-muted-foreground">workflow.graph</span>
      </div>
      <div className="relative h-56 w-full">
        <svg
          className="absolute inset-0 h-full w-full"
          viewBox="0 0 420 200"
          aria-hidden="true"
        >
          <path
            d="M 95 95 L 200 60"
            stroke="var(--border)"
            strokeWidth="1.5"
            fill="none"
          />
          <path
            d="M 95 95 L 200 130"
            stroke="var(--border)"
            strokeWidth="1.5"
            fill="none"
          />
          <circle cx="200" cy="60" r="3" fill="var(--primary)" />
          <circle cx="200" cy="130" r="3" fill="var(--primary)" />
        </svg>
        {nodes.map((node) => (
          <div
            key={node.label}
            className="absolute flex -translate-y-1/2 flex-col rounded-lg border bg-card px-3 py-2 shadow-sm"
            style={{ left: node.x, top: node.y * 1.9, borderColor: 'var(--border)' }}
          >
            <div className="flex items-center gap-2">
              <span
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: node.accent }}
                aria-hidden="true"
              />
              <span className="text-sm font-medium">{node.label}</span>
            </div>
            <span className="mt-0.5 text-[11px] text-muted-foreground">{node.sub}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

export function LandingPage() {
  return (
    <div className="flex min-h-svh flex-col">
      <header className="flex h-16 shrink-0 items-center justify-between border-b border-border/70 bg-background/70 px-6 backdrop-blur-sm lg:px-10">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground shadow-sm">
            <Workflow className="h-5 w-5" aria-hidden="true" />
          </div>
          <span className="font-display text-lg font-semibold tracking-tight">FlowForge</span>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" asChild>
            <Link to="/login">Sign in</Link>
          </Button>
          <Button asChild>
            <Link to="/signup">
              Create account
              <ArrowRight className="ml-1.5 h-4 w-4" aria-hidden="true" />
            </Link>
          </Button>
        </div>
      </header>

      <main className="flex-1">
        <section className="relative mx-auto flex max-w-6xl flex-col items-center gap-12 px-6 py-24 text-center lg:py-28">
          <div className="space-y-5">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-border/80 bg-card px-3 py-1 text-xs font-medium text-muted-foreground shadow-sm">
              <span className="h-1.5 w-1.5 rounded-full bg-primary" aria-hidden="true" />
              Durable workflow orchestration
            </span>
            <h1 className="font-display text-5xl font-semibold leading-[1.05] tracking-tight sm:text-6xl">
              Ship reliable
              <br />
              <span className="text-primary">workflows</span> with confidence
            </h1>
            <p className="mx-auto max-w-2xl text-lg leading-relaxed text-muted-foreground">
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

          <FlowGraph />
        </section>

        <section className="border-t border-border/70 bg-card/40">
          <div className="mx-auto grid max-w-6xl gap-8 px-6 py-16 sm:grid-cols-3 lg:px-10">
            {features.map((feature) => (
              <div key={feature.title} className="group space-y-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-border/80 bg-background shadow-sm transition-colors group-hover:border-primary/30">
                  <feature.icon className="h-4 w-4 text-primary" aria-hidden="true" />
                </div>
                <h2 className="font-display text-base font-semibold tracking-tight">
                  {feature.title}
                </h2>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  {feature.description}
                </p>
              </div>
            ))}
          </div>
        </section>
      </main>

      <footer className="border-t border-border/70 py-6 text-center text-sm text-muted-foreground">
        <span className="font-mono text-xs">
          FlowForge — durable distributed workflow orchestration
        </span>
      </footer>
    </div>
  )
}
