import { useEffect, useRef } from 'react'
import { useBlocker } from 'react-router-dom'

export const UNSAVED_CHANGES_MESSAGE =
  'You have unsaved changes to this workflow. Leave and discard them?'

/**
 * Warn before the user leaves a screen that holds unsaved changes.
 *
 * Two loss paths are covered:
 *  1. A full document navigation - refresh, tab close, or an external link -
 *     is caught by `beforeunload`, which lets the browser show its native
 *     "leave site?" confirmation.
 *  2. Any in-app navigation - a `<Link>`, a `navigate()` call, or the browser
 *     Back/Forward buttons - is caught by React Router's `useBlocker`. This
 *     needs a data router (see `App.tsx`), which is why the app is wrapped in
 *     `createBrowserRouter`/`RouterProvider` rather than `<BrowserRouter>`.
 *     A capture-phase click interceptor cannot see Back/Forward, so the
 *     blocker replaced it: it is the only reliable way to protect those.
 *
 * `when` should be true only while there is work that would be lost.
 */
export function useUnsavedChangesGuard(when: boolean, message: string = UNSAVED_CHANGES_MESSAGE) {
  useEffect(() => {
    if (!when) return

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      // Both are needed for the native prompt across browsers: Chrome and Safari
      // honour preventDefault, Firefox honours returnValue.
      event.preventDefault()
      event.returnValue = ''
    }

    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [when])

  const blocker = useBlocker(when)
  // React may re-run an effect for the same blocked navigation (StrictMode in
  // development does this deliberately), so prompt at most once per block.
  const hasPrompted = useRef(false)

  useEffect(() => {
    if (blocker.state !== 'blocked') {
      hasPrompted.current = false
      return
    }
    if (hasPrompted.current) return
    hasPrompted.current = true

    if (window.confirm(message)) {
      blocker.proceed()
    } else {
      blocker.reset()
    }
  }, [blocker, message])
}
