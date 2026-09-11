import { describe, expect, it } from 'vitest'
import type { WorkflowDefinition, WorkflowTask } from '@/api/types'
import { diffDefinitions } from '@/lib/definition-diff'

function task(id: string, overrides: Partial<WorkflowTask> = {}): WorkflowTask {
  return { id, type: 'http', config: { url: 'https://example.com' }, depends_on: [], ...overrides }
}

function definition(...tasks: WorkflowTask[]): WorkflowDefinition {
  return { tasks }
}

describe('diffDefinitions', () => {
  it('reports no changes for identical definitions', () => {
    const value = definition(task('a'), task('b', { depends_on: ['a'] }))
    const diff = diffDefinitions(value, value)
    expect(diff.hasChanges).toBe(false)
    expect(diff.summary).toBe('No differences.')
    expect(diff.unchangedCount).toBe(2)
  })

  it('detects an added task', () => {
    const diff = diffDefinitions(definition(task('a')), definition(task('a'), task('b')))
    expect(diff.added.map((change) => change.taskId)).toEqual(['b'])
    expect(diff.removed).toHaveLength(0)
    expect(diff.changed).toHaveLength(0)
    expect(diff.summary).toBe('1 added')
  })

  it('detects a removed task', () => {
    const diff = diffDefinitions(definition(task('a'), task('b')), definition(task('a')))
    expect(diff.removed.map((change) => change.taskId)).toEqual(['b'])
    expect(diff.summary).toBe('1 removed')
  })

  it('detects a config change with before and after text', () => {
    const before = definition(task('a', { config: { url: 'https://old.example.com' } }))
    const after = definition(task('a', { config: { url: 'https://new.example.com' } }))
    const diff = diffDefinitions(before, after)
    expect(diff.changed).toHaveLength(1)
    const fields = diff.changed[0].fields
    expect(fields.map((field) => field.field)).toEqual(['config'])
    expect(fields[0].before).toContain('old.example.com')
    expect(fields[0].after).toContain('new.example.com')
  })

  it('treats reordered dependencies as unchanged', () => {
    const before = definition(
      task('a'),
      task('b'),
      task('c', { depends_on: ['a', 'b'] }),
    )
    const after = definition(
      task('a'),
      task('b'),
      task('c', { depends_on: ['b', 'a'] }),
    )
    expect(diffDefinitions(before, after).hasChanges).toBe(false)
  })

  it('detects a dependency change', () => {
    const before = definition(task('a'), task('b'), task('c', { depends_on: ['a'] }))
    const after = definition(task('a'), task('b'), task('c', { depends_on: ['a', 'b'] }))
    const diff = diffDefinitions(before, after)
    expect(diff.changed).toHaveLength(1)
    const dependencyField = diff.changed[0].fields.find((field) => field.field === 'depends_on')
    expect(dependencyField?.before).toBe('a')
    expect(dependencyField?.after).toBe('a, b')
  })

  it('detects a type change', () => {
    const before = definition(task('a', { type: 'http' }))
    const after = definition(task('a', { type: 'delay', config: { seconds: 1 } }))
    const diff = diffDefinitions(before, after)
    expect(diff.changed[0].fields.map((field) => field.field)).toEqual(['type', 'config'])
  })

  it('reports every task as added when there is no previous definition', () => {
    const diff = diffDefinitions(undefined, definition(task('a'), task('b')))
    expect(diff.added.map((change) => change.taskId)).toEqual(['a', 'b'])
    expect(diff.summary).toBe('2 added')
  })

  it('summarises a mixed diff', () => {
    const before = definition(task('a'), task('b'), task('c'))
    const after = definition(
      task('a', { config: { url: 'https://changed.example.com' } }),
      task('c'),
      task('d'),
    )
    const diff = diffDefinitions(before, after)
    expect(diff.added.map((change) => change.taskId)).toEqual(['d'])
    expect(diff.removed.map((change) => change.taskId)).toEqual(['b'])
    expect(diff.changed.map((change) => change.taskId)).toEqual(['a'])
    expect(diff.summary).toBe('1 added, 1 removed, 1 changed')
    expect(diff.unchangedCount).toBe(1)
  })
})
