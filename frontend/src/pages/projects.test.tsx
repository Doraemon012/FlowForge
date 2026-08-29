import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
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

describe('ProjectsPage', () => {
  it('renders the page header', () => {
    mockUseProjects({ data: [] })
    render(
      <MemoryRouter>
        <ProjectsPage />
      </MemoryRouter>,
    )
    expect(screen.getByRole('heading', { level: 1, name: 'Projects' })).toBeInTheDocument()
  })

  it('renders a loading state while fetching projects', () => {
    mockUseProjects({ isLoading: true })
    render(
      <MemoryRouter>
        <ProjectsPage />
      </MemoryRouter>,
    )
    expect(screen.getByRole('heading', { level: 1, name: 'Projects' })).toBeInTheDocument()
    expect(screen.queryByText('No projects yet')).not.toBeInTheDocument()
    expect(screen.queryByText("Couldn't load your projects")).not.toBeInTheDocument()
  })

  it('renders the empty state when there are no projects', () => {
    mockUseProjects({ data: [] })
    render(
      <MemoryRouter>
        <ProjectsPage />
      </MemoryRouter>,
    )
    expect(screen.getByText('No projects yet')).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: /create project/i })).toHaveLength(2)
  })

  it('renders the error state when fetching fails', () => {
    mockUseProjects({ isError: true })
    render(
      <MemoryRouter>
        <ProjectsPage />
      </MemoryRouter>,
    )
    expect(screen.getByText("Couldn't load your projects")).toBeInTheDocument()
  })

  it('renders project cards when projects are loaded', () => {
    const second: Project = { ...project, id: 'proj-2', name: 'Beta Project' }
    mockUseProjects({ data: [project, second] })
    render(
      <MemoryRouter>
        <ProjectsPage />
      </MemoryRouter>,
    )
    expect(screen.getByText('Alpha Project')).toBeInTheDocument()
    expect(screen.getByText('Beta Project')).toBeInTheDocument()
  })
})
