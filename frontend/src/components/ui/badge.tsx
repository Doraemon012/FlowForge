import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const dotVariants = new Set([
  'success',
  'warning',
  'info',
  'destructive',
  'active',
  'running',
  'failed',
  'queued',
  'paused',
])

const badgeVariants = cva('badge', {
  variants: {
    variant: {
      default: '',
      secondary: 'draft',
      destructive: 'failed',
      outline: '',
      success: 'success',
      warning: 'paused',
      info: 'running',
      active: 'active',
      running: 'running',
      failed: 'failed',
      queued: 'queued',
      paused: 'paused',
    },
  },
  defaultVariants: {
    variant: 'default',
  },
})

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, children, ...props }: BadgeProps) {
  const showDot = variant ? dotVariants.has(variant) : false
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props}>
      {showDot ? <span className="dot" aria-hidden="true" /> : null}
      {children}
    </div>
  )
}

export { Badge, badgeVariants }
