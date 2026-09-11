import { authStore } from '@/lib/auth-store'
import { queryClient } from '@/lib/query-client'
import { apiRequest } from './client'
import type { AuthResponse, User } from './types'

export interface RegisterInput {
  email: string
  display_name: string
  password: string
}

export interface LoginInput {
  email: string
  password: string
}

/**
 * The label shown for a trial session in the shell. The server creates the
 * throwaway account with this same display name, so the UI and the server agree
 * without an extra request.
 */
export const TRIAL_DISPLAY_NAME = 'Trial workspace'

/**
 * Starts the public trial: the server provisions a disposable, isolated account
 * and returns a session for it, so no credentials are collected. The session is
 * marked as a trial so the shell can show the trial indicator and AI quota.
 *
 * This is the only way a trial session is created. The token it returns grants
 * no more authority than a normal one; it simply belongs to a throwaway
 * account that owns only its own data.
 */
export async function startTrial(): Promise<AuthResponse> {
  const response = await apiRequest<AuthResponse>('/api/v1/auth/trial', {
    method: 'POST',
    auth: false,
  })

  authStore.setSession({
    token: response.access_token,
    user: {
      id: response.user_id,
      displayName: TRIAL_DISPLAY_NAME,
      isTrial: true,
    },
  })

  return response
}

export async function register(input: RegisterInput): Promise<AuthResponse> {
  const response = await apiRequest<AuthResponse>('/api/v1/auth/register', {
    method: 'POST',
    body: input,
    auth: false,
  })

  authStore.setSession({
    token: response.access_token,
    user: {
      id: response.user_id,
      email: input.email,
      displayName: input.display_name,
      isTrial: false,
    },
  })

  return response
}

export async function login(input: LoginInput): Promise<AuthResponse> {
  const response = await apiRequest<AuthResponse>('/api/v1/auth/login', {
    method: 'POST',
    body: input,
    auth: false,
  })

  authStore.setSession({
    token: response.access_token,
    user: {
      id: response.user_id,
      email: input.email,
    },
  })

  // Fetch the user's profile so the UI can greet them by their real display
  // name instead of falling back to a generic placeholder.
  try {
    const me = await getMe()
    authStore.setSession({
      token: response.access_token,
      user: {
        id: me.id,
        email: me.email,
        displayName: me.display_name,
        isTrial: me.is_trial,
      },
    })
  } catch {
    // Profile fetch failed; keep the token-only session. The greeting will
    // gracefully fall back to a generic placeholder until a later refresh.
  }

  return response
}

export async function getMe(): Promise<User> {
  return apiRequest<User>('/api/v1/me')
}

export function logout() {
  authStore.clear()
  queryClient.clear()
}
