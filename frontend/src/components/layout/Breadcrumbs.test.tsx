import { describe, expect, it } from 'vitest'
import { buildBreadcrumbs } from './Breadcrumbs'

describe('buildBreadcrumbs', () => {
  it('renders nothing outside /app routes', () => {
    expect(buildBreadcrumbs('/')).toEqual([])
    expect(buildBreadcrumbs('/login')).toEqual([])
    expect(buildBreadcrumbs('/docs/architecture')).toEqual([])
  })

  it('produces no crumb for the workspace root', () => {
    // `/app` is the dashboard; the sidebar already says "Overview", so the
    // trail must not repeat it.
    expect(buildBreadcrumbs('/app')).toEqual([])
  })

  it('treats the projects index as the current page', () => {
    expect(buildBreadcrumbs('/app/projects')).toEqual([
      { label: 'Projects', path: null },
    ])
  })

  it('names the project from the resolved query instead of the id', () => {
    expect(buildBreadcrumbs('/app/projects/proj-1', { projectName: 'Alpha' })).toEqual([
      { label: 'Projects', path: '/app/projects' },
      { label: 'Alpha', path: null },
    ])
  })

  it('falls back to a placeholder while the project name is unresolved', () => {
    expect(buildBreadcrumbs('/app/projects/proj-1')).toEqual([
      { label: 'Projects', path: '/app/projects' },
      { label: 'Project', path: null },
    ])
  })

  it('links the project and makes the workflow the current page', () => {
    expect(
      buildBreadcrumbs('/app/projects/proj-1/workflows/wf-1', {
        projectName: 'Alpha',
        workflowName: 'Deploy',
      }),
    ).toEqual([
      { label: 'Projects', path: '/app/projects' },
      { label: 'Alpha', path: '/app/projects/proj-1' },
      { label: 'Deploy', path: null },
    ])
  })

  it('inserts a Versions crumb and keeps the workflow navigable', () => {
    expect(
      buildBreadcrumbs('/app/projects/proj-1/workflows/wf-1/versions', {
        projectName: 'Alpha',
        workflowName: 'Deploy',
      }),
    ).toEqual([
      { label: 'Projects', path: '/app/projects' },
      { label: 'Alpha', path: '/app/projects/proj-1' },
      { label: 'Deploy', path: '/app/projects/proj-1/workflows/wf-1' },
      { label: 'Versions', path: null },
    ])
  })

  it('labels the executions route Runs rather than echoing the segment', () => {
    expect(
      buildBreadcrumbs('/app/projects/proj-1/executions', { projectName: 'Alpha' }),
    ).toEqual([
      { label: 'Projects', path: '/app/projects' },
      { label: 'Alpha', path: '/app/projects/proj-1' },
      { label: 'Runs', path: null },
    ])
  })

  it('shortens a run id to its first eight characters', () => {
    const crumbs = buildBreadcrumbs('/app/projects/proj-1/executions/abcdef1234567890', {
      projectName: 'Alpha',
      executionId: 'abcdef1234567890',
    })
    expect(crumbs.at(-1)).toEqual({ label: 'Run abcdef12', path: null })
  })

  it('falls back to a generic Run label when the id is not resolved', () => {
    const crumbs = buildBreadcrumbs('/app/projects/proj-1/executions/exec-1')
    expect(crumbs.at(-1)).toEqual({ label: 'Run', path: null })
  })

  it('routes the new-workflow page between Workflows and the current crumb', () => {
    expect(
      buildBreadcrumbs('/app/projects/proj-1/workflows/new', { projectName: 'Alpha' }),
    ).toEqual([
      { label: 'Projects', path: '/app/projects' },
      { label: 'Alpha', path: '/app/projects/proj-1' },
      { label: 'Workflows', path: '/app/projects/proj-1/workflows' },
      { label: 'New workflow', path: null },
    ])
  })

  it('always marks exactly one crumb as the current page', () => {
    const paths = [
      '/app/projects/proj-1',
      '/app/projects/proj-1/workflows',
      '/app/projects/proj-1/workflows/wf-1',
      '/app/projects/proj-1/workflows/wf-1/versions',
      '/app/projects/proj-1/executions',
      '/app/projects/proj-1/executions/exec-1',
    ]
    for (const path of paths) {
      const crumbs = buildBreadcrumbs(path)
      expect(crumbs.filter((crumb) => crumb.path === null)).toHaveLength(1)
    }
  })
})
