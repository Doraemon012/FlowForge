import type { WorkflowDefinition, WorkflowTask } from '@/api/types'

/**
 * A structural comparison between two workflow definitions. It answers the
 * question "what actually changed?" without making the reader eye-diff two
 * walls of JSON - which matters most when a change was produced by the AI
 * assistant or when reviewing what a published version changed.
 *
 * The comparison is by task id, which is the stable identity of a task across
 * edits. A task that exists in both definitions but differs in type, config, or
 * dependencies is reported as `changed` with the specific fields that moved.
 */

export type TaskChangeKind = 'added' | 'removed' | 'changed'

export interface FieldChange {
  field: 'type' | 'config' | 'depends_on'
  label: string
  before: string
  after: string
}

export interface TaskChange {
  taskId: string
  kind: TaskChangeKind
  before?: WorkflowTask
  after?: WorkflowTask
  /** Populated only for `changed` tasks - exactly which fields differ. */
  fields: FieldChange[]
}

export interface DefinitionDiff {
  added: TaskChange[]
  removed: TaskChange[]
  changed: TaskChange[]
  unchangedCount: number
  hasChanges: boolean
  summary: string
}

/** Order-insensitive, key-sorted JSON so equal values compare equal. */
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`
  const record = value as Record<string, unknown>
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
    .join(',')}}`
}

function prettyConfig(config: unknown): string {
  const normalised = config ?? {}
  return JSON.stringify(normalised, Object.keys(normalised as Record<string, unknown>).sort(), 2)
}

function sortedDependencies(task: WorkflowTask): string[] {
  return [...(task.depends_on ?? [])].sort()
}

function changedFields(before: WorkflowTask, after: WorkflowTask): FieldChange[] {
  const fields: FieldChange[] = []
  if (before.type !== after.type) {
    fields.push({ field: 'type', label: 'Type', before: before.type, after: after.type })
  }
  if (stableStringify(before.config ?? {}) !== stableStringify(after.config ?? {})) {
    fields.push({
      field: 'config',
      label: 'Config',
      before: prettyConfig(before.config),
      after: prettyConfig(after.config),
    })
  }
  const beforeDeps = sortedDependencies(before)
  const afterDeps = sortedDependencies(after)
  if (beforeDeps.join('\n') !== afterDeps.join('\n')) {
    fields.push({
      field: 'depends_on',
      label: 'Dependencies',
      before: beforeDeps.length > 0 ? beforeDeps.join(', ') : '(none)',
      after: afterDeps.length > 0 ? afterDeps.join(', ') : '(none)',
    })
  }
  return fields
}

function describeSummary(
  added: number,
  removed: number,
  changed: number,
): string {
  const parts: string[] = []
  if (added > 0) parts.push(`${added} added`)
  if (removed > 0) parts.push(`${removed} removed`)
  if (changed > 0) parts.push(`${changed} changed`)
  if (parts.length === 0) return 'No differences.'
  return parts.join(', ')
}

/**
 * Diff two definitions from `before` to `after`. Passing `undefined` for
 * `before` (e.g. the first published version) reports every task as added.
 */
export function diffDefinitions(
  before: WorkflowDefinition | undefined,
  after: WorkflowDefinition | undefined,
): DefinitionDiff {
  const beforeTasks = before?.tasks ?? []
  const afterTasks = after?.tasks ?? []
  const beforeById = new Map(beforeTasks.map((task) => [task.id, task]))
  const afterById = new Map(afterTasks.map((task) => [task.id, task]))

  const added: TaskChange[] = []
  const removed: TaskChange[] = []
  const changed: TaskChange[] = []
  let unchangedCount = 0

  for (const task of afterTasks) {
    if (!beforeById.has(task.id)) {
      added.push({ taskId: task.id, kind: 'added', after: task, fields: [] })
    }
  }
  for (const task of beforeTasks) {
    if (!afterById.has(task.id)) {
      removed.push({ taskId: task.id, kind: 'removed', before: task, fields: [] })
    }
  }
  for (const task of afterTasks) {
    const previous = beforeById.get(task.id)
    if (!previous) continue
    const fields = changedFields(previous, task)
    if (fields.length > 0) {
      changed.push({ taskId: task.id, kind: 'changed', before: previous, after: task, fields })
    } else {
      unchangedCount += 1
    }
  }

  return {
    added,
    removed,
    changed,
    unchangedCount,
    hasChanges: added.length > 0 || removed.length > 0 || changed.length > 0,
    summary: describeSummary(added.length, removed.length, changed.length),
  }
}
