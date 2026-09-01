import { useCallback, useEffect, useState } from 'react'
import { Box, X } from 'lucide-react'
import { toast } from 'sonner'
import {
  addEdge,
  MarkerType,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  type Connection,
  type EdgeChange,
  type NodeChange,
  type OnSelectionChangeParams,
} from '@xyflow/react'
import type { WorkflowTask } from '@/api/types'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { TaskConfigPanel } from './TaskConfigPanel'
import { TaskPalette } from './TaskPalette'
import { WorkflowCanvas } from './WorkflowCanvas'
import {
  createTaskNode,
  doesConnectionCreateCycle,
  edgeExists,
  generateTaskId,
  graphToTasks,
  tasksToEdges,
  tasksToNodes,
  validationErrorsByTaskId,
} from './graph-utils'
import {
  DEFAULT_CONFIG_BY_TYPE,
  type SupportedTaskType,
  type WorkflowGraphEdge,
  type WorkflowGraphNode,
} from './types'

interface WorkflowBuilderLayoutProps {
  initialTasks: WorkflowTask[]
  onTasksChange: (tasks: WorkflowTask[]) => void
  validationErrors: string[]
  headerLeft?: React.ReactNode
  headerActions?: React.ReactNode
  headerSecondary?: React.ReactNode
  className?: string
}

