import { useEffect } from 'react'
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { getMe } from '@/api/auth'
import { useAuth } from '@/hooks/use-auth'
import { authStore } from '@/lib/auth-store'

export function RequireAuth() {
  const { isAuthenticated, token, user } = useAuth()
  const location = useLocation()

  // If a session is restored from storage or the profile fetch failed during
  // login, refresh the profile so the UI can greet the user by their real
  // display name instead of falling back to a generic placeholder.
  useEffect(() => {
    if (isAuthenticated && token && !user?.displayName) {
      getMe()
        .then((me) => {
          authStore.setSession({
            token,
            user: { id: me.id, email: me.email, displayName: me.display_name },
          })
        })
        .catch(() => {
          // Profile refresh failed; keep the existing session. The greeting
          // gracefully falls back to a generic placeholder until a refresh.
        })
    }
  }, [isAuthenticated, token, user?.displayName])

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  return <Outlet />
}
