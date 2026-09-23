import { API_BASE, apiRequest } from './client'

/**
 * One social sign-in provider this deployment can authenticate against. The
 * list is read from the server rather than compiled into the client, so a
 * deployment that has no Google credentials simply never renders a Google
 * button.
 */
export interface OAuthProvider {
  /** Stable provider slug, and the path segment of the sign-in routes. */
  id: string
  /** Human label, e.g. "Google". Chosen by the server. */
  name: string
}

interface OAuthProvidersResponse {
  providers: OAuthProvider[] | null
}

/**
 * Lists the providers the API is configured for. Never throws for an
 * unconfigured deployment: the endpoint answers with an empty array.
 */
export async function fetchOAuthProviders(): Promise<OAuthProvider[]> {
  const response = await apiRequest<OAuthProvidersResponse>(
    '/api/v1/auth/oauth/providers',
    { auth: false },
  )
  return response.providers ?? []
}

/**
 * Builds the URL that begins a provider sign-in.
 *
 * This is navigated to, not fetched: the API answers with a redirect to the
 * provider and a Set-Cookie holding the sealed flow state, neither of which a
 * `fetch` would act on. `API_BASE` is used rather than a hardcoded path so a
 * separately hosted API still receives the request at its own origin.
 */
export function oauthStartUrl(providerId: string, next?: string): string {
  const params = new URLSearchParams()
  // Only an in-app path is forwarded; the server re-validates it, but sending
  // anything else would be pointless noise.
  if (next && next.startsWith('/') && !next.startsWith('//')) {
    params.set('next', next)
  }
  const query = params.toString()
  const path = `/api/v1/auth/oauth/${encodeURIComponent(providerId)}/start`
  return query ? `${API_BASE}${path}?${query}` : `${API_BASE}${path}`
}
