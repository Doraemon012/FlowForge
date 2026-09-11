import type { WorkflowTask } from '@/api/types'

/**
 * A plain-language structural model of a workflow: which tasks start it, which
 * finish it, and which stages of the graph run in parallel.
 *
 * This exists to answer "what does this workflow actually do?" without reading
 * every task config - the graph shows shape, this explains order and
 * concurrency. It is derived entirely from `depends_on`, so it stays honest for
 * any definition the server accepts.
 */
export interface WorkflowStage {
  /** 1-based index. Tasks within one stage have no dependency on each other. */
  index: number
  taskIds: string[]
}

export interface UnknownDependency {
  taskId: string
  dependencyId: string
}

export interface WorkflowOverview {
  taskCount: number
  /** Tasks with no dependencies - the workflow starts from these. */
  entryTaskIds: string[]
  /** Tasks nothing else depends on - the workflow ends at these. */
  terminalTaskIds: string[]
  /** Topological stages; a task appears in every stage after all its deps. */
  stages: WorkflowStage[]
  /** The widest stage - the maximum number of tasks that can run at once. */
  maxParallelism: number
  /** Tasks that neither depend on nor are depended on by anything. */
  isolatedTaskIds: string[]
  /** Dependencies that name a task that does not exist in this definition. */
  unknownDependencies: UnknownDependency[]
  /** True when dependencies form a loop, so a stage order cannot be produced. */
  hasCycle: boolean
}

const EMPTY_OVERVIEW: WorkflowOverview = {
  taskCount: 0,
  entryTaskIds: [],
  terminalTaskIds: [],
  stages: [],
  maxParallelism: 0,
  isolatedTaskIds: [],
  unknownDependencies: [],
  hasCycle: false,
}

function declaredDependencies(task: WorkflowTask): string[] {
  return task.depends_on ?? []
}

/**
 * Order tasks into stages. A task joins the first stage after all of its
 * *known* dependencies have been placed. Unknown dependencies are ignored for
 * ordering (they are reported separately) so one bad reference cannot hide the
 * rest of the structure. Tasks left unplaced at the end form a cycle.
 */
function computeStages(
  tasks: WorkflowTask[],
  knownIds: Set<string>,
): { stages: WorkflowStage[]; hasCycle: boolean } {
  const remainingDeps = new Map<string, Set<string>>()
  for (const task of tasks) {
    const deps = declaredDependencies(task).filter((id) => knownIds.has(id) && id !== task.id)
    remainingDeps.set(task.id, new Set(deps))
  }

  const stages: WorkflowStage[] = []
  const placed = new Set<string>()
  let index = 1

  for (;;) {
    const ready = tasks
      .map((task) => task.id)
      .filter((id) => !placed.has(id) && remainingDeps.get(id)!.size === 0)
    if (ready.length === 0) break
    for (const id of ready) placed.add(id)
    stages.push({ index, taskIds: ready })
    for (const deps of remainingDeps.values()) {
      for (const id of ready) deps.delete(id)
    }
    index += 1
  }

  return { stages, hasCycle: placed.size < tasks.length }
}

/**
 * Build the overview for a definition. Empty input yields an empty overview;
 * duplicate task ids are collapsed to one entry so the counts stay truthful.
 */
export function buildWorkflowOverview(tasks: WorkflowTask[]): WorkflowOverview {
  if (tasks.length === 0) return EMPTY_OVERVIEW

  const seen = new Set<string>()
  const uniqueTasks: WorkflowTask[] = []
  for (const task of tasks) {
    if (seen.has(task.id)) continue
    seen.add(task.id)
    uniqueTasks.push(task)
  }

  const knownIds = new Set(uniqueTasks.map((task) => task.id))

  const dependedUpon = new Set<string>()
  const unknownDependencies: UnknownDependency[] = []
  for (const task of uniqueTasks) {
    for (const dependencyId of declaredDependencies(task)) {
      if (dependencyId === task.id) continue
      if (knownIds.has(dependencyId)) {
        dependedUpon.add(dependencyId)
      } else {
        unknownDependencies.push({ taskId: task.id, dependencyId })
      }
    }
  }

  const entryTaskIds = uniqueTasks
    .filter((task) => declaredDependencies(task).length === 0)
    .map((task) => task.id)
  const terminalTaskIds = uniqueTasks
    .filter((task) => !dependedUpon.has(task.id))
    .map((task) => task.id)
  const isolatedTaskIds = uniqueTasks
    .filter(
      (task) =>
        declaredDependencies(task).length === 0 && !dependedUpon.has(task.id),
    )
    .map((task) => task.id)

  const { stages, hasCycle } = computeStages(uniqueTasks, knownIds)
  const maxParallelism = stages.reduce((max, stage) => Math.max(max, stage.taskIds.length), 0)

  return {
    taskCount: uniqueTasks.length,
    entryTaskIds,
    terminalTaskIds,
    stages,
    maxParallelism,
    isolatedTaskIds,
    unknownDependencies,
    hasCycle,
  }
}
