import { useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowRight,
  BookOpen,
  Check,
  CheckCircle2,
  ChevronRight,
  Copy,
  GitBranch,
  History,
  Play,
  RefreshCw,
  Workflow as WorkflowIcon,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { StartTrialButton } from '@/components/auth/StartTrialButton'

const steps = [
  {
    num: 'STEP 01',
    title: 'Define your graph',
    description:
      'Model work as tasks with dependencies. Use our TypeScript SDK, YAML, or the visual editor.',
    code: (
      <div className="step-visual">
        <span className="c">// workflow.ts</span>
        <br />
        <span className="k">export const</span> <span className="var">wf</span> ={' '}
        <span className="k">defineWorkflow</span>({'('}
        <br />
        <span>  </span>
        <span className="var">id</span>: <span className="str">"order-fulfillment"</span>,
        <br />
        <span>  </span>
        <span className="var">tasks</span>:{' '}
        <span>{'{'}</span>
        <br />
        <span>    </span>
        <span className="n">fetch</span>: <span className="k">http</span>({'('}
        <span>{'{'}</span> <span className="var">url</span>: <span className="str">"…"</span>{' '}
        <span>{'}'}</span>
        <span>{')'}</span>
        <span>,</span>
        <br />
        <span>    </span>
        <span className="n">validate</span>: <span>{'{'}</span> <span className="var">deps</span>:{' '}
        [<span className="str">"fetch"</span>] <span>{'}'}</span>
        <span>,</span>
        <br />
        <span>    </span>
        <span className="n">notify</span>: <span>{'{'}</span> <span className="var">deps</span>:{' '}
        [<span className="str">"validate"</span>] <span>{'}'}</span>
        <br />
        <span>  </span>
        <span>{'}'}</span>
        <br />
        <span>{'}'}</span>
        <span>);</span>
      </div>
    ),
  },
  {
    num: 'STEP 02',
    title: 'Publish a version',
    description:
      'Every publish is immutable. Roll back instantly. Old runs finish on their pinned version.',
    code: (
      <div className="step-visual">
        <span className="c">$ flowforge publish</span>
        <br />
        <br />
        <span className="s">✓</span> validated <span className="var">order-fulfillment</span>
        <br />
        <span className="s">✓</span> published <span className="n">v3</span> · sha 8a2f01c9
        <br />
        <span className="s">✓</span> activated in <span className="var">prod</span>
        <br />
        <br />
        <span className="c">→ triggers armed · webhooks ready</span>
        <br />
        <span className="c">→ dashboard: flowforge.app/…/v3</span>
      </div>
    ),
  },
  {
    num: 'STEP 03',
    title: 'Watch it run',
    description:
      'Live graph view, timeline, logs, retries — everything you need at 2am when something breaks.',
    code: (
      <div className="step-visual">
        <span className="c">// live · c013970d</span>
        <br />
        <span className="s">✓</span> <span className="n">fetch</span> &nbsp;&nbsp;&nbsp;&nbsp;
        <span className="num">412ms</span>
        <br />
        <span className="s">✓</span> <span className="n">validate</span> &nbsp;
        <span className="num">89ms</span>
        <br />
        <span className="s">✓</span> <span className="n">persist</span> &nbsp;&nbsp;
        <span className="num">34ms</span>
        <br />
        <span className="s">✓</span> <span className="n">route</span> &nbsp;&nbsp;&nbsp;&nbsp;
        <span className="num">12ms</span>
        <br />
        <span style={{ color: '#60a5fa' }}>▍</span> <span className="n">notify</span>{' '}
        &nbsp;&nbsp;&nbsp;<span style={{ color: '#60a5fa' }}>running…</span>
      </div>
    ),
  },
]

const whyGood = [
  'Retries built-in with exponential backoff + jitter',
  'Durable state — every step, every attempt',
  'Visual timeline for every run, always',
  'Immutable versions + one-click rollback',
  'AI authoring that flags risky configs before you run',
  'Failed runs explain why and jump straight to the task to fix',
  'Starter templates so a first workflow runs before you design one',
  'Compare versions to see exactly what changed, task by task',
]

const whyBad = [
  'Retry logic re-invented per job',
  'State lost when workers restart',
  'Debug via grep across three services',
  'Versioning? Good luck.',
]

const codeExample = `import { defineWorkflow, step } from "@flowforge/sdk";

export const orderFulfillment = defineWorkflow({
  id: "order-fulfillment",
  trigger: { event: "order.created" },

  async run(ctx, order) {
    // Each step is durable — resumes exactly where it left off.
    const customer = await step("fetch", () =>
      fetch(\`/api/customers/\${order.customerId}\`).then(r => r.json()));

    await step("validate", { retries: 3 }, () => validate(order));
    await step("persist", () => db.insert(order));

    // Sleep durably — worker can die, the wait continues.
    await ctx.sleep("30s");

    await step("notify", () => sendEmail(customer.email));
  }
});`

function FlowGraph() {
  const nodes = [
    { label: 'HTTP', sub: 'Fetch transcript', x: '10%', y: '34%', cls: 'ti-http' },
    { label: 'Transform', sub: 'Normalize data', x: '50%', y: '14%', cls: 'ti-transform' },
    { label: 'Email', sub: 'Send summary', x: '50%', y: '54%', cls: 'ti-email' },
  ]

  return (
    <div className="max-w-xl w-full overflow-hidden rounded-lg border border-border/70 bg-surface shadow-surface-lg">
      <div className="flex items-center gap-1.5 border-b border-border/70 bg-surface-2 px-4 py-2.5">
        <span className="h-2 w-2 rounded-full bg-border-strong" aria-hidden="true" />
        <span className="h-2 w-2 rounded-full bg-border-strong" aria-hidden="true" />
        <span className="h-2 w-2 rounded-full bg-border-strong" aria-hidden="true" />
        <span className="ml-2 font-mono text-xs text-muted">workflow.graph</span>
      </div>
      <div
        className="relative h-64 w-full bg-bg"
        style={{
          backgroundImage: 'radial-gradient(circle at 1px 1px, #1a1d21 1px, transparent 0)',
          backgroundSize: '24px 24px',
        }}
      >
        <svg className="absolute inset-0 h-full w-full" viewBox="0 0 420 200" aria-hidden="true">
          <path d="M 95 95 L 200 60" stroke="#3a4048" strokeWidth="1.5" fill="none" />
          <path d="M 95 95 L 200 130" stroke="#3a4048" strokeWidth="1.5" fill="none" />
          <circle cx="200" cy="60" r="3" fill="var(--accent)" />
          <circle cx="200" cy="130" r="3" fill="var(--accent)" />
        </svg>
        {nodes.map((node) => (
          <div
            key={node.label}
            className="absolute flex -translate-y-1/2 flex-col rounded-lg border border-border-strong bg-surface px-3 py-2 shadow-sm"
            style={{ left: node.x, top: node.y }}
          >
            <div className="flex items-center gap-2">
              <span className={`h-5 w-5 rounded-md grid place-items-center ${node.cls}`}>
                <svg
                  width="10"
                  height="10"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  aria-hidden="true"
                >
                  {node.label === 'HTTP' ? <circle cx="12" cy="12" r="9" /> : null}
                  {node.label === 'Transform' ? <path d="M4 7h16M4 12h10M4 17h16" /> : null}
                  {node.label === 'Email' ? <path d="M3 6h18v12H3z" /> : null}
                </svg>
              </span>
              <span className="text-sm font-medium">{node.label}</span>
            </div>
            <span className="mt-0.5 text-[11px] text-muted">{node.sub}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

export function LandingPage() {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(codeExample)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      setCopied(false)
    }
  }

  return (
    <div className="min-h-svh flex flex-col" style={{ background: 'var(--bg)' }}>
      <header className="lnav">
        <div className="flex items-center gap-4">
          <div className="logo">
            <span className="logo-mark">F</span>
            <span>FlowForge</span>
          </div>
          <span className="badge" style={{ padding: '2px 8px', fontSize: '10px' }}>
            v1 · beta
          </span>
        </div>
        <nav className="lnav-links">
          <a href="#product">Product</a>
          <Link to="/docs">Docs</Link>
          <a href="#features">Features</a>
        </nav>
        <div className="lnav-cta">
          <Button variant="ghost" size="sm" asChild>
            <Link to="/login">Sign in</Link>
          </Button>
          <StartTrialButton size="sm" variant="outline" label="Try FlowForge" hideArrow />
          <Button size="sm" asChild>
            <Link to="/signup">
              Get started
              <ArrowRight className="ml-1 h-3.5 w-3.5" aria-hidden="true" />
            </Link>
          </Button>
        </div>
      </header>

      <main className="flex-1">
        <section className="lhero">
          <div className="lhero-bg" aria-hidden="true">
            <div className="grid" />
            <div className="glow" />
          </div>

          <div className="lhero-eyebrow" style={{ position: 'relative', zIndex: 1 }}>
            <span className="live-dot" aria-hidden="true" />
            <span>
              Now in public beta ·{' '}
              <span style={{ color: 'var(--accent)' }}>open source</span>
            </span>
          </div>

          <h1>
            Workflows that
            <br />
            <span className="grad">never lose state.</span>
          </h1>
          <p>
            Define a graph of tasks once. FlowForge runs it asynchronously, recovers from worker
            failures automatically, and records every attempt — so you always know what happened.
          </p>

          <div className="lhero-ctas">
            <StartTrialButton size="lg" label="Try FlowForge" />
            <Button size="lg" variant="outline" asChild>
              <Link to="/docs">
                <BookOpen className="mr-2 h-4 w-4" aria-hidden="true" />
                Read the docs
              </Link>
            </Button>
          </div>
          <div className="lhero-meta">
            No signup needed — a trial workspace is created instantly · 10 AI actions included ·{' '}
            <Link to="/signup">create an account to keep your work →</Link>
          </div>

          <div className="lhero-dag" style={{ position: 'relative' }}>
            <FlowGraph />
          </div>
        </section>

        <section className="logos">
          <div className="label">Built on a focused, durable stack</div>
          <div className="logos-row">
            <div className="logo-slot">◆ Go</div>
            <div className="logo-slot">● PostgreSQL</div>
            <div className="logo-slot">◆ React</div>
            <div className="logo-slot">■ Vite</div>
            <div className="logo-slot">▲ React Flow</div>
            <div className="logo-slot">■ TanStack Query</div>
          </div>
          <div className="logos-metric">
            <span className="text-accent">At-least-once</span> execution · <b>durable</b> by
            design
          </div>
          <div className="logos-metric-sub">
            every attempt recorded · immutable versions · postgres-backed queue
          </div>
        </section>

        <section className="lsection" id="product">
          <div className="lsection-inner">
            <div className="lsection-head">
              <div className="lsection-eyebrow">How it works</div>
              <h2 className="lsection-title">
                From code to running graph
                <br />
                in three steps.
              </h2>
              <p className="lsection-sub">
                No queues to configure. No state machine to write. Define, publish, watch it run.
              </p>
            </div>
            <div className="steps">
              {steps.map((step) => (
                <div className="step" key={step.num}>
                  <div className="step-num">{step.num}</div>
                  <div className="step-title">{step.title}</div>
                  <div className="step-desc">{step.description}</div>
                  {step.code}
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="lsection" id="features" style={{ paddingTop: 20 }}>
          <div className="lsection-inner">
            <div className="lsection-head">
              <div className="lsection-eyebrow">Built for reliability</div>
              <h2 className="lsection-title">
                Every feature exists because
                <br />
                an on-call engineer needed it.
              </h2>
            </div>
            <div className="bento">
              <div className="bento-card b-1">
                <div className="bi">
                  <RefreshCw className="h-4 w-4" aria-hidden="true" />
                </div>
                <div className="bt">Durable execution</div>
                <div className="bd">
                  Worker crashed mid-task? Another picks it up. Leases and heartbeats guarantee
                  at-least-once execution.
                </div>
                <div className="fillvis">
                  <div className="flex items-center gap-2 font-mono text-[11px] text-muted mb-3">
                    <span className="live-dot" aria-hidden="true" /> worker-01a · task-3 · lease 30s
                  </div>
                  <div className="durable-bar">
                    <div
                      className="durable-bar-fill"
                      style={{ width: '100%', background: 'var(--running)' }}
                    />
                  </div>
                  <div className="durable-demo">
                    <div className="durable-line in" style={{ color: 'var(--success)' }}>
                      ✓ resumed on w-02b
                    </div>
                    <div className="durable-line in" style={{ color: 'var(--success)' }}>
                      ✓ completed · no data lost
                    </div>
                  </div>
                </div>
              </div>
              <div className="bento-card b-2">
                <div className="bi">
                  <GitBranch className="h-4 w-4" aria-hidden="true" />
                </div>
                <div className="bt">Immutable versions</div>
                <div className="bd">Publish creates a frozen snapshot. Rollback in one click.</div>
                <div className="flex gap-6 mt-auto">
                  <span className="badge">v1</span>
                  <span className="badge">v2</span>
                  <span className="badge active">
                    <span className="dot" />
                    v3
                  </span>
                </div>
              </div>
              <div className="bento-card b-3">
                <div className="bi">
                  <WorkflowIcon className="h-4 w-4" aria-hidden="true" />
                </div>
                <div className="bt">Visual + code, either way</div>
                <div className="bd">Design in the drag-drop editor. Ship YAML/TS from CI.</div>
                <div className="fillvis" style={{ padding: 14 }}>
                  <svg viewBox="0 0 260 90" style={{ width: '100%', height: '100%' }} aria-hidden="true">
                    <rect x="10" y="30" width="60" height="30" rx="4" fill="var(--surface-3)" stroke="var(--success)" />
                    <rect x="100" y="10" width="60" height="30" rx="4" fill="var(--surface-3)" stroke="var(--border-strong)" />
                    <rect x="100" y="50" width="60" height="30" rx="4" fill="var(--surface-3)" stroke="var(--border-strong)" />
                    <rect x="190" y="30" width="60" height="30" rx="4" fill="var(--surface-3)" stroke="var(--accent)" />
                    <path d="M70,45 C85,45 85,25 100,25" fill="none" stroke="#3a4048" strokeWidth="1.4" />
                    <path d="M70,45 C85,45 85,65 100,65" fill="none" stroke="#3a4048" strokeWidth="1.4" />
                    <path d="M160,25 C175,25 175,45 190,45" fill="none" stroke="#3a4048" strokeWidth="1.4" />
                    <path d="M160,65 C175,65 175,45 190,45" fill="none" stroke="#3a4048" strokeWidth="1.4" />
                  </svg>
                </div>
              </div>
              <div className="bento-card b-4">
                <div className="bi">
                  <History className="h-4 w-4" aria-hidden="true" />
                </div>
                <div className="bt">Deep observability</div>
                <div className="bd">Timelines, logs, inputs — per task, per run.</div>
              </div>
              <div className="bento-card b-5">
                <div className="bi">
                  <RefreshCw className="h-4 w-4" aria-hidden="true" />
                </div>
                <div className="bt">Smart retries</div>
                <div className="bd">Exponential backoff, jitter, dead-letter.</div>
              </div>
              <div className="bento-card b-6">
                <div className="bi">
                  <Play className="h-4 w-4" aria-hidden="true" />
                </div>
                <div className="bt">Any trigger</div>
                <div className="bd">Cron, webhooks, events, API.</div>
              </div>
            </div>
          </div>
        </section>

        <section className="lsection" id="docs" style={{ paddingTop: 20 }}>
          <div className="lsection-inner" style={{ maxWidth: 960 }}>
            <div className="lsection-head">
              <div className="lsection-eyebrow">Developer-first API</div>
              <h2 className="lsection-title">
                Feels like writing
                <br />
                regular functions.
              </h2>
              <p className="lsection-sub">
                Because it is. FlowForge just makes them durable, retriable, and observable.
              </p>
            </div>
            <div className="code-block">
              <div className="code-head">
                <div className="dots" aria-hidden="true">
                  <i />
                  <i />
                  <i />
                </div>
                <span style={{ flex: 1, textAlign: 'center' }}>order-fulfillment.ts</span>
                <span>TypeScript</span>
              </div>
              <button
                className="copy-btn"
                type="button"
                onClick={handleCopy}
                aria-label="Copy code example"
              >
                {copied ? (
                  <Check className="mr-1 h-3 w-3" aria-hidden="true" />
                ) : (
                  <Copy className="mr-1 h-3 w-3" aria-hidden="true" />
                )}
                {copied ? 'Copied!' : 'Copy'}
              </button>
              <div className="code-body">
                <pre style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{codeExample}</pre>
              </div>
            </div>
          </div>
        </section>

        <section className="lsection" style={{ paddingTop: 20 }}>
          <div className="lsection-inner">
            <div className="lsection-head">
              <div className="lsection-eyebrow">Why FlowForge</div>
              <h2 className="lsection-title">The bar has moved.</h2>
            </div>
            <div className="why-grid">
              <div className="why-card why-bad">
                <h4>
                  <ChevronRight className="h-4 w-4 rotate-45" aria-hidden="true" />
                  Cron + queues + custom retry logic
                </h4>
                <ul className="why-list">
                  {whyBad.map((item) => (
                    <li key={item}>
                      <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="why-card why-good">
                <h4>
                  <CheckCircle2 className="h-4 w-4 text-success" aria-hidden="true" />
                  FlowForge
                </h4>
                <ul className="why-list">
                  {whyGood.map((item) => (
                    <li key={item}>
                      <CheckCircle2 className="h-3.5 w-3.5 text-success" aria-hidden="true" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </section>

        <section className="lcta">
          <div className="lcta-bg" aria-hidden="true" />
          <h2>
            Ship your first
            <br />
            durable workflow tonight.
          </h2>
          <p>
            Open source and self-hostable. Define a DAG once, and every run is durable,
            observable, and recoverable.
          </p>
          <div className="lcta-btns">
            <StartTrialButton size="lg" label="Try FlowForge" />
            <Button size="lg" variant="outline" asChild>
              <Link to="/signup">
                Create an account
                <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />
              </Link>
            </Button>
          </div>
        </section>
      </main>

      <footer className="lfoot">
        <div className="lfoot-brand">
          <div className="logo">
            <span className="logo-mark">F</span>
            <span>FlowForge</span>
          </div>
          <p>
            Durable distributed workflow orchestration. Built for the moment your infrastructure is
            on fire.
          </p>
          <div className="status">
            <span className="live-dot" aria-hidden="true" />
            Public beta
          </div>
        </div>
        <div>
          <h5>Product</h5>
          <ul>
            <li>Editor</li>
            <li>Observability</li>
            <li>Versions</li>
            <li>Triggers</li>
            <li>Changelog</li>
          </ul>
        </div>
        <div>
          <h5>Developers</h5>
          <ul>
            <li>
              <Link to="/docs">Documentation</Link>
            </li>
            <li>API reference</li>
            <li>SDKs</li>
            <li>Examples</li>
            <li>Open source</li>
          </ul>
        </div>
        <div>
          <h5>Company</h5>
          <ul>
            <li>About</li>
            <li>Blog</li>
            <li>Contributing</li>
            <li>Community</li>
            <li>Contact</li>
          </ul>
        </div>
        <div>
          <h5>Legal</h5>
          <ul>
            <li>Privacy</li>
            <li>Terms</li>
            <li>Security</li>
            <li>License</li>
          </ul>
        </div>
      </footer>
    </div>
  )
}
