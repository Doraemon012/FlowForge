import type { WorkflowTask } from '@/api/types'

const DEFINITION_INDENT = 2

/**
 * Serialize a workflow's tasks into the canonical structured definition text.
 * The shape matches the server's `WorkflowDefinition` exactly
 * (`{ "tasks": [ { "id", "type", "config", "depends_on" } ] }`), so the text
 * view and the graph view describe the same thing.
 */
export function formatDefinition(tasks: WorkflowTask[]): string {
  return JSON.stringify({ tasks: normalizeTasks(tasks) }, null, DEFINITION_INDENT)
}

function normalizeTasks(tasks: WorkflowTask[]): WorkflowTask[] {
  return tasks.map((task) => ({
    id: task.id,
    type: task.type,
    config: task.config ?? {},
    depends_on: task.depends_on ?? [],
  }))
}

export interface ParsedDefinition {
  tasks: WorkflowTask[]
  ok: true
}

export interface DefinitionParseFailure {
  error: string
  ok: false
}

export type DefinitionParseResult = ParsedDefinition | DefinitionParseFailure

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Parse and structurally check a definition written as JSON text.
 *
 * This is a fast, local check that mirrors the server's structural rules so the
 * user gets immediate feedback; the server remains the authority on the full
 * rule set (task-specific config, cycles, size limits) and is still consulted
 * before anything is published.
 */
export function parseDefinition(text: string): DefinitionParseResult {
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown error'
    return { ok: false, error: `Invalid JSON: ${message}` }
  }

  if (!isPlainObject(value)) {
    return { ok: false, error: 'The definition must be a JSON object like { "tasks": [ ... ] }.' }
  }
  if (!('tasks' in value)) {
    return { ok: false, error: 'The definition must include a "tasks" array.' }
  }
  const rawTasks = value.tasks
  if (!Array.isArray(rawTasks)) {
    return { ok: false, error: '"tasks" must be an array of task objects.' }
  }

  const tasks: WorkflowTask[] = []
  const seenIds = new Set<string>()
  for (let index = 0; index < rawTasks.length; index += 1) {
    const rawTask: unknown = rawTasks[index]
    const label = `tasks[${index}]`
    if (!isPlainObject(rawTask)) {
      return { ok: false, error: `${label} must be an object.` }
    }
    const id = rawTask.id
    if (typeof id !== 'string' || id.trim() === '') {
      return { ok: false, error: `${label}.id must be a non-empty string.` }
    }
    if (seenIds.has(id)) {
      return { ok: false, error: `Duplicate task id "${id}".` }
    }
    seenIds.add(id)

    const type = rawTask.type
    if (typeof type !== 'string' || type.trim() === '') {
      return { ok: false, error: `${label} ("${id}").type must be a non-empty string.` }
    }

    const config = rawTask.config ?? {}
    if (!isPlainObject(config)) {
      return { ok: false, error: `${label} ("${id}").config must be a JSON object.` }
    }

    let dependencies: string[] = []
    if (rawTask.depends_on !== undefined) {
      if (!Array.isArray(rawTask.depends_on)) {
        return { ok: false, error: `${label} ("${id}").depends_on must be an array of task ids.` }
      }
      for (const dependency of rawTask.depends_on) {
        if (typeof dependency !== 'string' || dependency.trim() === '') {
          return {
            ok: false,
            error: `${label} ("${id}").depends_on must contain non-empty task id strings.`,
          }
        }
      }
      dependencies = [...(rawTask.depends_on as string[])]
    }

    tasks.push({ id, type, config, depends_on: dependencies })
  }

  return { tasks, ok: true }
}
