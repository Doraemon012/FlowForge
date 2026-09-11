import type { TaskRun, WorkflowDefinition } from '@/api/types'

/**
 * Activity that indicates a task did not complete successfully and would stop
 * its downstream dependents. This mirrors the execution engine, which blocks a
 * task when a direct dependency is `failed` or `blocked`.
 */
const UNSUCCESSFUL_STATUSES = new Set(['failed', 'blocked'])

export interface FailedTask {
  taskId: string
  reason?: string
  /**
   * Direct upstream tasks that had already failed or been blocked before this
   * one ran. When this is empty the task failed on its own, which makes it the
   * origin of the failure rather than a knock-on effect.
   */
  poisonedBy: string[]
  /** True when nothing upstream had failed - this is where the run broke. */
  isRoot: boolean
}

export interface BlockedTask {
  taskId: string
  /**
   * Direct dependencies that **failed**, the immediate reason this task could
   * not run. Empty when the task was blocked only because a dependency was
   * itself blocked (no direct failure to point at) - the UI then reports that
   * it simply did not run.
   */
  blockedBy: string[]
}

export interface RunDiagnosis {
  /** Tasks that executed and failed, roots first. */
  failed: FailedTask[]
  /** Tasks the engine never ran because a dependency did not succeed. */
  blocked: BlockedTask[]
  /** Tasks in the definition that have no successful or failed run at all. */
  neverRan: string[]
  /** The originating failure, when there is one. */
  rootCause: FailedTask | null
  /** A plain-language summary, or null when there is nothing to explain. */
  summary: string | null
  /** True when there is anything worth surfacing to the user. */
  hasFindings: boolean
}

function plural(count: number, singular: string, pluralWord = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : pluralWord}`
}

function directDependencies(definition: WorkflowDefinition | undefined): Map<string, string[]> {
  const dependencies = new Map<string, string[]>()
  for (const task of definition?.tasks ?? []) {
    dependencies.set(task.id, task.depends_on ?? [])
  }
  return dependencies
}

/**
 * Explain why an execution failed by correlating its task runs with the
 * workflow definition's dependency graph.
 *
 * The engine marks a task `failed` when it ran and errored, and `blocked` when
 * a direct dependency had already failed or been blocked. This function turns
 * that flat list of task runs into a small causal picture: which task broke
 * first, what it took down with it, and what never ran. Everything is derived
 * from data the execution detail page already fetches - no extra API call.
 */
export function diagnoseRun(
  definition: WorkflowDefinition | undefined,
  taskRuns: TaskRun[],
): RunDiagnosis {
  const dependencies = directDependencies(definition)
  const runByTask = new Map<string, TaskRun>()
  for (const run of taskRuns) {
    runByTask.set(run.task_id, run)
  }

  const isUnsuccessful = (taskId: string): boolean => {
    const run = runByTask.get(taskId)
    return run != null && UNSUCCESSFUL_STATUSES.has(run.status)
  }

  const isFailed = (taskId: string): boolean => runByTask.get(taskId)?.status === 'failed'

  const unsuccessfulDependencies = (taskId: string): string[] =>
    (dependencies.get(taskId) ?? []).filter(isUnsuccessful)

  // A blocked task's immediate cause is a *failed* direct dependency. When its
  // dependency was itself only blocked, there is no direct failure to name.
  const failedDependencies = (taskId: string): string[] =>
    (dependencies.get(taskId) ?? []).filter(isFailed)

  const failed: FailedTask[] = []
  const blocked: BlockedTask[] = []
  const neverRan: string[] = []

  for (const run of taskRuns) {
    if (run.status === 'failed') {
      const poisonedBy = unsuccessfulDependencies(run.task_id)
      failed.push({
        taskId: run.task_id,
        reason: run.failure_reason,
        poisonedBy,
        isRoot: poisonedBy.length === 0,
      })
    } else if (run.status === 'blocked') {
      blocked.push({
        taskId: run.task_id,
        blockedBy: failedDependencies(run.task_id),
      })
    }
  }

  // Root failures first, then the rest, so the explanation reads top-down.
  failed.sort((a, b) => Number(b.isRoot) - Number(a.isRoot))
  // Blocked tasks with a known cause first; those we can explain lead.
  blocked.sort((a, b) => b.blockedBy.length - a.blockedBy.length)

  for (const task of definition?.tasks ?? []) {
    const run = runByTask.get(task.id)
    if (!run || run.status === 'pending') {
      neverRan.push(task.id)
    }
  }

  const rootCause = failed.find((task) => task.isRoot) ?? failed[0] ?? null

  let summary: string | null = null
  if (failed.length > 0 && blocked.length > 0) {
    summary = `Run failed: ${plural(failed.length, 'task')} failed and ${plural(
      blocked.length,
      'downstream task',
    )} never ran.`
  } else if (failed.length > 0) {
    summary = `Run failed: ${plural(failed.length, 'task')} failed.`
  } else if (blocked.length > 0) {
    summary = `Run stopped: ${plural(
      blocked.length,
      'task',
    )} could not run because an upstream dependency did not succeed.`
  }

  const hasFindings = failed.length > 0 || blocked.length > 0 || neverRan.length > 0

  return { failed, blocked, neverRan, rootCause, summary, hasFindings }
}
