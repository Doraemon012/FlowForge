import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { getMeWithToken } from '@/api/auth'
import { authStore } from '@/lib/auth-store'
import {
  describeOAuthFailure,
  parseOAuthSignIn,
  type OAuthFailureMessage,
} from '@/lib/oauth-callback'
import { AuthLayout } from '@/components/auth/AuthLayout'
import { Button } from '@/components/ui/button'

/**
 * Completes a social sign-in.
 *
 * The API never renders this page — it redirects the browser here with the
 * outcome in the URL fragment, because the callback endpoint is reached as a
 * navigation and cannot answer with an API error body. The fragment is read,
 * the token is exchanged for the account's profile, and the session is stored
 * in exactly the shape the password flow stores it, so everything downstream
 * (guards, shell, avatar) behaves identically for both.
 *
 * This route sits outside `RequirePublic` and `RequireAuth` on purpose: it runs
 * before a session exists and must be reachable even while one is being
 * replaced.
 */
export function AuthCallbackPage() {
  const navigate = useNavigate()
  // Parsed once, during the first render, while the fragment is still in the
  // URL. The effect below removes it.
  const [result] = useState(() => parseOAuthSignIn(window.location.hash))
  const [failure, setFailure] = useState<OAuthFailureMessage | null>(() =>
    result.kind === 'failure' ? describeOAuthFailure(result.code, result.provider) : null,
  )

  useEffect(() => {
    // The fragment holds a live access token, so it is stripped from the
    // address bar and from browser history before anything else happens. A
    // reload or a shared link then carries nothing.
    window.history.replaceState(null, '', window.location.pathname)

    if (result.kind === 'absent') {
      navigate('/login', { replace: true })
      return
    }
    if (result.kind === 'failure') {
      return
    }

    // `active` guards against the effect's cleanup racing the profile request:
    // the redirect below must not run for a result the page no longer shows.
    let active = true
    getMeWithToken(result.accessToken)
      .then((me) => {
        if (!active) return
        authStore.setSession({
          token: result.accessToken,
          user: {
            id: me.id,
            email: me.email,
            displayName: me.display_name,
            isTrial: me.is_trial,
          },
        })
        navigate(result.next || '/app', { replace: true })
      })
      .catch(() => {
        if (!active) return
        setFailure({
          message: 'Could not finish signing in. Please try again.',
          cancelled: false,
        })
      })
    return () => {
      active = false
    }
  }, [result, navigate])

  if (failure) {
    return (
      <AuthLayout
        title={failure.cancelled ? 'Sign-in cancelled' : 'Sign-in failed'}
        description={failure.message}
        footer={
          <>
            Trouble signing in?{' '}
            <Link to="/login" className="text-primary underline-offset-4 hover:underline">
              Use your email and password
            </Link>
          </>
        }
      >
        <Button asChild className="w-full justify-center">
          <Link to="/login">Back to sign in</Link>
        </Button>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout
      title="Signing you in"
      description="Finishing the hand-off with your provider. This only takes a moment."
    >
      <div className="oauth-pending" role="status">
        <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
        <span>Completing sign-in…</span>
      </div>
    </AuthLayout>
  )
}
