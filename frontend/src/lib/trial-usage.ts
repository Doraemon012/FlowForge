import type { TrialUsage } from '@/api/types'

/**
 * Client-side mirrors of the server's trial exhaustion rule
 * (`internal/trial/limits.go` → `Limits.Exhausted`).
 *
 * These exist only to drive presentation — the server independently enforces
 * the same limits and refuses any AI request past them. They must therefore
 * match the server exactly: a cap that is disabled (configured `limit <= 0`)
 * is unlimited and must never read as spent, which is why the guard checks the
 * limit as well as the remaining count.
 */

type AiMode = 'generation' | 'edit'

/** True when an enforced cap (`limit > 0`) has no allowance left. */
function capSpent(limit: number, remaining: number): boolean {
  return limit > 0 && remaining <= 0
}

/** Any enforced trial AI allowance is spent — the rule the indicator uses. */
export function isTrialExhausted(trial: TrialUsage): boolean {
  return (
    capSpent(trial.limits.generation, trial.remaining.generation) ||
    capSpent(trial.limits.edit, trial.remaining.edit) ||
    capSpent(trial.limits.total, trial.remaining.total)
  )
}

/**
 * The allowance for a single AI mode is spent (its own cap or the combined
 * total). Used by the AI dialog, which offers create and refine separately.
 */
export function isTrialModeSpent(trial: TrialUsage, mode: AiMode): boolean {
  const cap = mode === 'generation' ? trial.limits.generation : trial.limits.edit
  const remaining =
    mode === 'generation' ? trial.remaining.generation : trial.remaining.edit
  return capSpent(cap, remaining) || capSpent(trial.limits.total, trial.remaining.total)
}
