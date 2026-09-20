import { Fragment } from 'react'
import { Link } from 'react-router-dom'

export interface Crumb {
  label: string
  /** `null` for the current page, which is rendered as plain text. */
  path: string | null
}

interface BreadcrumbNames {
  projectName?: string
  workflowName?: string
  executionId?: string
}

/**
 * Builds the breadcrumb trail from the route plus whatever names the caller has
 * already resolved.
 *
 * The previous implementation walked the raw path segments, so `/app` rendered
 * as a crumb called "Overview" (duplicating the sidebar), the project and
 * workflow appeared as opaque ids until their queries resolved, and the current
 * page was rendered as a link to itself. This builds the trail from *meaning*
 * instead: `/app` contributes nothing, "Runs" is used for the executions route
 * rather than the raw segment, and the final crumb is always the current page
 * as plain text.
 */
export function buildBreadcrumbs(pathname: string, names: BreadcrumbNames = {}): Crumb[] {
  const segments = pathname.split('/').filter(Boolean)
  // Only `/app` routes produce crumbs; docs, auth and the landing page have no
  // meaningful hierarchy to show in the app chrome.
  if (segments[0] !== 'app') return []

  const projectIndex = segments.indexOf('projects')
  if (projectIndex === -1) return []

  const projectId = segments[projectIndex + 1]
  if (!projectId) {
    return [{ label: 'Projects', path: null }]
  }

  const projectPath = `/app/projects/${projectId}`
  const projectName = names.projectName ?? 'Project'
  const crumbs: Crumb[] = [{ label: 'Projects', path: '/app/projects' }]
  const rest = segments.slice(projectIndex + 2)
  const section = rest[0]

  if (!section) {
    crumbs.push({ label: projectName, path: null })
    return crumbs
  }

  crumbs.push({ label: projectName, path: projectPath })

  if (section === 'workflows') {
    const workflowId = rest[1]
    if (!workflowId) {
      crumbs.push({ label: 'Workflows', path: null })
      return crumbs
    }
    if (workflowId === 'new') {
      crumbs.push({ label: 'Workflows', path: `${projectPath}/workflows` })
      crumbs.push({ label: 'New workflow', path: null })
      return crumbs
    }
    if (rest[2] === 'versions') {
      crumbs.push({
        label: names.workflowName ?? 'Workflow',
        path: `${projectPath}/workflows/${workflowId}`,
      })
      crumbs.push({ label: 'Versions', path: null })
      return crumbs
    }
    // The workflow detail page is its own last crumb; render it as current.
    crumbs.push({ label: names.workflowName ?? 'Workflow', path: null })
    return crumbs
  }

  if (section === 'executions') {
    const executionId = rest[1]
    if (!executionId) {
      crumbs.push({ label: 'Runs', path: null })
      return crumbs
    }
    crumbs.push({ label: 'Runs', path: `${projectPath}/executions` })
    crumbs.push({
      label: names.executionId ? `Run ${names.executionId.slice(0, 8)}` : 'Run',
      path: null,
    })
    return crumbs
  }

  return crumbs
}

interface BreadcrumbsProps {
  pathname: string
  projectName?: string
  workflowName?: string
  executionId?: string
}

export function Breadcrumbs({
  pathname,
  projectName,
  workflowName,
  executionId,
}: BreadcrumbsProps) {
  const crumbs = buildBreadcrumbs(pathname, { projectName, workflowName, executionId })

  if (crumbs.length === 0) return null

  return (
    <nav className="crumbs" aria-label="Breadcrumb">
      <ol className="flex min-w-0 items-center gap-1.5">
        {crumbs.map((crumb, index) => (
          <Fragment key={`${crumb.label}-${index}`}>
            {index > 0 ? (
              <span className="sep" aria-hidden="true">
                /
              </span>
            ) : null}
            <li className="min-w-0">
              {crumb.path ? (
                <Link to={crumb.path}>{crumb.label}</Link>
              ) : (
                <span className="cur" aria-current="page">
                  {crumb.label}
                </span>
              )}
            </li>
          </Fragment>
        ))}
      </ol>
    </nav>
  )
}
