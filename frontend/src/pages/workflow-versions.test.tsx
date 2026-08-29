import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { WorkflowVersionsPage } from '@/pages/workflow-versions'
import {
  useActivateWorkflowVersion,
  useDeactivateWorkflow,
  useListVersions,
  useWorkflow,
} from '@/hooks/use-workflows'
import type { Workflow, WorkflowVersion } from '@/api/types'

vi.mock('@/hooks/use-workflows', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/hooks/use-workflows')>()
  return {
    ...actual,
    useWorkflow: vi.fn(),
    useListVersions: vi.fn(),
    useActivateWorkflowVersion: vi.fn(),
    useDeactivateWorkflow: vi.fn(),
  }
})

function createMockMutation() {
  return {
    mutateAsync: vi.fn().mockResolvedValue(undefined),
    isPending: false,
  }
}

const workflow: Workflow = {
  id: 'wf-1',
  project_id: 'proj-1',
  name: 'Deploy Pipeline',
  description: '',
  status: 'active',
  draft_definition: { tasks: [] },
  active_version_id: 'v-2',
  created_at: '2024-01-15T00:00:00Z',
  updated_at: '2024-01-15T00:00:00Z',
}

const version1: WorkflowVersion = {
  id: 'v-1',
  workflow_id: 'wf-1',
  version_number: 1,
  definition: { tasks: [] },
  created_at: '2024-01-15T00:00:00Z',
}

const version2: WorkflowVersion = {
  id: 'v-2',
  workflow_id: 'wf-1',
  version_number: 2,
  definition: { tasks: [] },
  created_at: '2024-01-16T00:00:00Z',
}

function mockUseWorkflow(overrides: Partial<ReturnType<typeof useWorkflow>> = {}) {
  vi.mocked(useWorkflow).mockReturnValue({
    data: workflow,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
    ...overrides,
  } as unknown as ReturnType<typeof useWorkflow>)
}

function mockMutations() {
  vi.mocked(useActivateWorkflowVersion).mockReturnValue(
    createMockMutation() as unknown as ReturnType<typeof useActivateWorkflowVersion>,
  )
  vi.mocked(useDeactivateWorkflow).mockReturnValue(
    createMockMutation() as unknown as ReturnType<typeof useDeactivateWorkflow>,
  )
}

function renderWithRouter(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/app/projects/proj-1/workflows/wf-1/versions']}>
        <Routes>
          <Route
            path="/app/projects/:projectId/workflows/:workflowId/versions"
            element={ui}
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('WorkflowVersionsPage', () => {
  it('renders the empty state when there are no versions', () => {
    mockUseWorkflow()
    vi.mocked(useListVersions).mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useListVersions>)
    mockMutations()
    renderWithRouter(<WorkflowVersionsPage />)
    expect(screen.getByText('No versions yet')).toBeInTheDocument()
  })

  it('renders published versions with activate actions', () => {
    mockUseWorkflow()
    vi.mocked(useListVersions).mockReturnValue({
      data: [version1, version2],
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useListVersions>)
    mockMutations()
    renderWithRouter(<WorkflowVersionsPage />)
    expect(screen.getByText('Version 1')).toBeInTheDocument()
    expect(screen.getByText('Version 2')).toBeInTheDocument()
    expect(screen.getByText('Active')).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: /^activate$/i })).toHaveLength(1)
    expect(screen.getAllByRole('button', { name: /^inspect$/i })).toHaveLength(2)
  })

  it('renders a deactivate button when an active version is set', () => {
    mockUseWorkflow()
    vi.mocked(useListVersions).mockReturnValue({
      data: [version1, version2],
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useListVersions>)
    mockMutations()
    renderWithRouter(<WorkflowVersionsPage />)
    expect(
      screen.getByRole('button', { name: /deactivate workflow/i }),
    ).toBeInTheDocument()
  })
})
