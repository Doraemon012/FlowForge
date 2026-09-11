import { useCallback } from 'react'
import { useSession } from '@/lib/auth-store'
import {
  login as apiLogin,
  register as apiRegister,
  startTrial as apiStartTrial,
  logout as apiLogout,
} from '@/api/auth'
import type { LoginInput, RegisterInput } from '@/api/auth'

export function useAuth() {
  const session = useSession()

  const login = useCallback(async (input: LoginInput) => {
    await apiLogin(input)
  }, [])

  const signup = useCallback(async (input: RegisterInput) => {
    await apiRegister(input)
  }, [])

  const startTrial = useCallback(async () => {
    await apiStartTrial()
  }, [])

  const logout = useCallback(() => {
    apiLogout()
  }, [])

  return {
    user: session?.user ?? null,
    token: session?.token ?? null,
    isAuthenticated: Boolean(session),
    /** True when the current session is a disposable public-trial account. */
    isTrial: Boolean(session?.user.isTrial),
    login,
    signup,
    startTrial,
    logout,
  }
}
