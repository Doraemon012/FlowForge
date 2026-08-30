import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const badgeVariants = cva(
  'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
  {
    variants: {
      variant: {
        default:
          'border-transparent bg-primary/90 text-primary-foreground shadow-sm',
        secondary:
          'border-transparent bg-secondary text-secondary-foreground',
        destructive:
          'border-transparent bg-destructive/90 text-destructive-foreground shadow-sm',
        outline: 'border-border text-muted-foreground bg-background/50',
        success:
          'border-success/25 bg-success/12 text-success dark:border-success/25 dark:bg-success/15 dark:text-success ring-1 ring-inset ring-success/20',
        warning:
          'border-warning/25 bg-warning/12 text-warning dark:border-warning/25 dark:bg-warning/15 dark:text-warning ring-1 ring-inset ring-warning/20',
        info:
          'border-info/25 bg-info/12 text-info dark:border-info/25 dark:bg-info/15 dark:text-info ring-1 ring-inset ring-info/20',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />
}

export { Badge, badgeVariants }
