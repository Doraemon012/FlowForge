import { useEffect } from 'react'
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { getMe } from '@/api/auth'
import { useAuth } from '@/hooks/use-auth'
import { authStore } from '@/lib/auth-store'

export function RequireAuth() {
  const { isAuthenticated, token, user } = useAuth()
  const location = useLocation()

  // Refresh the profile when it is missing details the UI relies on: the
  // display name (for the greeting) and the trial flag (for the trial
  // indicator). A session restored from storage before the trial feature
  // existed has no flag, so this backfills it from the server, which is the
  // authoritative source.
  const needsProfileRefresh =
    isAuthenticated && token && (!user?.displayName || user?.isTrial === undefined)

  useEffect(() => {
    if (needsProfileRefresh) {
      getMe()
        .then((me) => {
          authStore.setSession({
            token,
            user: {
              id: me.id,
              email: me.email,
              displayName: me.display_name,
              isTrial: me.is_trial,
            },
          })
        })
        .catch(() => {
          // Profile refresh failed; keep the existing session. The greeting
          // gracefully falls back to a generic placeholder until a refresh.
        })
    }
  }, [needsProfileRefresh, token])

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  return <Outlet />
}
