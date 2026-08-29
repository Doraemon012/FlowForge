import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, expect, it, vi } from 'vitest'
import type * as React from 'react'
import { ProjectForm } from '@/components/projects/ProjectForm'
import { createProject } from '@/api/projects'
import { ApiError } from '@/api/client'
import type { Project } from '@/api/types'

vi.mock('@/api/projects', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api/projects')>()
  return { ...actual, createProject: vi.fn() }
})

function renderWithQueryClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>)
}

describe('ProjectForm', () => {
  it('shows a validation error when the name is empty', async () => {
    const user = userEvent.setup()
    renderWithQueryClient(<ProjectForm />)
    await user.click(screen.getByRole('button', { name: /create project/i }))
    expect(await screen.findByText('Project name is required')).toBeInTheDocument()
  })

  it('creates a project and calls onSuccess with the created project', async () => {
    const user = userEvent.setup()
    const onSuccess = vi.fn()
    const created: Project = {
      id: 'proj-1',
      owner_id: 'user-1',
      name: 'My Project',
      status: 'active',
      created_at: '2024-01-15T00:00:00Z',
      updated_at: '2024-01-15T00:00:00Z',
    }
    vi.mocked(createProject).mockResolvedValue(created)
    renderWithQueryClient(<ProjectForm onSuccess={onSuccess} />)
    await user.type(screen.getByLabelText(/^name$/i), 'My Project')
    await user.click(screen.getByRole('button', { name: /create project/i }))
    await waitFor(() => expect(onSuccess).toHaveBeenCalledWith(created))
    expect(createProject).toHaveBeenCalledWith({ name: 'My Project' }, expect.anything())
  })

  it('shows a server error when creation fails', async () => {
    const user = userEvent.setup()
    vi.mocked(createProject).mockRejectedValue(
      new ApiError({
        status: 409,
        code: 'project_name_unavailable',
        message: 'project could not be created',
      }),
    )
    renderWithQueryClient(<ProjectForm />)
    await user.type(screen.getByLabelText(/^name$/i), 'Duplicate')
    await user.click(screen.getByRole('button', { name: /create project/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'A project with this name could not be created. Try a different name.',
    )
  })
})
