/**
 * Which authoring surface the builder is showing. Kept in its own module so the
 * header and the layout can both reference it without importing each other.
 */
export type BuilderView = 'graph' | 'json'

/** An externally produced definition to load into the graph. */
export interface GraphSyncRequest {
  revision: number
  tasks: import('@/api/types').WorkflowTask[]
}
