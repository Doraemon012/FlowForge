import { MarkerType } from '@xyflow/react'
import type { WorkflowTask } from '@/api/types'
import {
  getTaskTypeMeta,
  WORKFLOW_NODE_TYPE,
  type WorkflowGraphEdge,
  type WorkflowGraphNode,
  type WorkflowNodeData,
} from './types'

export function computePositions(tasks: WorkflowTask[]): Map<string, { x: number; y: number }> {
  const positions = new Map<string, { x: number; y: number }>()
  const taskById = new Map(tasks.map((task) => [task.id, task]))
  const depths = new Map<string, number>()
  const order: string[] = []

  const visit = (id: string, stack: Set<string>) => {
    if (depths.has(id)) return
    if (stack.has(id)) {
      depths.set(id, 0)
      return
    }
    stack.add(id)
    const task = taskById.get(id)
    const deps = task?.depends_on ?? []
    let depth = 0
    for (const dep of deps) {
      visit(dep, stack)
      depth = Math.max(depth, (depths.get(dep) ?? 0) + 1)
    }
    depths.set(id, depth)
    stack.delete(id)
    order.push(id)
  }

  for (const task of tasks) {
    visit(task.id, new Set())
  }

  const byDepth = new Map<number, string[]>()
  for (const id of order) {
    const depth = depths.get(id) ?? 0
    if (!byDepth.has(depth)) {
      byDepth.set(depth, [])
    }
    byDepth.get(depth)!.push(id)
  }

  for (const [depth, ids] of byDepth.entries()) {
    ids.forEach((id, index) => {
      positions.set(id, { x: depth * 260, y: index * 150 })
    })
  }

  return positions
}

export function tasksToNodes(tasks: WorkflowTask[]): WorkflowGraphNode[] {
  const positions = computePositions(tasks)
  return tasks.map((task) => ({
    id: task.id,
    type: WORKFLOW_NODE_TYPE,
    position: positions.get(task.id) ?? { x: 0, y: 0 },
    data: {
      task,
      typeMeta: getTaskTypeMeta(task.type),
      validationErrors: [],
    } satisfies WorkflowNodeData,
  }))
}

export function tasksToEdges(tasks: WorkflowTask[]): WorkflowGraphEdge[] {
  const seen = new Set<string>()
  const edges: WorkflowGraphEdge[] = []
  for (const task of tasks) {
    for (const dep of task.depends_on ?? []) {
      const id = `${dep}->${task.id}`
      if (seen.has(id)) continue
      seen.add(id)
      edges.push({
        id,
        source: dep,
        target: task.id,
        markerEnd: { type: MarkerType.ArrowClosed },
      })
    }
  }
  return edges
}

export function graphToTasks(
  nodes: WorkflowGraphNode[],
  edges: WorkflowGraphEdge[],
): WorkflowTask[] {
  return nodes.map((node) => {
    const dependencyIds = edges
      .filter((edge) => edge.target === node.id)
      .map((edge) => edge.source)
    return {
      id: node.id,
      type: node.data.task.type,
      config: node.data.task.config,
      depends_on: dependencyIds,
    }
  })
}

export function createTaskNode(
  task: WorkflowTask,
  position: { x: number; y: number },
): WorkflowGraphNode {
  return {
    id: task.id,
    type: WORKFLOW_NODE_TYPE,
    position,
    data: {
      task,
      typeMeta: getTaskTypeMeta(task.type),
      validationErrors: [],
    } satisfies WorkflowNodeData,
  }
}

export function generateTaskId(nodes: WorkflowGraphNode[]): string {
  const used = new Set(nodes.map((node) => node.id))
  let index = 1
  while (used.has(`task-${index}`)) {
    index += 1
  }
  return `task-${index}`
}

export function doesConnectionCreateCycle(
  connection: { source: string | null | undefined; target: string | null | undefined },
  nodes: WorkflowGraphNode[],
  edges: WorkflowGraphEdge[],
): boolean {
  const { source, target } = connection
  if (!source || !target) return false
  if (source === target) return true

  const nodeIds = new Set(nodes.map((node) => node.id))
  if (!nodeIds.has(source) || !nodeIds.has(target)) return false

  const adjacency = new Map<string, string[]>()
  for (const edge of edges) {
    if (!adjacency.has(edge.source)) {
      adjacency.set(edge.source, [])
    }
    adjacency.get(edge.source)!.push(edge.target)
  }

  const visited = new Set<string>()
  const stack = [target]
  while (stack.length > 0) {
    const current = stack.pop()!
    if (current === source) return true
    if (visited.has(current)) continue
    visited.add(current)
    for (const next of adjacency.get(current) ?? []) {
      stack.push(next)
    }
  }
  return false
}

export function edgeExists(
  source: string,
  target: string,
  edges: WorkflowGraphEdge[],
): boolean {
  return edges.some((edge) => edge.source === source && edge.target === target)
}

export function taskIdFromValidationError(error: string): string | null {
  const patterns = [
    /duplicate task id:\s*([^\s]+)/,
    /unsupported task type for\s+([^\s]+):/,
    /task config is required:\s*([^\s]+)/,
    /task config must be a JSON object:\s*([^\s]+)/,
    /unknown dependency for\s+([^\s]+):/,
    /dependency cycle detected at task:\s*([^\s]+)/,
    /task cannot depend on itself:\s*([^\s]+)/,
  ]
  for (const pattern of patterns) {
    const match = error.match(pattern)
    if (match) return match[1]
  }
  return null
}

export function validationErrorsByTaskId(errors: string[]): Map<string, string[]> {
  const grouped = new Map<string, string[]>()
  for (const error of errors) {
    const taskId = taskIdFromValidationError(error)
    if (taskId) {
      if (!grouped.has(taskId)) {
        grouped.set(taskId, [])
      }
      grouped.get(taskId)!.push(error)
    }
  }
  return grouped
}

export function summarizeTaskConfig(task: WorkflowTask): string {
  const config = task.config ?? {}
  switch (task.type) {
    case 'http': {
      if (!config.url) return 'Not configured'
      const method = String(config.method ?? 'GET').toUpperCase()
      const base = `${method} ${config.url}`
      return config.credential ? `${base} · ${config.credential}` : base
    }
    case 'transform': {
      if (config.output != null && config.output !== '') {
        return `Output: ${JSON.stringify(config.output)}`
      }
      return 'Passthrough'
    }
    case 'delay':
      return config.seconds != null ? `Wait ${config.seconds}s` : 'Not configured'
    case 'conditional': {
      const field = config.field ? String(config.field) : ''
      const operator = config.operator ? String(config.operator) : 'equals'
      if (!field) return 'Not configured'
      if (operator === 'exists' || operator === 'truthy') {
        return `${field} ${operator}`
      }
      const comparison = operator === 'equals' || operator === 'not_equals' ? config.equals : config.value
      return `${field} ${operator} ${comparison ?? ''}`.trim()
    }
    case 'email': {
      if (!config.to) return 'Not configured'
      return `To ${String(config.to)}`
    }
    default:
      return 'Not configured'
  }
}
