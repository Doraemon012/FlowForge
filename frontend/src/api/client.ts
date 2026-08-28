import { authStore } from '@/lib/auth-store'
import { queryClient } from '@/lib/query-client'
import type { ApiErrorBody } from './types'

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? ''

export interface ApiErrorOptions {
  status: number
  code?: string
  message: string
  errors?: string[]
  isNetworkError?: boolean
}

export class ApiError extends Error {
  status: number
  code?: string
  errors?: string[]
  isNetworkError: boolean

  constructor(options: ApiErrorOptions) {
    super(options.message)
    this.name = 'ApiError'
    this.status = options.status
    this.code = options.code
    this.errors = options.errors
    this.isNetworkError = options.isNetworkError ?? false
  }
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE'
  body?: unknown
  auth?: boolean
  headers?: HeadersInit
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, auth = true, headers } = options

  const token = authStore.getSnapshot()?.token

  const requestHeaders = new Headers(headers)
  if (body !== undefined) {
    requestHeaders.set('Content-Type', 'application/json')
  }
  if (auth && token) {
    requestHeaders.set('Authorization', `Bearer ${token}`)
  }

  let response: Response

  try {
    response = await fetch(`${API_BASE}${path}`, {
      method,
      headers: requestHeaders,
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch {
    throw new ApiError({
      status: 0,
      message: 'Could not reach the server. Please check your connection and try again.',
      isNetworkError: true,
    })
  }

  if (!response.ok) {
    let errorBody: ApiErrorBody = {}
    try {
      errorBody = (await response.json()) as ApiErrorBody
    } catch {
      // Response body was not JSON.
    }

    if (auth && response.status === 401) {
      authStore.clear()
      queryClient.clear()
    }

    throw new ApiError({
      status: response.status,
      code: errorBody.code,
      message: errorBody.message || 'An unexpected error occurred.',
      errors: errorBody.errors,
    })
  }

  if (response.status === 204) {
    return undefined as T
  }

  try {
    return (await response.json()) as T
  } catch {
    return undefined as T
  }
}
