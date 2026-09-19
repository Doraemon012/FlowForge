import { cn } from '@/lib/utils'

/**
 * The FlowForge hero illustration: a real workflow graph — a trigger fanning out
 * to tasks, one task mid-flight, one being retried after a lost lease, and the
 * dependent tasks still queued.
 *
 * It is an inline SVG drawn entirely from the design tokens (`--surface`,
 * `--running`, `--success`, `--paused`, …) rather than a raster render, so:
 * it reads correctly in both light and dark without a blend-mode trick, it
 * stays crisp at any size and costs no image request, and it cannot drift from
 * the product's own colour language.
 */
const NODE_W = 156
const NODE_H = 58

type TaskState = 'queued' | 'running' | 'done' | 'retry'

interface ArtTask {
  id: string
  type: string
  worker: string
  x: number
  y: number
  state: TaskState
}

const TASKS: ArtTask[] = [
  { id: 'hook', type: 'webhook', worker: 'trigger', x: 12, y: 168, state: 'done' },
  { id: 'fetch', type: 'http', worker: 'w-01a', x: 236, y: 74, state: 'done' },
  { id: 'enrich', type: 'transform', worker: 'w-02b', x: 236, y: 262, state: 'running' },
  { id: 'notify', type: 'email', worker: 'queued', x: 460, y: 74, state: 'queued' },
  { id: 'audit', type: 'conditional', worker: 'attempt 2', x: 460, y: 262, state: 'retry' },
]

const EDGES: { from: string; to: string }[] = [
  { from: 'hook', to: 'fetch' },
  { from: 'hook', to: 'enrich' },
  { from: 'fetch', to: 'notify' },
  { from: 'enrich', to: 'audit' },
]

const STATE_COLOR: Record<TaskState, string> = {
  queued: 'var(--queued)',
  running: 'var(--running)',
  done: 'var(--success)',
  retry: 'var(--paused)',
}

function taskById(id: string): ArtTask {
  const task = TASKS.find((candidate) => candidate.id === id)
  if (!task) throw new Error(`Unknown art task: ${id}`)
  return task
}

/** Right edge of the source node to the left edge of the target node. */
function edgePath(from: ArtTask, to: ArtTask): string {
  const startX = from.x + NODE_W
  const startY = from.y + NODE_H / 2
  const endX = to.x
  const endY = to.y + NODE_H / 2
  const midX = startX + (endX - startX) / 2
  return `M ${startX} ${startY} C ${midX} ${startY}, ${midX} ${endY}, ${endX} ${endY}`
}

interface OrchestrationArtProps {
  className?: string
  /** Accessible description; the illustration is meaningful, not decorative. */
  ariaLabel?: string
}

const DEFAULT_LABEL =
  'A FlowForge workflow graph: a webhook trigger starts an http task, which feeds an email task that is queued, and a transform task that is currently running on a worker. A conditional task depends on the transform and is on attempt 2 after its lease expired. Every attempt is recorded.'

