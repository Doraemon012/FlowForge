import { authStore } from '@/lib/auth-store'
import { queryClient } from '@/lib/query-client'
import { apiRequest } from './client'
import type { AuthResponse } from './types'

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

  return response
}

export function logout() {
  authStore.clear()
  queryClient.clear()
}
