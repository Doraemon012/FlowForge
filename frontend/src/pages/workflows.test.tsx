import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { WorkflowsPage } from '@/pages/workflows'
import { useProject } from '@/hooks/use-projects'
import { useWorkflows } from '@/hooks/use-workflows'
import type { Project, Workflow } from '@/api/types'

vi.mock('@/hooks/use-projects', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/hooks/use-projects')>()
  return { ...actual, useProject: vi.fn() }
})
vi.mock('@/hooks/use-workflows', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/hooks/use-workflows')>()
  return {
    ...actual,
    useWorkflows: vi.fn(),
    useCreateWorkflow: vi.fn(() => ({
      mutateAsync: vi.fn().mockResolvedValue({}),
      isPending: false,
    })),
  }
})

const project: Project = {
  id: 'proj-1',
  owner_id: 'user-1',
  name: 'Alpha Project',
  status: 'active',
  created_at: '2024-01-15T00:00:00Z',
  updated_at: '2024-01-15T00:00:00Z',
}

const workflow: Workflow = {
  id: 'wf-1',
  project_id: 'proj-1',
  name: 'Deploy Pipeline',
  description: '',
  status: 'draft',
  draft_definition: { tasks: [] },
  created_at: '2024-01-15T00:00:00Z',
  updated_at: '2024-01-15T00:00:00Z',
}

function mockUseProject(overrides: Partial<ReturnType<typeof useProject>>) {
  vi.mocked(useProject).mockReturnValue({
    data: project,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
    ...overrides,
  } as ReturnType<typeof useProject>)
}

function mockUseWorkflows(overrides: Partial<ReturnType<typeof useWorkflows>>) {
  vi.mocked(useWorkflows).mockReturnValue({
    data: undefined,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
    ...overrides,
  } as ReturnType<typeof useWorkflows>)
}

function renderWithRouter(ui: React.ReactElement) {
  return render(
    <MemoryRouter initialEntries={['/app/projects/proj-1/workflows']}>
      <Routes>
        <Route path="/app/projects/:projectId/workflows" element={ui} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('WorkflowsPage', () => {
  it('renders the empty state when there are no workflows', () => {
    mockUseProject({})
    mockUseWorkflows({ data: [] })
    renderWithRouter(<WorkflowsPage />)
    expect(screen.getByText('No workflows yet')).toBeInTheDocument()
  })

  it('renders the error state when workflows fail to load', () => {
    mockUseProject({})
    mockUseWorkflows({ isError: true })
    renderWithRouter(<WorkflowsPage />)
    expect(screen.getByText("Couldn't load workflows")).toBeInTheDocument()
  })

  it('renders a loading state while workflows are fetching', () => {
    mockUseProject({})
    mockUseWorkflows({ isLoading: true })
    renderWithRouter(<WorkflowsPage />)
    expect(screen.getByRole('heading', { name: /workflows/i })).toBeInTheDocument()
    expect(screen.queryByText('No workflows yet')).not.toBeInTheDocument()
  })

  it('renders the workflows list', () => {
    const second: Workflow = { ...workflow, id: 'wf-2', name: 'Data Sync' }
    mockUseProject({})
    mockUseWorkflows({ data: [workflow, second] })
    renderWithRouter(<WorkflowsPage />)
    expect(screen.getByText('Deploy Pipeline')).toBeInTheDocument()
    expect(screen.getByText('Data Sync')).toBeInTheDocument()
  })
})