export function OrchestrationArt({ className, ariaLabel = DEFAULT_LABEL }: OrchestrationArtProps) {
  return (
    <svg
      viewBox="0 0 628 380"
      role="img"
      aria-label={ariaLabel}
      className={cn('block h-auto w-full', className)}
      preserveAspectRatio="xMidYMid meet"
    >
      <defs>
        <pattern id="ff-art-dots" width="26" height="26" patternUnits="userSpaceOnUse">
          <circle cx="1.6" cy="1.6" r="1.6" fill="var(--grid-dot)" />
        </pattern>
        <radialGradient id="ff-art-glow" cx="50%" cy="42%" r="62%">
          <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.14" />
          <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
        </radialGradient>
        <marker
          id="ff-art-arrow"
          viewBox="0 0 10 10"
          refX="8"
          refY="5"
          markerWidth="6"
          markerHeight="6"
          orient="auto-start-reverse"
        >
          <path d="M 0 1 L 9 5 L 0 9 z" fill="var(--border-strong)" />
        </marker>
        <marker
          id="ff-art-arrow-live"
          viewBox="0 0 10 10"
          refX="8"
          refY="5"
          markerWidth="6"
          markerHeight="6"
          orient="auto-start-reverse"
        >
          <path d="M 0 1 L 9 5 L 0 9 z" fill="var(--accent-dim)" />
        </marker>
      </defs>

      {/* Ambient surface: a dot grid and an accent wash, both token-driven. */}
      <rect x="0" y="0" width="628" height="380" rx="18" fill="var(--surface)" />
      <rect x="0" y="0" width="628" height="380" rx="18" fill="url(#ff-art-dots)" opacity="0.85" />
      <rect x="0" y="0" width="628" height="380" rx="18" fill="url(#ff-art-glow)" />

      {/* A trigger banner, so the graph has an explicit entry point. */}
      <g>
        <rect
          x="12"
          y="26"
          width="200"
          height="30"
          rx="15"
          fill="var(--surface-2)"
          stroke="var(--border-strong)"
        />
        <circle cx="30" cy="41" r="4.5" fill="var(--success)" />
        <text x="44" y="45.5" fill="var(--muted)" className="ff-art-mono-125">
          signed webhook
        </text>
      </g>

      {/* Edges first, so nodes sit on top of the line ends. */}
      <g fill="none" strokeWidth="1.8">
        {EDGES.map((edge) => {
          const from = taskById(edge.from)
          const to = taskById(edge.to)
          const live = from.state === 'done' && (to.state === 'running' || to.state === 'retry')
          return (
            <path
              key={`${edge.from}-${edge.to}`}
              d={edgePath(from, to)}
              stroke={live ? 'var(--accent-dim)' : 'var(--border-strong)'}
              markerEnd={live ? 'url(#ff-art-arrow-live)' : 'url(#ff-art-arrow)'}
            />
          )
        })}
      </g>

      {TASKS.map((task) => {
        const color = STATE_COLOR[task.state]
        const dim = task.state === 'queued'
        return (
          <g key={task.id} transform={`translate(${task.x} ${task.y})`} opacity={dim ? 0.72 : 1}>
            <rect
              width={NODE_W}
              height={NODE_H}
              rx="12"
              fill="var(--surface)"
              stroke={dim ? 'var(--border-strong)' : color}
              strokeWidth={dim ? 1.2 : 1.6}
            />
            {/* Status stripe down the leading edge. */}
            <rect x="0" y="11" width="4" height={NODE_H - 22} rx="2" fill={color} />
            <text x="18" y="27" fill="var(--text)" className="ff-art-mono-135-600">
              {task.id}
            </text>
            <text x="18" y="45" fill="var(--dim)" className="ff-art-mono-115">
              {task.type}
            </text>
            <text
              x={NODE_W - 14}
              y="27"
              textAnchor="end"
              fill={dim ? 'var(--dim)' : color}
              className="ff-art-mono-115-500"
            >
              {task.worker}
            </text>
            <circle
              cx={NODE_W - 20}
              cy={NODE_H - 18}
              r="4.5"
              fill={color}
              opacity={task.state === 'queued' ? 0.5 : 1}
            />
            {task.state === 'running' ? (
              <circle
                cx={NODE_W - 20}
                cy={NODE_H - 18}
                r="8"
                fill="none"
                stroke={color}
                strokeWidth="1.4"
                opacity="0.45"
              />
            ) : null}
          </g>
        )
      })}

      {/* The durable-execution beat: a lease that expired and was reclaimed. */}
      <g transform="translate(12 330)">
        <rect
          x="0"
          y="0"
          width="604"
          height="34"
          rx="9"
          fill="var(--surface-2)"
          stroke="var(--border)"
        />
        <circle cx="18" cy="17" r="4" fill="var(--paused)" />
        <text x="32" y="21" fill="var(--muted)" className="ff-art-mono-12">
          audit · lease 30s expired → reclaimed by w-03c
        </text>
        <text
          x="590"
          y="21"
          textAnchor="end"
          fill="var(--paused)"
          className="ff-art-mono-12-500"
        >
          attempt 2 persisted
        </text>
      </g>
    </svg>
  )
}

export default OrchestrationArt
