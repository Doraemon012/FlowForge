import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'

/**
 * A live depiction of what FlowForge actually does to a run: tasks become ready
 * in dependency order, workers claim them, one parallel branch is reclaimed
 * after a lease expiry, and every task ends recorded. It is the product's
 * execution semantics — not a decorative graph — so it is worth the pixels.
 *
 * The animation is driven by a phase index rather than looping CSS so the
 * "attempt 2" retry reads as a real event. It pauses under
 * `prefers-reduced-motion` (the phase simply stops advancing) and the whole
 * thing is a single labelled image for assistive tech.
 */

type NodeState = 'queued' | 'running' | 'done' | 'retry'

interface DemoTask {
  id: string
  type: string
  worker: string
  x: number
  y: number
}

const NODE_WIDTH = 150
const NODE_HEIGHT = 58

const TASKS: DemoTask[] = [
  { id: 'fetch', type: 'HTTP', worker: 'w-01', x: 16, y: 131 },
  { id: 'enrich', type: 'Transform', worker: 'w-02', x: 244, y: 40 },
  { id: 'validate', type: 'Conditional', worker: 'w-01', x: 244, y: 222 },
  { id: 'notify', type: 'Email', worker: 'w-02', x: 472, y: 40 },
]

const EDGES: { id: string; from: string; to: string; dependsOn: string }[] = [
  { id: 'fetch-enrich', from: 'fetch', to: 'enrich', dependsOn: 'fetch' },
  { id: 'fetch-validate', from: 'fetch', to: 'validate', dependsOn: 'fetch' },
  { id: 'enrich-notify', from: 'enrich', to: 'notify', dependsOn: 'enrich' },
]

/** One entry per animation phase: the state of each task, in TASKS order. */
const PHASES: NodeState[][] = [
  ['running', 'queued', 'queued', 'queued'],
  ['done', 'running', 'running', 'queued'],
  ['done', 'done', 'retry', 'queued'],
  ['done', 'done', 'running', 'queued'],
  ['done', 'done', 'done', 'running'],
  ['done', 'done', 'done', 'done'],
]

const PHASE_MS = 1500
const LAST_PHASE = PHASES.length - 1

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

function center(task: DemoTask): { x: number; y: number } {
  return { x: task.x + NODE_WIDTH, y: task.y + NODE_HEIGHT / 2 }
}

function taskById(id: string): DemoTask {
  const task = TASKS.find((candidate) => candidate.id === id)
  if (!task) throw new Error(`Unknown demo task: ${id}`)
  return task
}

interface ExecutionDemoProps {
  className?: string
}

export function ExecutionDemo({ className }: ExecutionDemoProps) {
  const [phase, setPhase] = useState(0)

  useEffect(() => {
    if (prefersReducedMotion()) {
      setPhase(LAST_PHASE)
      return
    }
    const timer = window.setInterval(() => {
      setPhase((current) => (current + 1) % PHASES.length)
    }, PHASE_MS)
    return () => window.clearInterval(timer)
  }, [])

  const states = PHASES[phase]
  const stateOf = (id: string): NodeState => {
    const index = TASKS.findIndex((task) => task.id === id)
    return states[index] ?? 'queued'
  }
  const runningCount = states.filter((state) => state === 'running').length
  const doneCount = states.filter((state) => state === 'done').length
  const runComplete = doneCount === TASKS.length

  return (
    <div className={cn('exec-demo', className)}>
      <div className="exec-demo-bar">
        <span className="exec-demo-dots" aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
        <span className="exec-demo-run">
          execution <b>0f3a91c4</b>
        </span>
        {/* The stage label changes every phase; announcing it as a live region
            would interrupt a screen reader on a loop. The SVG's single
            aria-label already describes the run, so this stays decorative. */}
        <span
          className={cn('exec-demo-status', runComplete ? 'is-done' : 'is-running')}
          aria-hidden="true"
        >
          <span className="exec-demo-pulse" aria-hidden="true" />
          {runComplete ? 'completed' : `${runningCount} running`}
        </span>
      </div>

      <div className="exec-demo-stage">
        <svg
          viewBox="0 0 640 320"
          role="img"
          aria-label="A FlowForge run executing: tasks become ready in dependency order, workers claim them in parallel, a task is reclaimed after a lost lease, and every attempt completes."
        >
          <g className="exec-edges">
            {EDGES.map((edge) => {
              const from = center(taskById(edge.from))
              const to = center(taskById(edge.to))
              const midX = (from.x + to.x) / 2
              const on = stateOf(edge.dependsOn) === 'done'
              return (
                <path
                  key={edge.id}
                  d={`M ${from.x} ${from.y} C ${midX} ${from.y}, ${midX} ${to.y}, ${to.x} ${to.y}`}
                  className={cn('exec-edge', on && 'on')}
                />
              )
            })}
          </g>

          {TASKS.map((task) => {
            const state = stateOf(task.id)
            const isRetry = state === 'retry'
            return (
              <g key={task.id} className={cn('exec-node', state)} transform={`translate(${task.x} ${task.y})`}>
                <rect width={NODE_WIDTH} height={NODE_HEIGHT} rx="10" />
                <rect className="exec-node-stripe" width="3" height={NODE_HEIGHT - 20} x="0" y="10" rx="1.5" />
                <text className="exec-node-title" x="16" y="24">
                  {task.id}
                </text>
                <text className="exec-node-type" x="16" y="42">
                  {task.type}
                </text>
                {state !== 'queued' ? (
                  <text className="exec-node-worker" x={NODE_WIDTH - 14} y="24" textAnchor="end">
                    {isRetry ? 'attempt 2' : task.worker}
                  </text>
                ) : null}
                <circle className="exec-node-dot" cx={NODE_WIDTH - 20} cy={NODE_HEIGHT - 18} r="4" />
              </g>
            )
          })}
        </svg>
      </div>

      <div className="exec-demo-foot">
        <span>{doneCount}/{TASKS.length} tasks recorded</span>
        <span className="exec-demo-attempts">every attempt persisted</span>
      </div>
    </div>
  )
}
