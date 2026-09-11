import { describe, expect, it } from 'vitest'
import type { WorkflowTask } from '@/api/types'
import { parseDefinition } from '@/components/workflows/builder/definition-json'
import { WORKFLOW_TEMPLATES } from '@/lib/workflow-templates'

const SUPPORTED_TYPES = new Set(['http', 'transform', 'delay', 'conditional', 'email'])
const INDEXED_TEMPLATES = WORKFLOW_TEMPLATES.map((template, index) => [template.id, index] as const)

function tasksOf(templateIndex: number): WorkflowTask[] {
  const template = WORKFLOW_TEMPLATES[templateIndex]
  const parsed = parseDefinition(JSON.stringify(template.definition))
  if (!parsed.ok) {
    throw new Error(`template ${template.id} did not parse: ${parsed.error}`)
  }
  return parsed.tasks
}

describe('WORKFLOW_TEMPLATES', () => {
  it('ships several templates with unique ids and complete copy', () => {
    expect(WORKFLOW_TEMPLATES.length).toBeGreaterThanOrEqual(3)
    const ids = WORKFLOW_TEMPLATES.map((template) => template.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const template of WORKFLOW_TEMPLATES) {
      expect(template.name.trim().length).toBeGreaterThan(0)
      expect(template.summary.trim().length).toBeGreaterThan(0)
      expect(template.description.trim().length).toBeGreaterThan(0)
      expect(template.tags.length).toBeGreaterThan(0)
    }
  })

  it.each(INDEXED_TEMPLATES)('template %s is structurally valid', (_id, index) => {
    const tasks = tasksOf(index)
    expect(tasks.length).toBeGreaterThan(0)
    for (const task of tasks) {
      expect(SUPPORTED_TYPES.has(task.type)).toBe(true)
    }
  })

  it.each(INDEXED_TEMPLATES)('template %s has only known, non-self dependencies', (_id, index) => {
    const tasks = tasksOf(index)
    const ids = new Set(tasks.map((task) => task.id))
    for (const task of tasks) {
      for (const dependency of task.depends_on ?? []) {
        expect(ids.has(dependency)).toBe(true)
        expect(dependency).not.toBe(task.id)
      }
    }
  })

  it.each(INDEXED_TEMPLATES)('template %s is acyclic', (_id, index) => {
    const tasks = tasksOf(index)
    const byId = new Map(tasks.map((task) => [task.id, task]))
    const state = new Map<string, 'visiting' | 'done'>()
    const visit = (id: string): void => {
      if (state.get(id) === 'visiting') throw new Error(`cycle at ${id}`)
      if (state.get(id) === 'done') return
      state.set(id, 'visiting')
      for (const dependency of byId.get(id)?.depends_on ?? []) visit(dependency)
      state.set(id, 'done')
    }
    expect(() => tasks.forEach((task) => visit(task.id))).not.toThrow()
  })

  it.each(INDEXED_TEMPLATES)('template %s uses config the server accepts', (_id, index) => {
    for (const task of tasksOf(index)) {
      const config = (task.config ?? {}) as Record<string, unknown>
      if (task.type === 'http') {
        expect(String(config.url ?? '')).toMatch(/^https?:\/\//)
        expect(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']).toContain(
          String(config.method ?? 'GET').toUpperCase(),
        )
      }
      if (task.type === 'delay') {
        expect(typeof config.seconds).toBe('number')
        expect(Number(config.seconds)).toBeGreaterThanOrEqual(0)
      }
      if (task.type === 'conditional') {
        expect(String(config.field ?? '').trim().length).toBeGreaterThan(0)
        const operator = String(config.operator ?? 'equals')
        expect([
          'equals',
          'not_equals',
          'gt',
          'lt',
          'gte',
          'lte',
          'contains',
          'exists',
          'truthy',
        ]).toContain(operator)
        if (operator === 'equals' || operator === 'not_equals') {
          expect(config).toHaveProperty('equals')
        }
        if (['gt', 'lt', 'gte', 'lte', 'contains'].includes(operator)) {
          expect(config).toHaveProperty('value')
        }
      }
      if (task.type === 'email') {
        expect(String(config.to ?? '')).toContain('@')
        expect(String(config.subject ?? '').trim().length).toBeGreaterThan(0)
      }
    }
  })
})
