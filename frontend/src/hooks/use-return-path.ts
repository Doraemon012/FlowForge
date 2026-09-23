import { useLocation } from 'react-router-dom'

/**
 * The in-app path the visitor was heading for when a protected route turned
 * them away, recorded on the location by `RequireAuth`. Null when they opened a
 * sign-in page on their own.
 *
 * Both sign-in paths need this: the credentials form navigates to it after a
 * successful login, and the social buttons pass it to the API as `next` so the
 * provider round-trip lands on the same page. Reading it in one place keeps the
 * two from disagreeing.
 */
export function useReturnPath(): string | null {
  const location = useLocation()
  const from = (location.state as { from?: { pathname?: string } } | null)?.from?.pathname
  if (!from || !from.startsWith('/') || from.startsWith('//')) {
    return null
  }
  return from
}
