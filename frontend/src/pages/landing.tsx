import { Link } from 'react-router-dom'
import {
  ArrowRight,
  BookOpen,
  CheckCircle2,
  ChevronRight,
  GitBranch,
  History,
  Play,
  RefreshCw,
  Sparkles,
  Workflow as WorkflowIcon,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { StartTrialButton } from '@/components/auth/StartTrialButton'
import { FlowForgeLogo } from '@/components/brand/FlowForgeLogo'
import { ExecutionDemo } from '@/components/landing/ExecutionDemo'
import { useScrollReveal } from '@/hooks/use-scroll-reveal'
import orchestrationGraph from '@/assets/orchestration-graph.svg'
import builderCanvas from '@/assets/builder-canvas.svg'
import heroOrchestration from '@/assets/hero-orchestration.webp'

const steps = [
  {
    num: 'STEP 01',
    title: 'Model the workflow',
    description:
      'Add tasks in the visual builder and connect their dependencies. Five built-in types: HTTP, transform, delay, conditional, and email.',
    code: (
      <div className="step-visual">
        <span className="c">// workflow definition</span>
        <br />
        <span className="var">"tasks"</span>: [
        <br />
        <span>{'  '}</span>
        <span>{'{ '}</span>
        <span className="str">"id"</span>: <span className="str">"fetch"</span>,{' '}
        <span className="str">"type"</span>: <span className="n">"http"</span>
        <span>{' }'}</span>,
        <br />
        <span>{'  '}</span>
        <span>{'{ '}</span>
        <span className="str">"id"</span>: <span className="str">"summarize"</span>,{' '}
        <span className="str">"type"</span>: <span className="n">"transform"</span>,{' '}
        <span className="str">"depends_on"</span>: [<span className="str">"fetch"</span>]
        <span>{' }'}</span>,
        <br />
        <span>{'  '}</span>
        <span>{'{ '}</span>
        <span className="str">"id"</span>: <span className="str">"notify"</span>,{' '}
        <span className="str">"type"</span>: <span className="n">"email"</span>,{' '}
        <span className="str">"depends_on"</span>: [<span className="str">"summarize"</span>]
        <span>{' }'}</span>
        <br />
        ]
      </div>
    ),
  },
  {
    num: 'STEP 02',
    title: 'Publish a version',
    description:
      'Publishing freezes an immutable version; activating it decides which version new runs use. Editing later never changes a version already running.',
    code: (
      <div className="step-visual">
        <span className="c">// versions</span>
        <br />
        <span className="s">✓</span> validated
        <br />
        <span className="s">✓</span> published <span className="n">v3</span>
        <br />
        <span className="s">✓</span> activated <span className="var">v3</span> for new runs
        <br />
        <br />
        <span className="c">history · v1 · v2 · v3 (immutable)</span>
      </div>
    ),
  },
  {
    num: 'STEP 03',
    title: 'Run and watch',
    description:
      'Start a run from the button, the API, a webhook, or a schedule. Workers claim ready tasks in parallel and record every attempt.',
    code: (
      <div className="step-visual">
        <span className="c">// execution c013970d</span>
        <br />
        <span className="s">✓</span> <span className="n">fetch</span> &nbsp;&nbsp;&nbsp;&nbsp;
        <span className="num">412ms</span>
        <br />
        <span className="s">✓</span> <span className="n">summarize</span>
        &nbsp;&nbsp;<span className="num">89ms</span>
        <br />
        <span style={{ color: '#60a5fa' }}>▍</span> <span className="n">notify</span>{' '}
        &nbsp;&nbsp;&nbsp;&nbsp;<span style={{ color: '#60a5fa' }}>running…</span>
      </div>
    ),
  },
]

const whyGood = [
  'A dead worker’s task is reclaimed automatically from lease expiry',
  'Durable state in Postgres — every step, every attempt',
  'Attempt history and logs for every run',
  'Immutable versions with one-click activate',
  'Retries with exponential backoff and jitter',
  'AI authoring that flags risky config before you run',
  'Starter templates so a first workflow runs before you design one',
  'Compare versions to see exactly what changed, task by task',
]

const whyBad = [
  'Retry logic re-invented per job',
  'State lost when workers restart',
  'Debug via grep across three services',
  'Versioning? Good luck.',
]

const definitionExample = `{
  "tasks": [
    { "id": "fetch", "type": "http", "config": { "url": "https://api.example.com" } },
    { "id": "summarize", "type": "transform", "config": {}, "depends_on": ["fetch"] },
    { "id": "notify", "type": "email", "config": { "to": "ops@example.com" }, "depends_on": ["summarize"] }
  ]
}`

const runExample = `# publish an immutable version, then run it
curl -X POST $API/projects/$PID/workflows/$WID/versions
curl -X POST $API/projects/$PID/workflows/$WID/executions \\
  -H "Authorization: Bearer $TOKEN" \\
  -d '{ "version_id": "v3", "input": {} }'`

export function LandingPage() {
  const pageRef = useScrollReveal<HTMLDivElement>()
  return (
    <div
      ref={pageRef}
      className="min-h-svh flex flex-col"
      style={{ background: 'var(--bg)' }}
    >
      <header className="lnav">
        <div className="flex items-center gap-4">
          <FlowForgeLogo />
        </div>
        <nav className="lnav-links">
          <a href="#product">Product</a>
          <a href="#features">Features</a>
          <Link to="/docs">Docs</Link>
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
            <div className="lhero-art">
              <img
                src={heroOrchestration}
                alt=""
                width={1024}
                height={1024}
                decoding="async"
                fetchPriority="high"
              />
            </div>
          </div>

          <div className="lhero-eyebrow">
            <span>Distributed workflow orchestration</span>
          </div>

          <h1>
            Workflows that
            <br />
            <span className="grad">never lose state.</span>
          </h1>
          <p>
            Define a graph of tasks once. FlowForge runs it asynchronously, recovers from
            worker failures automatically, and records every attempt — so you always know
            what happened.
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

          <div className="mt-16 flex justify-center px-2">
            <ExecutionDemo />
          </div>
        </section>

        <section className="logos">
          <div className="label">Built on a focused, durable stack</div>
          <div className="logos-row">
            <div className="logo-slot">Go</div>
            <div className="logo-slot">PostgreSQL</div>
            <div className="logo-slot">React</div>
            <div className="logo-slot">Vite</div>
            <div className="logo-slot">React Flow</div>
            <div className="logo-slot">TanStack Query</div>
          </div>
          <div className="logos-metric">
            <span className="text-accent">At-least-once</span> execution · <b>durable</b> by
            design
          </div>
          <div className="logos-metric-sub">
            every attempt recorded · immutable versions · postgres-backed queue
          </div>
        </section>

        <section className="lshowcase" id="graph">
          <div className="lshowcase-inner">
            <div className="lsection-head">
              <div className="lsection-eyebrow">The workflow graph</div>
              <h2 className="lsection-title">
                One definition.
                <br />
                Every dependency explicit.
              </h2>
              <p className="lsection-sub">
                A version is a frozen snapshot of the graph — its tasks, their config, and the
                edges between them. Activating a version decides which one new runs use.
              </p>
            </div>
            <div className="lshowcase-art reveal">
              <img
                src={orchestrationGraph}
                alt="A FlowForge workflow graph: a signed webhook trigger starts an http task that has completed, feeding a transform task that is currently running and a conditional task that is being retried. Dependent email and delay tasks are still queued."
                width={1200}
                height={640}
                loading="lazy"
                decoding="async"
              />
            </div>
            <div className="lshowcase-chips reveal">
              <span className="lshowcase-chip">
                <i style={{ background: 'var(--queued)' }} />
                queued
              </span>
              <span className="lshowcase-chip">
                <i style={{ background: 'var(--running)' }} />
                running
              </span>
              <span className="lshowcase-chip">
                <i style={{ background: 'var(--success)' }} />
                done
              </span>
              <span className="lshowcase-chip">
                <i style={{ background: 'var(--paused)' }} />
                retry
              </span>
            </div>
          </div>
        </section>

        <section className="lsection" id="product">
          <div className="lsection-inner">
            <div className="lsection-head">
              <div className="lsection-eyebrow">How it works</div>
              <h2 className="lsection-title">
                From a task graph to a running
                <br />
                execution in three steps.
              </h2>
              <p className="lsection-sub">
                No broker to run and no state machine to write. Model it, publish it, run it.
              </p>
            </div>
            <div className="steps reveal">
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
                Every capability exists because
                <br />
                an on-call engineer needed it.
              </h2>
            </div>
            <div className="bento reveal">
              <div className="bento-card b-1">
                <div className="bi">
                  <RefreshCw className="h-4 w-4" aria-hidden="true" />
                </div>
                <div className="bt">Durable execution</div>
                <div className="bd">
                  Worker crashed mid-task? Its lease expires, another worker reclaims the
                  task, and the attempt is recorded. Retries use exponential backoff with
                  jitter.
                </div>
                <div className="fillvis dur-vis">
                  <div className="dur-kicker">task-3 · lease 30s</div>
                  <div className="dur-row">
                    <span className="dur-w">w-01a</span>
                    <span className="dur-track">
                      <span className="dur-seg lost" />
                    </span>
                    <span className="dur-tag lost">lease expired</span>
                  </div>
                  <div className="dur-row">
                    <span className="dur-w">w-02b</span>
                    <span className="dur-track">
                      <span className="dur-seg reclaimed" />
                    </span>
                    <span className="dur-tag ok">reclaimed</span>
                  </div>
                  <div className="dur-note">attempt 1 persisted · task re-queued, not lost</div>
                </div>
              </div>
              <div className="bento-card b-2">
                <div className="bi">
                  <GitBranch className="h-4 w-4" aria-hidden="true" />
                </div>
                <div className="bt">Immutable versions</div>
                <div className="bd">
                  Publishing freezes a snapshot; activating it decides new runs. Rollback by
                  activating an older version.
                </div>
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
                <div className="bt">Visual builder</div>
                <div className="bd">
                  Design the DAG by drag-and-drop or post the definition from your own
                  tooling. HTTP, transform, delay, conditional, and email tasks out of the box.
                </div>
                <div className="fillvis fillvis-art">
                  <img
                    src={builderCanvas}
                    alt="The FlowForge builder: a palette of the five built-in task types beside a canvas where an http task feeds an email task, a transform task is selected, and a new task can be dropped into the graph."
                    width={640}
                    height={300}
                    loading="lazy"
                    decoding="async"
                  />
                </div>
              </div>
              <div className="bento-card b-4">
                <div className="bi">
                  <History className="h-4 w-4" aria-hidden="true" />
                </div>
                <div className="bt">Deep observability</div>
                <div className="bd">
                  Timelines, persisted logs, outputs, and attempt history — per task, per run.
                </div>
              </div>
              <div className="bento-card b-5">
                <div className="bi">
                  <Play className="h-4 w-4" aria-hidden="true" />
                </div>
                <div className="bt">Triggers</div>
                <div className="bd">Manual and API runs, signed webhooks, and a timezone-aware cron scheduler.</div>
              </div>
              <div className="bento-card b-6">
                <div className="bi">
                  <Sparkles className="h-4 w-4" aria-hidden="true" />
                </div>
                <div className="bt">AI-assisted authoring</div>
                <div className="bd">
                  Generate a workflow from a prompt and flag risky config — placeholders,
                  inline secrets, unsafe retries — before you run.
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="lsection" id="api" style={{ paddingTop: 20 }}>
          <div className="lsection-inner">
            <div className="lsection-head">
              <div className="lsection-eyebrow">Built to integrate</div>
              <h2 className="lsection-title">
                Author in the app,
                <br />
                run it from anywhere.
              </h2>
              <p className="lsection-sub">
                The visual builder and the API describe the same definition. Create a
                workflow, publish a version, then start a run from the UI, the API, a
                webhook, or a schedule.
              </p>
            </div>
            <div className="why-grid reveal">
              <div className="why-card">
                <h4>
                  <WorkflowIcon className="h-4 w-4" aria-hidden="true" />
                  Workflow definition
                </h4>
                <div className="step-visual">
                  <pre style={{ margin: 0, whiteSpace: 'pre-wrap', fontFamily: 'inherit' }}>
                    {definitionExample}
                  </pre>
                </div>
              </div>
              <div className="why-card">
                <h4>
                  <Play className="h-4 w-4" aria-hidden="true" />
                  Publish and run
                </h4>
                <div className="step-visual">
                  <pre style={{ margin: 0, whiteSpace: 'pre-wrap', fontFamily: 'inherit' }}>
                    {runExample}
                  </pre>
                </div>
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
            <div className="why-grid reveal">
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
          <div className="lcta-inner">
            <div className="lcta-art">
              <img
                src={heroOrchestration}
                alt="A FlowForge task graph: one task fans out to three dependents — two finished, one being retried — with worker nodes alongside."
                width={1024}
                height={1024}
                loading="lazy"
                decoding="async"
              />
            </div>
            <div className="lcta-copy">
              <h2>
                Run your first
                <br />
                durable workflow tonight.
              </h2>
              <p>
                Self-hostable and PostgreSQL-backed end to end. Define a DAG once, and every
                run is durable, observable, and recoverable.
              </p>
              <div className="lcta-btns reveal">
                <StartTrialButton size="lg" label="Try FlowForge" />
                <Button size="lg" variant="outline" asChild>
                  <Link to="/signup">
                    Create an account
                    <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />
                  </Link>
                </Button>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="lfoot">
        <div className="lfoot-brand">
          <FlowForgeLogo />
          <p>
            Durable distributed workflow orchestration. A Postgres-backed queue, independent
            workers, and at-least-once execution.
          </p>
          <div className="status">Runs locally · self-hosted</div>
        </div>
        <div>
          <h5>Product</h5>
          <ul>
            <li>
              <a href="#features">Features</a>
            </li>
            <li>
              <a href="#product">How it works</a>
            </li>
            <li>
              <Link to="/docs">Documentation</Link>
            </li>
          </ul>
        </div>
        <div>
          <h5>Developers</h5>
          <ul>
            <li>
              <Link to="/docs/running">Running a workflow</Link>
            </li>
            <li>
              <Link to="/docs/executions">Execution & failures</Link>
            </li>
            <li>
              <Link to="/docs/recovery">Retries & recovery</Link>
            </li>
          </ul>
        </div>
        <div>
          <h5>Learn</h5>
          <ul>
            <li>
              <Link to="/docs/tutorials">Tutorials</Link>
            </li>
            <li>
              <Link to="/docs/examples">Examples</Link>
            </li>
            <li>
              <Link to="/docs/task-types">Task types</Link>
            </li>
          </ul>
        </div>
        <div>
          <h5>Account</h5>
          <ul>
            <li>
              <Link to="/login">Sign in</Link>
            </li>
            <li>
              <Link to="/signup">Create account</Link>
            </li>
            <li>
              <Link to="/signup">Free trial</Link>
            </li>
          </ul>
        </div>
      </footer>
    </div>
  )
}
