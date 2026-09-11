import { apiRequest } from './client'
import type { TrialUsage } from './types'

/**
 * Reads the caller's public-trial AI consumption. The server returns
 * `is_trial: false` for registered accounts, so the shell can render the trial
 * indicator and AI quota only for trial sessions.
 *
 * The numbers come from the same store the server enforces against; the client
 * never computes or caches a limit of its own.
 */
export function getTrialUsage(): Promise<TrialUsage> {
  return apiRequest<TrialUsage>('/api/v1/trial/usage')
}