export function WorkflowBuilderLayout({
  initialTasks,
  onTasksChange,
  validationErrors,
  headerLeft,
  headerActions,
  headerSecondary,
  className,
}: WorkflowBuilderLayoutProps) {
  const [nodes, setNodes, onNodesChange] = useNodesState<WorkflowGraphNode>(
    tasksToNodes(initialTasks),
  )
  const [edges, setEdges, onEdgesChange] = useEdgesState<WorkflowGraphEdge>(
    tasksToEdges(initialTasks),
  )
  const [selectedNodeIds, setSelectedNodeIds] = useState<Set<string>>(new Set())
  const [selectedEdgeIds, setSelectedEdgeIds] = useState<Set<string>>(new Set())
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [configOpenMobile, setConfigOpenMobile] = useState(false)

  const syncTasks = useCallback(
    (nextNodes: WorkflowGraphNode[], nextEdges: WorkflowGraphEdge[]) => {
      setNodes(nextNodes)
      setEdges(nextEdges)
      onTasksChange(graphToTasks(nextNodes, nextEdges))
    },
    [setNodes, setEdges, onTasksChange],
  )

  // Reflect server-side validation errors on the relevant nodes.
  useEffect(() => {
    const errorMap = validationErrorsByTaskId(validationErrors)
    setNodes((currentNodes) =>
      currentNodes.map((node) => {
        const errors = errorMap.get(node.id) ?? []
        const current = node.data.validationErrors
        if (
          current.length === errors.length &&
          current.every((error, index) => error === errors[index])
        ) {
          return node
        }
        return { ...node, data: { ...node.data, validationErrors: errors } }
      }),
    )
  }, [validationErrors, setNodes])

  const addTask = useCallback(
    (type: SupportedTaskType, position?: { x: number; y: number }) => {
      const id = generateTaskId(nodes)
      const task: WorkflowTask = {
        id,
        type,
        config: { ...DEFAULT_CONFIG_BY_TYPE[type] },
        depends_on: [],
      }
      const node = createTaskNode(
        task,
        position ?? {
          x: 160 + (nodes.length % 4) * 40,
          y: 120 + Math.floor(nodes.length / 4) * 40,
        },
      )
      const nextNodes = [...nodes, node]
      syncTasks(nextNodes, edges)
      setSelectedNodeIds(new Set([id]))
      setSelectedEdgeIds(new Set())
      setConfigOpenMobile(true)
    },
    [nodes, edges, syncTasks],
  )

  const handleConnect = useCallback(
    (connection: Connection) => {
      if (!connection.source || !connection.target) return
      if (connection.source === connection.target) return
      if (edgeExists(connection.source, connection.target, edges)) return
      if (doesConnectionCreateCycle(connection, nodes, edges)) {
        toast.error('This connection would create a cycle.')
        return
      }
      const nextEdges = addEdge(
        {
          id: `${connection.source}->${connection.target}`,
          source: connection.source,
          target: connection.target,
          markerEnd: { type: MarkerType.ArrowClosed },
        },
        edges,
      )
      syncTasks(nodes, nextEdges)
    },
    [nodes, edges, syncTasks],
  )

  const isValidConnection = useCallback(
    (connection: Connection | WorkflowGraphEdge) => {
      if (!connection.source || !connection.target) return false
      if (connection.source === connection.target) return false
      if (edgeExists(connection.source, connection.target, edges)) return false
      return !doesConnectionCreateCycle(connection, nodes, edges)
    },
    [nodes, edges],
  )

  const deleteSelected = useCallback(() => {
    if (selectedNodeIds.size === 0 && selectedEdgeIds.size === 0) return
    const nextNodes = nodes.filter((node) => !selectedNodeIds.has(node.id))
    const nextEdges = edges.filter(
      (edge) =>
        !selectedNodeIds.has(edge.source) &&
        !selectedNodeIds.has(edge.target) &&
        !selectedEdgeIds.has(edge.id),
    )
    syncTasks(nextNodes, nextEdges)
    setSelectedNodeIds(new Set())
    setSelectedEdgeIds(new Set())
    setConfigOpenMobile(false)
  }, [nodes, edges, selectedNodeIds, selectedEdgeIds, syncTasks])

  const handleSelectionChange = useCallback((params: OnSelectionChangeParams) => {
    setSelectedNodeIds(new Set(params.nodes.map((node) => node.id)))
    setSelectedEdgeIds(new Set(params.edges.map((edge) => edge.id)))
    setConfigOpenMobile(params.nodes.length > 0)
    // Opening the inspector should close the task palette so the two panels
    // never stack awkwardly on top of each other on mobile.
    if (params.nodes.length > 0) {
      setPaletteOpen(false)
    }
  }, [])

  const handleTaskChange = useCallback(
    (taskId: string, patch: Partial<WorkflowTask>) => {
      const current = nodes.find((node) => node.id === taskId)?.data.task
      if (!current) return
      const nextTask = { ...current, ...patch }

      if (patch.id && patch.id !== taskId) {
        const newId = patch.id.trim()
        if (!newId) return
        if (nodes.some((node) => node.id === newId)) {
          toast.error('A task with that ID already exists.')
          return
        }
        const nextNodes = nodes.map((node) =>
          node.id === taskId
            ? { ...node, id: newId, data: { ...node.data, task: { ...node.data.task, id: newId } } }
            : node,
        )
        const nextEdges = edges.map((edge) => {
          const newSource = edge.source === taskId ? newId : edge.source
          const newTarget = edge.target === taskId ? newId : edge.target
          return { ...edge, id: `${newSource}->${newTarget}`, source: newSource, target: newTarget }
        })
        syncTasks(nextNodes, nextEdges)
        setSelectedNodeIds(new Set([newId]))
        setSelectedEdgeIds(new Set())
      } else {
        const nextNodes = nodes.map((node) =>
          node.id === taskId ? { ...node, data: { ...node.data, task: nextTask } } : node,
        )
        syncTasks(nextNodes, edges)
      }
    },
    [nodes, edges, syncTasks],
  )

  const handleDeleteTask = useCallback(() => {
    deleteSelected()
  }, [deleteSelected])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement
      const tagName = target?.tagName
      if (tagName === 'INPUT' || tagName === 'TEXTAREA' || tagName === 'SELECT') return
      if (
        (event.key === 'Delete' || event.key === 'Backspace') &&
        (selectedNodeIds.size > 0 || selectedEdgeIds.size > 0)
      ) {
        event.preventDefault()
        deleteSelected()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [deleteSelected, selectedNodeIds, selectedEdgeIds])

  useEffect(() => {
    if (!paletteOpen && !configOpenMobile) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setPaletteOpen(false)
        setConfigOpenMobile(false)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [paletteOpen, configOpenMobile])

  // Toggle the task palette as a single clean action. When opening it, close
  // any open config panel so the two never overlap on mobile.
  const togglePalette = useCallback(() => {
    setPaletteOpen((open) => !open)
    setConfigOpenMobile(false)
  }, [])

  const selectedTask = nodes.find((node) => selectedNodeIds.has(node.id))?.data.task ?? null

  return (
    <ReactFlowProvider>
      <div className={cn('flex h-full min-h-0 flex-col overflow-hidden', className)}>
        <div className="flex h-14 shrink-0 items-center justify-between gap-2 border-b px-3">
          <div className="flex min-w-0 items-center gap-2">{headerLeft}</div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button
              variant="outline"
              size="sm"
              className="md:hidden"
              onClick={togglePalette}
              aria-expanded={paletteOpen}
              aria-controls="task-palette-drawer"
            >
              <Box className="mr-1 h-4 w-4" aria-hidden="true" />
              Tasks
            </Button>
            {headerActions}
          </div>
        </div>

        {headerSecondary ? (
          <div className="shrink-0 border-b px-3 py-2">{headerSecondary}</div>
        ) : null}

        <div className="flex min-h-0 flex-1">
          <aside className="hidden w-56 shrink-0 border-r bg-surface md:block">
            <TaskPalette onAddTask={addTask} />
          </aside>

          <div className="relative min-w-0 flex-1">
            <WorkflowCanvas
              nodes={nodes}
              edges={edges}
              onNodesChange={onNodesChange as (changes: NodeChange<WorkflowGraphNode>[]) => void}
              onEdgesChange={onEdgesChange as (changes: EdgeChange<WorkflowGraphEdge>[]) => void}
              onConnect={handleConnect}
              onSelectionChange={handleSelectionChange}
              isValidConnection={isValidConnection}
              onDropTask={addTask}
            />

            {paletteOpen ? (
              <div className="absolute inset-0 z-30 flex md:hidden" id="task-palette-drawer">
                <div
                  className="absolute inset-0 bg-black/50"
                  onClick={() => setPaletteOpen(false)}
                  aria-hidden="true"
                />
                <div className="relative flex h-full w-64 shadow-xl">
                  <TaskPalette
                    className="w-full"
                    onAddTask={(type) => {
                      addTask(type)
                      setPaletteOpen(false)
                    }}
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="absolute right-2 top-2"
                    aria-label="Close task palette"
                    onClick={() => setPaletteOpen(false)}
                  >
                    <X className="h-4 w-4" aria-hidden="true" />
                  </Button>
                </div>
              </div>
            ) : null}

            <aside className="absolute inset-y-0 right-0 hidden w-80 shrink-0 border-l bg-surface md:block">
              <TaskConfigPanel
                task={selectedTask}
                onChange={(patch) => {
                  if (selectedTask) {
                    handleTaskChange(selectedTask.id, patch)
                  }
                }}
                onDelete={handleDeleteTask}
                onClose={() => {
                  setSelectedNodeIds(new Set())
                  setSelectedEdgeIds(new Set())
                  setConfigOpenMobile(false)
                }}
              />
            </aside>

            {configOpenMobile && selectedTask ? (
              <div className="absolute inset-0 z-30 flex md:hidden">
                <div
                  className="absolute inset-0 bg-black/50"
                  onClick={() => setConfigOpenMobile(false)}
                  aria-hidden="true"
                />
                <div className="relative ml-auto flex h-full w-full max-w-sm shadow-xl">
                  <TaskConfigPanel
                    task={selectedTask}
                    onChange={(patch) => handleTaskChange(selectedTask.id, patch)}
                    onDelete={() => {
                      handleDeleteTask()
                      setConfigOpenMobile(false)
                    }}
                    onClose={() => {
                      setSelectedNodeIds(new Set())
                      setSelectedEdgeIds(new Set())
                      setConfigOpenMobile(false)
                    }}
                  />
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </ReactFlowProvider>
  )
}
