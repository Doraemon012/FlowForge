import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, expect, it, vi } from 'vitest'
import { ProjectsPage } from '@/pages/projects'
import { useProjects } from '@/hooks/use-projects'
import type { Project } from '@/api/types'

vi.mock('@/hooks/use-projects', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/hooks/use-projects')>()
  return { ...actual, useProjects: vi.fn() }
})

const project: Project = {
  id: 'proj-1',
  owner_id: 'user-1',
  name: 'Alpha Project',
  status: 'active',
  created_at: '2024-01-15T00:00:00Z',
  updated_at: '2024-01-15T00:00:00Z',
}

function mockUseProjects(overrides: Partial<ReturnType<typeof useProjects>>) {
  vi.mocked(useProjects).mockReturnValue({
    data: undefined,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
    ...overrides,
  } as ReturnType<typeof useProjects>)
}

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <ProjectsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('ProjectsPage', () => {
  it('renders the page header', () => {
    mockUseProjects({ data: [] })
    renderPage()
    expect(screen.getByRole('heading', { level: 1, name: 'Projects' })).toBeInTheDocument()
  })

  it('renders a loading state while fetching projects', () => {
    mockUseProjects({ isLoading: true })
    renderPage()
    expect(screen.getByRole('heading', { level: 1, name: 'Projects' })).toBeInTheDocument()
    expect(screen.queryByText('No projects yet')).not.toBeInTheDocument()
    expect(screen.queryByText("Couldn't load your projects")).not.toBeInTheDocument()
  })

  it('renders the empty state when there are no projects', () => {
    mockUseProjects({ data: [] })
    renderPage()
    expect(screen.getByText('No projects yet')).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: /create project/i })).toHaveLength(2)
  })

  it('renders the error state when fetching fails', () => {
    mockUseProjects({ isError: true })
    renderPage()
    expect(screen.getByText("Couldn't load your projects")).toBeInTheDocument()
  })

  it('renders project cards when projects are loaded', () => {
    const second: Project = { ...project, id: 'proj-2', name: 'Beta Project' }
    mockUseProjects({ data: [project, second] })
    renderPage()
    expect(screen.getByText('Alpha Project')).toBeInTheDocument()
    expect(screen.getByText('Beta Project')).toBeInTheDocument()
  })

  it('collects archived projects in their own section with a restore action', () => {
    const archived: Project = {
      ...project,
      id: 'proj-3',
      name: 'Gamma Project',
      status: 'archived',
    }
    mockUseProjects({ data: [project, archived] })
    renderPage()
    // The archived project stays visible - that is where it is restored from -
    // but it sits in its own section rather than among the working set.
    expect(screen.getByText('Alpha Project')).toBeInTheDocument()
    expect(screen.getByText('Gamma Project')).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 2, name: /archived/i })).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: /restore/i })).toHaveLength(1)
  })
})
