import { describe, expect, it } from 'vitest'
import { parseRoute } from './use-route-context'

describe('parseRoute', () => {
  it('reports no project context outside a project route', () => {
    expect(parseRoute('/app')).toEqual({ inProject: false })
    expect(parseRoute('/app/projects')).toEqual({ inProject: false })
    expect(parseRoute('/docs/architecture')).toEqual({ inProject: false })
    expect(parseRoute('/login')).toEqual({ inProject: false })
  })

  it('reads the project overview', () => {
    expect(parseRoute('/app/projects/proj-1')).toEqual({
      projectId: 'proj-1',
      section: 'overview',
      inProject: true,
    })
  })

  it('reads the workflows index without treating it as a workflow', () => {
    expect(parseRoute('/app/projects/proj-1/workflows')).toEqual({
      projectId: 'proj-1',
      section: 'workflows',
      inProject: true,
    })
  })

  it('does not mistake the new-workflow route for a workflow id', () => {
    expect(parseRoute('/app/projects/proj-1/workflows/new')).toEqual({
      projectId: 'proj-1',
      section: 'workflows',
      inProject: true,
    })
  })

  it('reads a workflow detail route', () => {
    expect(parseRoute('/app/projects/proj-1/workflows/wf-1')).toEqual({
      projectId: 'proj-1',
      workflowId: 'wf-1',
      section: 'workflows',
      inProject: true,
    })
  })

  it('promotes the versions sub-route to its own section', () => {
    expect(parseRoute('/app/projects/proj-1/workflows/wf-1/versions')).toEqual({
      projectId: 'proj-1',
      workflowId: 'wf-1',
      section: 'versions',
      inProject: true,
    })
  })

  it('reads the executions index and a single execution', () => {
    expect(parseRoute('/app/projects/proj-1/executions')).toEqual({
      projectId: 'proj-1',
      section: 'executions',
      inProject: true,
    })
    expect(parseRoute('/app/projects/proj-1/executions/exec-1')).toEqual({
      projectId: 'proj-1',
      executionId: 'exec-1',
      section: 'executions',
      inProject: true,
    })
  })

  it('ignores a trailing slash', () => {
    expect(parseRoute('/app/projects/proj-1/workflows/')).toEqual({
      projectId: 'proj-1',
      section: 'workflows',
      inProject: true,
    })
  })
})
