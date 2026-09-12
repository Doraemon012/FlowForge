import { useQuery, useQueryClient } from '@tanstack/react-query'
import { getTrialUsage } from '@/api/trial'
import { useAuth } from '@/hooks/use-auth'

export const trialUsageKey = ['trial', 'usage'] as const

/**
 * The caller's trial AI allowance, fetched from the server. It is enabled only
 * for trial sessions: registered users never issue the request and never see a
 * trial indicator. It refetches on window focus, and every AI mutation
 * invalidates it, so the counter stays accurate even if usage changes from
 * another tab.
 */
export function useTrialUsage() {
  const { isAuthenticated, isTrial } = useAuth()

  return useQuery({
    queryKey: trialUsageKey,
    queryFn: getTrialUsage,
    enabled: isAuthenticated && isTrial,
    staleTime: 0,
    refetchOnWindowFocus: true,
  })
}

/**
 * Invalidates the cached trial usage so the counter reflects a use that just
 * happened. Called after an AI request succeeds or is refused for hitting the
 * limit, so the indicator never shows a stale allowance.
 */
export function useRefreshTrialUsage() {
  const queryClient = useQueryClient()
  return () => queryClient.invalidateQueries({ queryKey: trialUsageKey })
}
