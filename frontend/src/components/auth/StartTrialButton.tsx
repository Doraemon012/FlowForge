import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import { toast } from 'sonner'
import { ApiError } from '@/api/client'
import { useAuth } from '@/hooks/use-auth'
import { Button } from '@/components/ui/button'

interface StartTrialButtonProps {
  size?: 'sm' | 'default' | 'lg'
  variant?: 'default' | 'outline' | 'ghost'
  className?: string
  /** Overrides the default label; the icon is added automatically. */
  label?: string
  /** Hide the trailing arrow for compact placements (e.g. the header). */
  hideArrow?: boolean
}

/**
 * Enters the public trial from any public page: provisions a disposable,
 * isolated account on the server and drops the visitor straight into the real
 * dashboard. There is no signup form, no password, and no demo UI — the session
 * it creates is an ordinary (trial-flagged) account.
 *
 * Only the click handler is client-side; the account, the session, and the AI
 * allowance are all created and enforced by the server.
 */
export function StartTrialButton({
  size = 'default',
  variant = 'default',
  className,
  label = 'Try FlowForge',
  hideArrow = false,
}: StartTrialButtonProps) {
  const navigate = useNavigate()
  const { startTrial } = useAuth()
  const [isStarting, setIsStarting] = useState(false)

  const handleStartTrial = async () => {
    if (isStarting) return
    setIsStarting(true)
    try {
      await startTrial()
      // The session now exists, so RequireAuth lets /app through.
      navigate('/app', { replace: true })
    } catch (error) {
      // The visitor stays on the page; we only surface why it failed rather
      // than pretending a trial started.
      toast.error(
        error instanceof ApiError
          ? error.message
          : 'Could not start the trial. Please try again.',
      )
      setIsStarting(false)
    }
  }

  return (
    <Button
      size={size}
      variant={variant}
      className={className}
      loading={isStarting}
      onClick={handleStartTrial}
    >
      {label}
      {hideArrow ? null : <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />}
    </Button>
  )
}
