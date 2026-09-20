import { useMemo } from 'react'
import { useLocation } from 'react-router-dom'

export type ProjectSection = 'overview' | 'workflows' | 'executions' | 'versions'

export interface RouteContext {
  projectId?: string
  workflowId?: string
  executionId?: string
  /** Which project-scoped page is open, if any. */
  section?: ProjectSection
  /** True when the route is inside a project, i.e. it has project context. */
  inProject: boolean
}

/**
 * Parses the current route into the ids and section the app chrome needs.
 *
 * TopBar, Sidebar and the command palette each used to re-derive these ids with
 * their own copy of the same segment scan, which is why their notions of "where
 * am I" could drift apart. One parser keeps them consistent.
 */
export function parseRoute(pathname: string): RouteContext {
  const segments = pathname.split('/').filter(Boolean)
  const projectIndex = segments.indexOf('projects')
  if (segments[0] !== 'app' || projectIndex === -1) {
    return { inProject: false }
  }

  const projectId = segments[projectIndex + 1]
  if (!projectId) {
    return { inProject: false }
  }

  const rest = segments.slice(projectIndex + 2)
  const sectionSegment = rest[0]
  let workflowId: string | undefined
  let executionId: string | undefined
  let section: ProjectSection = 'overview'

  if (sectionSegment === 'workflows') {
    section = 'workflows'
    if (rest[1] && rest[1] !== 'new') {
      workflowId = rest[1]
      if (rest[2] === 'versions') section = 'versions'
    }
  } else if (sectionSegment === 'executions') {
    section = 'executions'
    if (rest[1]) executionId = rest[1]
  }

  return { projectId, workflowId, executionId, section, inProject: true }
}

export function useRouteContext(): RouteContext {
  const { pathname } = useLocation()
  return useMemo(() => parseRoute(pathname), [pathname])
}
