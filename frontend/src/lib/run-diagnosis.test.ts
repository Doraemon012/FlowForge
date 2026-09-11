import { describe, expect, it } from 'vitest'
import type { TaskRun, WorkflowDefinition } from '@/api/types'
import { diagnoseRun } from '@/lib/run-diagnosis'

function run(task_id: string, status: string, failure_reason?: string): TaskRun {
  return {
    id: `${task_id}-run`,
    execution_id: 'exec-1',
    task_id,
    status,
    failure_reason,
    created_at: '2024-01-15T00:00:00Z',
  }
}

function definition(dependencies: Record<string, string[]>): WorkflowDefinition {
  return {
    tasks: Object.entries(dependencies).map(([id, depends_on]) => ({
      id,
      type: 'http',
      config: {},
      depends_on,
    })),
  }
}

describe('diagnoseRun', () => {
  it('identifies the root failure and the tasks it blocked', () => {
    const tasks = definition({ fetch: [], parse: ['fetch'], save: ['fetch'], report: ['save'] })
    const diagnosis = diagnoseRun(tasks, [
      run('fetch', 'failed', 'HTTP 500'),
      run('parse', 'blocked', 'dependency failed'),
      run('save', 'blocked', 'dependency failed'),
      run('report', 'blocked', 'dependency failed'),
    ])

    expect(diagnosis.rootCause?.taskId).toBe('fetch')
    expect(diagnosis.rootCause?.reason).toBe('HTTP 500')
    expect(diagnosis.failed.map((task) => task.taskId)).toEqual(['fetch'])
    expect(diagnosis.blocked.map((task) => task.taskId)).toEqual(['parse', 'save', 'report'])
    // parse and save depend directly on the failed task; report does not.
    expect(diagnosis.blocked.find((task) => task.taskId === 'parse')?.blockedBy).toEqual(['fetch'])
    expect(diagnosis.blocked.find((task) => task.taskId === 'report')?.blockedBy).toEqual([])
    expect(diagnosis.summary).toBe('Run failed: 1 task failed and 3 downstream tasks never ran.')
  })

  it('treats independent failures as multiple roots', () => {
    const tasks = definition({ a: [], b: [] })
    const diagnosis = diagnoseRun(tasks, [
      run('a', 'failed', 'boom'),
      run('b', 'failed', 'bang'),
    ])

    expect(diagnosis.failed).toHaveLength(2)
    expect(diagnosis.failed.every((task) => task.isRoot)).toBe(true)
    expect(diagnosis.rootCause?.taskId).toBe('a')
  })

  it('does not treat a failure with a failed dependency as the root', () => {
    const tasks = definition({ fetch: [], transform: ['fetch'] })
    const diagnosis = diagnoseRun(tasks, [
      run('fetch', 'failed', 'HTTP 500'),
      run('transform', 'failed', 'invalid input'),
    ])

    const transform = diagnosis.failed.find((task) => task.taskId === 'transform')
    expect(transform?.isRoot).toBe(false)
    expect(transform?.poisonedBy).toEqual(['fetch'])
    expect(diagnosis.rootCause?.taskId).toBe('fetch')
  })

  it('explains a run that stopped without a failed task', () => {
    const tasks = definition({ prepare: [], work: ['prepare'] })
    const diagnosis = diagnoseRun(tasks, [
      run('prepare', 'blocked', 'dependency failed'),
      run('work', 'blocked', 'dependency failed'),
    ])

    expect(diagnosis.failed).toHaveLength(0)
    expect(diagnosis.blocked).toHaveLength(2)
    expect(diagnosis.summary).toBe(
      'Run stopped: 2 tasks could not run because an upstream dependency did not succeed.',
    )
  })

  it('lists definition tasks that never ran', () => {
    const tasks = definition({ fetch: [], parse: [], save: ['parse'] })
    const diagnosis = diagnoseRun(tasks, [run('fetch', 'succeeded')])

    expect(diagnosis.neverRan).toEqual(['parse', 'save'])
  })

  it('reports nothing to explain for a successful run', () => {
    const tasks = definition({ fetch: [], parse: ['fetch'] })
    const diagnosis = diagnoseRun(tasks, [
      run('fetch', 'succeeded'),
      run('parse', 'succeeded'),
    ])

    expect(diagnosis.hasFindings).toBe(false)
    expect(diagnosis.summary).toBeNull()
    expect(diagnosis.rootCause).toBeNull()
  })

  it('still explains failures when the definition is unavailable', () => {
    const diagnosis = diagnoseRun(undefined, [run('fetch', 'failed', 'HTTP 500')])

    expect(diagnosis.failed).toHaveLength(1)
    expect(diagnosis.failed[0].isRoot).toBe(true)
    expect(diagnosis.blocked).toHaveLength(0)
  })
})
