import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { BookOpen, Check, Compass, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export interface GuideStep {
  id: string
  label: string
  hint: string
  done: boolean
}

interface WorkflowGuideProps {
  steps: GuideStep[]
  defaultOpen?: boolean
}

/**
 * Lightweight, in-product guidance for the main workflow. A compact popover
 * lists the end-to-end steps and reflects which ones are already complete, so a
 * user can follow the flow without leaving the builder for the docs.
 */
export function WorkflowGuide({ steps, defaultOpen = false }: WorkflowGuideProps) {
  const [open, setOpen] = useState(defaultOpen)
  const containerRef = useRef<HTMLDivElement>(null)

  const close = useCallback(() => setOpen(false), [])

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        close()
      }
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close()
    }
    window.addEventListener('mousedown', onPointerDown)
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('mousedown', onPointerDown)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [open, close])

  const completed = steps.filter((step) => step.done).length

  return (
    <div className="relative" ref={containerRef}>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-haspopup="dialog"
        title="Getting started guide"
      >
        <Compass className="mr-2 h-4 w-4" aria-hidden="true" />
        Guide
      </Button>
      {open ? (
        <div
          role="dialog"
          aria-label="Getting started guide"
          className="absolute right-0 top-full z-40 mt-2 w-80 overflow-hidden rounded-xl border border-border bg-card text-left shadow-xl"
        >
          <div className="flex items-start justify-between gap-2 border-b px-4 py-3">
            <div>
              <h2 className="text-sm font-semibold">Getting started</h2>
              <p className="text-xs text-muted-foreground">
                {completed} of {steps.length} steps done
              </p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              aria-label="Close guide"
              onClick={close}
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </Button>
          </div>
          <ol className="max-h-[22rem] space-y-2.5 overflow-y-auto px-4 py-3">
            {steps.map((step) => (
              <li key={step.id} className="flex gap-2.5">
                <span
                  className={cn(
                    'mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border',
                    step.done
                      ? 'border-success/40 bg-success/15 text-success'
                      : 'border-border',
                  )}
                  aria-hidden="true"
                >
                  {step.done ? (
                    <Check className="h-2.5 w-2.5" />
                  ) : (
                    <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/50" />
                  )}
                </span>
                <div className="min-w-0">
                  <p
                    className={cn(
                      'text-xs font-medium',
                      step.done && 'text-muted-foreground',
                    )}
                  >
                    {step.label}
                  </p>
                  <p className="text-xs leading-relaxed text-muted-foreground">{step.hint}</p>
                </div>
              </li>
            ))}
          </ol>
          <div className="border-t px-4 py-3">
            <Link
              to="/docs"
              className="inline-flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              <BookOpen className="h-3.5 w-3.5" aria-hidden="true" />
              Read the documentation
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  )
}

export default WorkflowGuide
