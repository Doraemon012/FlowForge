import { memo } from 'react'
import { X } from 'lucide-react'
import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  type EdgeProps,
} from '@xyflow/react'
import { useEdgeActions } from './edge-actions'

/**
 * A bezier edge with an always-available remove control at its midpoint so a
 * connection can be deleted directly on the canvas. Reconnecting is handled by
 * dragging either endpoint (React Flow's reconnect behaviour).
 */
export const WorkflowEdge = memo(function WorkflowEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  markerEnd,
  style,
  selected,
}: EdgeProps) {
  const { onDeleteEdge } = useEdgeActions()
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  })

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        markerEnd={markerEnd}
        style={{
          strokeWidth: selected ? 2.5 : 1.5,
          stroke: selected ? 'var(--primary)' : undefined,
          ...style,
        }}
      />
      <EdgeLabelRenderer>
        <button
          type="button"
          className="nodrag nopan pointer-events-auto absolute flex h-5 w-5 items-center justify-center rounded-full border border-border/80 bg-card text-muted-foreground shadow-sm transition-colors hover:border-destructive/50 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          style={{
            transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
          }}
          aria-label="Remove connection"
          title="Remove connection"
          onClick={(event) => {
            event.stopPropagation()
            onDeleteEdge(id)
          }}
        >
          <X className="h-3 w-3" aria-hidden="true" />
        </button>
      </EdgeLabelRenderer>
    </>
  )
})

export default WorkflowEdge
