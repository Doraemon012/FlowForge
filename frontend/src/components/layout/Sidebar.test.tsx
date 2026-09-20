import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Sidebar } from './Sidebar'

/**
 * The FlowForge lockup is the product's identity, not a route inside the app,
 * so it leads to the landing page on every surface - the app shell included.
 * The landing page answers a signed-in visitor with "Open app", so following
 * the brand never strands anyone, and "Dashboard" below is the workspace home.
 *
 * This is pinned because the brand used to be reachable only from the TopBar
 * (at a width where that row is hidden) and was easy to repoint at `/app`.
 */
function renderSidebar(initialPath = '/app') {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialPath]}>
        <Sidebar />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('Sidebar brand', () => {
  it('leads to the landing page from the workspace home', () => {
    renderSidebar('/app')

    expect(screen.getByRole('link', { name: 'FlowForge home' })).toHaveAttribute('href', '/')
  })

  it('leads to the landing page from the projects index', () => {
    renderSidebar('/app/projects')

    expect(screen.getByRole('link', { name: 'FlowForge home' })).toHaveAttribute('href', '/')
  })

  it('keeps the workspace home on its own item instead of the brand', () => {
    renderSidebar('/app')

    expect(screen.getByRole('link', { name: 'FlowForge home' })).toHaveAttribute('href', '/')
    expect(screen.getByRole('link', { name: 'Dashboard' })).toHaveAttribute('href', '/app')
  })
})
