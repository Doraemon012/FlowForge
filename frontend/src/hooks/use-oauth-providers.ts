import { useQuery } from '@tanstack/react-query'
import { fetchOAuthProviders } from '@/api/oauth'

export const oauthKeys = {
  all: ['oauth'] as const,
  providers: () => [...oauthKeys.all, 'providers'] as const,
}

/**
 * The social sign-in providers this deployment can authenticate against.
 *
 * The answer comes from the server, so the sign-in pages render exactly the
 * buttons that work here: a deployment with no Google credentials shows no
 * Google button rather than one that fails after the click.
 *
 * `retry: false` and an infinite `staleTime` both follow from the same fact —
 * the provider set only changes when the deployment is reconfigured, so a
 * failure means "show no buttons", not "try harder".
 */
export function useOAuthProviders() {
  return useQuery({
    queryKey: oauthKeys.providers(),
    queryFn: fetchOAuthProviders,
    staleTime: Infinity,
    retry: false,
  })
}
