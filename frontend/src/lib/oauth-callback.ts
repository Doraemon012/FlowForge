/**
 * The result of a social sign-in as the API reports it, carried in the URL
 * fragment of the frontend hand-off. The fragment is used instead of a query
 * string because it is never sent to a server or written to an access log.
 */
export interface OAuthSignInSuccess {
  kind: 'success'
  accessToken: string
  /** The account the token belongs to. Empty only against an API build that
   * predates this parameter. */
  userId: string
  /** In-app path to land on, when the visitor was interrupted on the way to a
   * protected page. Empty when the flow began on a sign-in page. */
  next: string
}

export interface OAuthSignInFailure {
  kind: 'failure'
  /** Stable, non-sensitive code chosen by the server. */
  code: string
  /** Provider slug, e.g. "google". Empty when the failure predates the flow. */
  provider: string
  next: string
}

/** The callback route was opened directly, with no sign-in in flight. */
export interface OAuthSignInAbsent {
  kind: 'absent'
}

export type OAuthSignInResult = OAuthSignInSuccess | OAuthSignInFailure | OAuthSignInAbsent

/**
 * Reads the hand-off fragment. Everything is treated as untrusted input: the
 * values end up in the session store, so a malformed or missing field degrades
 * to `absent` or an empty string rather than propagating.
 */
export function parseOAuthSignIn(hash: string): OAuthSignInResult {
  const params = new URLSearchParams(hash.startsWith('#') ? hash.slice(1) : hash)

  const accessToken = (params.get('access_token') ?? '').trim()
  if (accessToken !== '') {
    return {
      kind: 'success',
      accessToken,
      userId: (params.get('user_id') ?? '').trim(),
      next: safeNextPath(params.get('next')),
    }
  }

  const code = (params.get('error') ?? '').trim()
  if (code !== '') {
    return {
      kind: 'failure',
      code,
      provider: (params.get('provider') ?? '').trim(),
      next: safeNextPath(params.get('next')),
    }
  }

  return { kind: 'absent' }
}

/**
 * Only an in-app absolute path survives. The page navigates to the value as-is,
 * so anything that could leave the app (a scheme, a host, a protocol-relative
 * `//`) is dropped here as well as on the server.
 */
function safeNextPath(raw: string | null): string {
  const trimmed = (raw ?? '').trim()
  if (!trimmed.startsWith('/') || trimmed.startsWith('//')) return ''
  if (/[\r\n\\]/.test(trimmed)) return ''
  return trimmed
}

/** Display name for a provider slug, for use inside a sentence. */
export function providerLabel(slug: string): string {
  switch (slug) {
    case 'google':
      return 'Google'
    case 'microsoft':
      return 'Microsoft'
    default:
      return slug === '' ? 'the provider' : slug
  }
}

export interface OAuthFailureMessage {
  /** Sentence shown to the visitor. */
  message: string
  /** True when the visitor or the provider declined, so the page presents it as
   * a change of mind rather than a fault. */
  cancelled: boolean
}

/**
 * Turns a server code into a sentence. The messages live on the client so they
 * stay consistent with the rest of the UI's wording and so the API never has to
 * invent prose; the codes themselves are the stable contract.
 */
export function describeOAuthFailure(code: string, slug: string): OAuthFailureMessage {
  const provider = providerLabel(slug)
  switch (code) {
    case 'access_denied':
      return { message: `Sign-in with ${provider} was cancelled.`, cancelled: true }
    case 'state_invalid':
      return {
        message: 'That sign-in link has expired or was already used. Please start again.',
        cancelled: false,
      }
    case 'config_error':
      return {
        message: `Sign-in with ${provider} is not configured correctly. Please use your email and password.`,
        cancelled: false,
      }
    case 'email_unavailable':
      return {
        message: `${provider} did not provide an email address, which FlowForge needs for every account.`,
        cancelled: false,
      }
    case 'email_taken':
      return {
        message: 'An account already exists for that email address. Sign in with your password instead.',
        cancelled: false,
      }
    case 'already_linked':
      return {
        message: `This account is already linked to a different ${provider} account.`,
        cancelled: false,
      }
    case 'account_inactive':
      return { message: 'This account is not active.', cancelled: false }
    case 'profile_unavailable':
      return {
        message: `Could not read your profile from ${provider}. Please try again.`,
        cancelled: false,
      }
    case 'provider_error':
      return { message: `${provider} could not complete the sign-in. Please try again.`, cancelled: false }
    case 'invalid_request':
      return { message: 'That sign-in request was incomplete. Please start again.', cancelled: false }
    default:
      return { message: `Sign-in with ${provider} failed. Please try again.`, cancelled: false }
  }
}
