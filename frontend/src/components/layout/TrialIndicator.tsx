import { useNavigate } from 'react-router-dom'
import { Sparkles } from 'lucide-react'
import { useAuth } from '@/hooks/use-auth'
import { useTrialUsage } from '@/hooks/use-trial'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

/** Shared copy so the indicator and the AI dialog explain exhaustion the same way. */
export const TRIAL_EXHAUSTED_MESSAGE =
  'The free trial AI limit has been reached. Create a free account to keep using AI features.'

/**
 * A small, always-visible reminder that the workspace is a disposable trial,
 * plus the AI allowance left. It is the only chrome trial mode adds; the rest
 * of the product is unchanged.
 *
 * The counter is read from the server (`/trial/usage`). The `exhausted` flag
 * below is derived here purely for presentation — the server independently
 * enforces the same limits and refuses any AI request past them, so a tampered
 * client cannot spend more than the trial allows.
 */
export function TrialIndicator() {
  const navigate = useNavigate()
  const { logout } = useAuth()
  const { data } = useTrialUsage()

  if (!data?.is_trial) return null

  const { remaining, limits, ai_enabled: aiEnabled } = data

  // Mirrors the server's rule: any enforced allowance at zero means AI is
  // unavailable. Display-only; the server makes the real decision.
  const exhausted =
    aiEnabled &&
    (remaining.total <= 0 || remaining.generation <= 0 || remaining.edit <= 0)

  // Signup is unreachable while a session exists (RequirePublic bounces
  // authenticated visitors to /app), so leaving the trial discards the
  // disposable session first.
  const goToSignup = () => {
    logout()
    navigate('/signup', { replace: true })
  }

  return (
    <div className="flex items-center gap-2">
      <span className="badge" style={{ padding: '2px 8px', fontSize: '10px' }}>
        Trial
      </span>

      {aiEnabled ? (
        <Tooltip>
          <TooltipTrigger asChild>
            {exhausted ? (
              <button
                type="button"
                onClick={goToSignup}
                className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs text-muted-foreground transition-colors hover:border-accent hover:text-foreground"
              >
                <Sparkles className="h-3 w-3" aria-hidden="true" />
                <span>AI limit reached</span>
              </button>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs text-muted-foreground">
                <Sparkles className="h-3 w-3" aria-hidden="true" />
                <span>
                  AI {remaining.total}/{limits.total}
                </span>
              </span>
            )}
          </TooltipTrigger>
          <TooltipContent>
            <p className="font-medium">Trial AI usage</p>
            <ul className="mt-1 space-y-0.5">
              <li>Generation: {remaining.generation} left</li>
              <li>Editing: {remaining.edit} left</li>
              <li>
                Total: {remaining.total} of {limits.total} left
              </li>
            </ul>
            {exhausted ? <p className="mt-1">{TRIAL_EXHAUSTED_MESSAGE}</p> : null}
          </TooltipContent>
        </Tooltip>
      ) : null}
    </div>
  )
}
