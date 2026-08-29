import { describe, expect, it } from 'vitest'
import type { WorkflowTask } from '@/api/types'
import {
  computePositions,
  doesConnectionCreateCycle,
  edgeExists,
  generateTaskId,
  graphToTasks,
  taskIdFromValidationError,
  tasksToEdges,
  tasksToNodes,
  validationErrorsByTaskId,
} from './graph-utils'
import type { WorkflowGraphNode, WorkflowGraphEdge } from './types'

function buildTasks(): WorkflowTask[] {
  return [
    { id: 'a', type: 'transform', config: { expression: 'x' }, depends_on: [] },
    { id: 'b', type: 'delay', config: { seconds: 5 }, depends_on: ['a'] },
    { id: 'c', type: 'http', config: { url: 'https://example.com' }, depends_on: ['a'] },
  ]
}

describe('tasksToNodes', () => {
  it('creates a node per task with type metadata and validation errors', () => {
    const tasks = buildTasks()
    const nodes = tasksToNodes(tasks)
    expect(nodes).toHaveLength(3)
    expect(nodes[0].id).toBe('a')
    expect(nodes[0].type).toBe('workflowTask')
    expect(nodes[0].data.task.type).toBe('transform')
    expect(nodes[0].data.validationErrors).toEqual([])
    expect(nodes[0].data.typeMeta.label).toBe('Transform')
  })

  it('assigns left-to-right layered positions based on dependencies', () => {
    const tasks = buildTasks()
    const positions = computePositions(tasks)
    const a = positions.get('a')!
    const b = positions.get('b')!
    const c = positions.get('c')!
    expect(b.x).toBeGreaterThan(a.x)
    expect(c.x).toBeGreaterThan(a.x)
    expect(b.x).toBe(c.x)
  })
})

describe('tasksToEdges', () => {
  it('creates directed edges for each dependency', () => {
    const edges = tasksToEdges(buildTasks())
    expect(edges).toHaveLength(2)
    expect(edges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ source: 'a', target: 'b' }),
        expect.objectContaining({ source: 'a', target: 'c' }),
      ]),
    )
  })

  it('does not duplicate edges for duplicate dependencies', () => {
    const tasks: WorkflowTask[] = [
      { id: 'a', type: 'http', config: {}, depends_on: ['b', 'b'] },
      { id: 'b', type: 'delay', config: {}, depends_on: [] },
    ]
    expect(tasksToEdges(tasks)).toHaveLength(1)
  })
})

describe('graphToTasks', () => {
  it('rebuilds tasks with depends_on derived from incoming edges', () => {
    const tasks = buildTasks()
    const nodes = tasksToNodes(tasks)
    const edges = tasksToEdges(tasks)
    const rebuilt = graphToTasks(nodes, edges)
    expect(rebuilt).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'b', depends_on: ['a'] }),
        expect.objectContaining({ id: 'c', depends_on: ['a'] }),
        expect.objectContaining({ id: 'a', depends_on: [] }),
      ]),
    )
  })
})

describe('doesConnectionCreateCycle', () => {
  function graph(): { nodes: WorkflowGraphNode[]; edges: WorkflowGraphEdge[] } {
    const tasks = buildTasks()
    return { nodes: tasksToNodes(tasks), edges: tasksToEdges(tasks) }
  }

  it('rejects self-connections', () => {
    const { nodes, edges } = graph()
    expect(doesConnectionCreateCycle({ source: 'a', target: 'a' }, nodes, edges)).toBe(true)
  })

  it('rejects a connection that would close a cycle', () => {
    const { nodes, edges } = graph()
    // b depends on a, so adding b -> a would create a cycle.
    expect(doesConnectionCreateCycle({ source: 'b', target: 'a' }, nodes, edges)).toBe(true)
  })

  it('allows a valid dependency between independent branches', () => {
    const { nodes, edges } = graph()
    // c and b both depend on a, so c -> b is a valid non-cyclic dependency.
    expect(doesConnectionCreateCycle({ source: 'c', target: 'b' }, nodes, edges)).toBe(false)
  })
})

describe('edgeExists', () => {
  it('detects existing edges', () => {
    const edges = tasksToEdges(buildTasks())
    expect(edgeExists('a', 'b', edges)).toBe(true)
    expect(edgeExists('b', 'a', edges)).toBe(false)
  })
})

describe('generateTaskId', () => {
  it('generates the next unused task-N id', () => {
    const nodes: WorkflowGraphNode[] = tasksToNodes([
      { id: 'task-1', type: 'http', config: {}, depends_on: [] },
      { id: 'custom', type: 'http', config: {}, depends_on: [] },
    ])
    expect(generateTaskId(nodes)).toBe('task-2')
  })
})

describe('validation error parsing', () => {
  it('extracts a task id from known error formats', () => {
    expect(taskIdFromValidationError('duplicate task id: a')).toBe('a')
    expect(taskIdFromValidationError('unsupported task type for a: unknown')).toBe('a')
    expect(taskIdFromValidationError('task config must be a JSON object: a')).toBe('a')
    expect(taskIdFromValidationError('dependency cycle detected at task: a')).toBe('a')
    expect(taskIdFromValidationError('unknown dependency for a: missing')).toBe('a')
    expect(taskIdFromValidationError('tasks must contain at least one task')).toBeNull()
  })

  it('groups errors by task id', () => {
    const grouped = validationErrorsByTaskId([
      'duplicate task id: a',
      'unsupported task type for a: unknown',
      'tasks must contain at least one task',
    ])
    expect(grouped.get('a')).toHaveLength(2)
    expect(grouped.get('breakfast')).toBeUndefined()
  })

  it('ignores errors that do not reference a task', () => {
    const grouped = validationErrorsByTaskId(['tasks must contain at least one task'])
    expect(grouped.size).toBe(0)
  })
})

describe('computePositions', () => {
  it('places independent tasks in the same column', () => {
    const positions = computePositions(buildTasks())
    // a has no dependencies, so it is at depth 0.
    expect(positions.get('a')!.x).toBe(0)
    // b and c both depend only on a, so they are at depth 1.
    expect(positions.get('b')!.x).toBe(260)
    expect(positions.get('c')!.x).toBe(260)
  })
})
