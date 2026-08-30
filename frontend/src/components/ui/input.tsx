import * as React from 'react'
import { cn } from '@/lib/utils'

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<'input'>>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          'flex h-9 w-full rounded-md border border-border bg-surface-2 px-3 py-1 text-sm transition-colors duration-150 placeholder:text-dim/70 hover:border-border-strong focus-visible:outline-none focus-visible:border-accent-dim focus-visible:bg-bg focus-visible:ring-2 focus-visible:ring-accent-dim/30 disabled:cursor-not-allowed disabled:opacity-50 aria-[invalid=true]:border-failed aria-[invalid=true]:focus-visible:border-failed aria-[invalid=true]:focus-visible:ring-failed/20',
          className,
        )}
        ref={ref}
        {...props}
      />
    )
  },
)
Input.displayName = 'Input'

export { Input }
