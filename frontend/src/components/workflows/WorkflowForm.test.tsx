import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, expect, it, vi } from 'vitest'
import type * as React from 'react'
import { WorkflowForm } from '@/components/workflows/WorkflowForm'
import { createWorkflow } from '@/api/workflows'
import { ApiError } from '@/api/client'
import type { Workflow } from '@/api/types'

vi.mock('@/api/workflows', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api/workflows')>()
  return { ...actual, createWorkflow: vi.fn() }
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

describe('WorkflowForm', () => {
  it('shows a validation error when the name is empty', async () => {
    const user = userEvent.setup()
    renderWithQueryClient(<WorkflowForm projectId="proj-1" />)
    await user.click(screen.getByRole('button', { name: /create workflow/i }))
    expect(await screen.findByText('Workflow name is required')).toBeInTheDocument()
  })

  it('creates a workflow and calls onSuccess with the created workflow', async () => {
    const user = userEvent.setup()
    const onSuccess = vi.fn()
    const created: Workflow = {
      id: 'wf-1',
      project_id: 'proj-1',
      name: 'My Workflow',
      description: 'A description',
      status: 'draft',
      draft_definition: { tasks: [] },
      created_at: '2024-01-15T00:00:00Z',
      updated_at: '2024-01-15T00:00:00Z',
    }
    vi.mocked(createWorkflow).mockResolvedValue(created)
    renderWithQueryClient(<WorkflowForm projectId="proj-1" onSuccess={onSuccess} />)
    await user.type(screen.getByLabelText(/^name$/i), 'My Workflow')
    await user.type(screen.getByLabelText(/^description$/i), 'A description')
    await user.click(screen.getByRole('button', { name: /create workflow/i }))
    await waitFor(() => expect(onSuccess).toHaveBeenCalledWith(created))
    expect(createWorkflow).toHaveBeenCalledWith('proj-1', {
      name: 'My Workflow',
      description: 'A description',
    })
  })

  it('shows a server error when creation fails', async () => {
    const user = userEvent.setup()
    vi.mocked(createWorkflow).mockRejectedValue(
      new ApiError({ status: 500, message: 'workflow could not be created' }),
    )
    renderWithQueryClient(<WorkflowForm projectId="proj-1" />)
    await user.type(screen.getByLabelText(/^name$/i), 'Bad')
    await user.click(screen.getByRole('button', { name: /create workflow/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'workflow could not be created',
    )
  })
})
