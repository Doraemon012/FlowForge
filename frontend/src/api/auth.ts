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
