import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { ProjectOverviewPage } from '@/pages/project-overview'
import { useDeleteProject, useProject, useUpdateProject } from '@/hooks/use-projects'
import { useWorkflows } from '@/hooks/use-workflows'
import type { Project, Workflow } from '@/api/types'

vi.mock('@/hooks/use-projects', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/hooks/use-projects')>()
  return {
    ...actual,
    useProject: vi.fn(),
    useUpdateProject: vi.fn(),
    useDeleteProject: vi.fn(),
  }
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

function createMockMutation() {
  return {
    mutateAsync: vi.fn().mockResolvedValue(undefined),
    isPending: false,
  }
}

function mockProjectMutations() {
  vi.mocked(useUpdateProject).mockReturnValue(
    createMockMutation() as unknown as ReturnType<typeof useUpdateProject>,
  )
  vi.mocked(useDeleteProject).mockReturnValue(
    createMockMutation() as unknown as ReturnType<typeof useDeleteProject>,
  )
}

function renderWithRouter(ui: React.ReactElement) {
  return render(
    <MemoryRouter initialEntries={['/app/projects/proj-1']}>
      <Routes>
        <Route path="/app/projects/:projectId" element={ui} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('ProjectOverviewPage', () => {
  it('renders project details and an empty workflows state', () => {
    mockUseProject({})
    mockUseWorkflows({ data: [] })
    mockProjectMutations()
    renderWithRouter(<ProjectOverviewPage />)
    expect(screen.getByRole('heading', { name: /alpha project/i })).toBeInTheDocument()
    expect(screen.getByText('No workflows yet')).toBeInTheDocument()
  })

  it('renders the project rename and delete actions', () => {
    mockUseProject({})
    mockUseWorkflows({ data: [] })
    mockProjectMutations()
    renderWithRouter(<ProjectOverviewPage />)
    expect(screen.getByRole('button', { name: /rename/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^delete$/i })).toBeInTheDocument()
  })

  it('renders workflows within the project', () => {
    mockUseProject({})
    mockUseWorkflows({ data: [workflow] })
    mockProjectMutations()
    renderWithRouter(<ProjectOverviewPage />)
    expect(screen.getByText('Deploy Pipeline')).toBeInTheDocument()
    expect(screen.getByText('View all')).toBeInTheDocument()
  })

  it('renders the error state when the project cannot be loaded', () => {
    mockUseProject({ isError: true })
    mockUseWorkflows({})
    mockProjectMutations()
    renderWithRouter(<ProjectOverviewPage />)
    expect(screen.getByText("Couldn't load this project")).toBeInTheDocument()
  })
})
