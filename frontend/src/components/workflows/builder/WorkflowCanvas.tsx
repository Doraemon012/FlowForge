import { useCallback } from 'react'
import {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  ReactFlow,
  useReactFlow,
  type Connection,
  type EdgeChange,
  type NodeChange,
  type OnSelectionChangeParams,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import type { SupportedTaskType, WorkflowGraphEdge, WorkflowGraphNode } from './types'
import { WorkflowEdge } from './WorkflowEdge'
import { WorkflowNode } from './WorkflowNode'

const nodeTypes = { workflowTask: WorkflowNode }
const edgeTypes = { workflowEdge: WorkflowEdge }

interface WorkflowCanvasProps {
  nodes: WorkflowGraphNode[]
  edges: WorkflowGraphEdge[]
  onNodesChange: (changes: NodeChange<WorkflowGraphNode>[]) => void
  onEdgesChange: (changes: EdgeChange<WorkflowGraphEdge>[]) => void
  onConnect: (connection: Connection) => void
  onReconnect: (oldEdge: WorkflowGraphEdge, connection: Connection) => void
  onSelectionChange: (params: OnSelectionChangeParams) => void
  isValidConnection: (connection: Connection | WorkflowGraphEdge) => boolean
  onDropTask: (type: SupportedTaskType, position: { x: number; y: number }) => void
}

export function WorkflowCanvas({
  nodes,
  edges,
  onNodesChange,
  onEdgesChange,
  onConnect,
  onReconnect,
  onSelectionChange,
  isValidConnection,
  onDropTask,
}: WorkflowCanvasProps) {
  const { screenToFlowPosition } = useReactFlow()

  const handleDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
  }, [])

  const handleDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault()
      const type = event.dataTransfer.getData('application/flowforge-task') as SupportedTaskType
      if (!type) return
      const position = screenToFlowPosition({ x: event.clientX, y: event.clientY })
      onDropTask(type, position)
    },
    [onDropTask, screenToFlowPosition],
  )

  return (
    <div className="h-full w-full" onDrop={handleDrop} onDragOver={handleDragOver}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onReconnect={onReconnect}
        onSelectionChange={onSelectionChange}
        isValidConnection={isValidConnection}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        edgesReconnectable
        reconnectRadius={12}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        minZoom={0.3}
        maxZoom={2}
        deleteKeyCode={null}
        proOptions={{ hideAttribution: false }}
        className="bg-background"
      >
        <Background
          variant={BackgroundVariant.Lines}
          gap={24}
          size={1}
          color="var(--border)"
        />
        <Controls
          className="!rounded-lg !border !border-border/80 !bg-card !shadow-md"
          showInteractive={false}
        />
        <MiniMap
          className="!rounded-lg !border !border-border/80 !bg-card !shadow-md"
          nodeColor={(node) => {
            const data = (node as WorkflowGraphNode).data
            return data?.typeMeta?.accent ?? '#999'
          }}
          maskColor="rgba(0, 0, 0, 0.08)"
          pannable
          zoomable
        />
      </ReactFlow>
    </div>
  )
}
