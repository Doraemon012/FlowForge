import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, render, waitFor } from '@testing-library/react'
import { RouterProvider, createMemoryRouter } from 'react-router-dom'
import { useUnsavedChangesGuard } from '@/hooks/use-unsaved-changes-guard'

const BUILDER = '/app/projects/1/workflows/1'
const LIST = '/app/projects/1/workflows'
const ELSEWHERE = '/elsewhere'

/**
 * `useBlocker` only works inside a data router, so the hook is mounted through
 * a real `createMemoryRouter` rather than a bare `renderHook`. The harness
 * renders the hook and nothing else; the URL is asserted on the router itself.
 */
function Harness({ when, message }: { when: boolean; message?: string }) {
  useUnsavedChangesGuard(when, message)
  return <div>builder</div>
}

function buildRouter(options: {
  when: boolean
  message?: string
  entries?: string[]
  initialIndex?: number
}) {
  const entries = options.entries ?? [BUILDER]
  return createMemoryRouter(
    [
      { path: BUILDER, element: <Harness when={options.when} message={options.message} /> },
      { path: LIST, element: <div>list</div> },
      { path: ELSEWHERE, element: <div>elsewhere</div> },
    ],
    {
      initialEntries: entries,
      initialIndex: options.initialIndex ?? entries.length - 1,
    },
  )
}

describe('useUnsavedChangesGuard', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('does not interfere when there is nothing to lose', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false)
    const router = buildRouter({ when: false })
    render(<RouterProvider router={router} />)

    act(() => {
      void router.navigate(ELSEWHERE)
    })

    await waitFor(() => expect(router.state.location.pathname).toBe(ELSEWHERE))
    expect(confirmSpy).not.toHaveBeenCalled()
  })

  it('prompts on refresh or tab close while dirty', () => {
    const router = buildRouter({ when: true })
    render(<RouterProvider router={router} />)

    const event = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(event)

    expect(event.defaultPrevented).toBe(true)
  })

  it('blocks an in-app navigation when the user cancels', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false)
    const router = buildRouter({ when: true, message: 'Leave?' })
    render(<RouterProvider router={router} />)

    act(() => {
      void router.navigate(ELSEWHERE)
    })

    await waitFor(() => expect(confirmSpy).toHaveBeenCalledWith('Leave?'))
    expect(router.state.location.pathname).toBe(BUILDER)
  })

  it('lets an in-app navigation through when the user confirms', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const router = buildRouter({ when: true })
    render(<RouterProvider router={router} />)

    act(() => {
      void router.navigate(ELSEWHERE)
    })

    await waitFor(() => expect(router.state.location.pathname).toBe(ELSEWHERE))
  })

  it('blocks the browser Back button when the user cancels', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false)
    const router = buildRouter({
      when: true,
      entries: [LIST, BUILDER],
      initialIndex: 1,
    })
    render(<RouterProvider router={router} />)

    act(() => {
      void router.navigate(-1)
    })

    await waitFor(() => expect(confirmSpy).toHaveBeenCalled())
    expect(router.state.location.pathname).toBe(BUILDER)
  })

  it('leaves the browser Back button when the user confirms', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const router = buildRouter({
      when: true,
      entries: [LIST, BUILDER],
      initialIndex: 1,
    })
    render(<RouterProvider router={router} />)

    act(() => {
      void router.navigate(-1)
    })

    await waitFor(() => expect(router.state.location.pathname).toBe(LIST))
  })
})
