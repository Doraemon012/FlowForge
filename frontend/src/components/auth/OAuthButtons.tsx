import { useState } from 'react'
import { oauthStartUrl } from '@/api/oauth'
import { useOAuthProviders } from '@/hooks/use-oauth-providers'
import { Button } from '@/components/ui/button'
import { ProviderIcon } from '@/components/brand/ProviderIcon'

interface OAuthButtonsProps {
  /** In-app path to land on after sign-in. Omitted when the visitor opened the
   * sign-in page directly, in which case the callback falls back to `/app`. */
  next?: string
}

/**
 * "Continue with …" for every social provider this deployment is configured
 * for, followed by the divider that separates them from the credentials form.
 *
 * The list comes from the server, so nothing is rendered on a deployment with
 * no provider credentials — including the divider, which would otherwise sit
 * above the form with nothing over it. That is why the divider lives here
 * rather than on the pages.
 *
 * Clicking is a full-page navigation, not a fetch: the API answers with a
 * redirect to the provider and a `Set-Cookie` holding the sealed flow state,
 * and neither takes effect through `fetch`.
 */
export function OAuthButtons({ next }: OAuthButtonsProps) {
  const { data: providers, isPending } = useOAuthProviders()
  const [startingId, setStartingId] = useState<string | null>(null)

  const available = providers ?? []
  if (isPending || available.length === 0) {
    return null
  }

  const handleStart = (providerId: string) => {
    setStartingId(providerId)
    // The browser leaves the page, so this state is only ever visible for the
    // instant before the navigation begins.
    window.location.assign(oauthStartUrl(providerId, next))
  }

  return (
    <div className="oauth-block">
      {available.map((provider) => (
        <Button
          key={provider.id}
          type="button"
          variant="outline"
          className="w-full justify-center"
          loading={startingId === provider.id}
          disabled={startingId !== null}
          onClick={() => handleStart(provider.id)}
        >
          <ProviderIcon providerId={provider.id} className="mr-2 h-4 w-4" />
          Continue with {provider.name}
        </Button>
      ))}
      {/* Purely visual separation; the buttons above and the form below explain
          themselves to a screen reader. */}
      <div className="auth-alt" aria-hidden="true">
        or
      </div>
    </div>
  )
}
