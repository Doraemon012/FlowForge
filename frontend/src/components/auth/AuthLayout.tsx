import type * as React from 'react'
import { Workflow } from 'lucide-react'
import { cn } from '@/lib/utils'

interface AuthLayoutProps {
  title: string
  description?: string
  children: React.ReactNode
  footer?: React.ReactNode
  className?: string
}

export function AuthLayout({ title, description, children, footer, className }: AuthLayoutProps) {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center px-4 py-8">
      <div className={cn('flex w-full max-w-sm flex-col gap-6', className)}>
        <div className="flex items-center justify-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm">
            <Workflow className="h-5 w-5" aria-hidden="true" />
          </div>
          <span className="text-lg font-semibold tracking-tight">FlowForge</span>
        </div>
        <div className="rounded-xl border bg-card p-6 shadow-sm">
          <div className="space-y-1">
            <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
            {description ? (
              <p className="text-sm text-muted-foreground">{description}</p>
            ) : null}
          </div>
          <div className="mt-6">{children}</div>
        </div>
        {footer ? (
          <div className="text-center text-sm text-muted-foreground">{footer}</div>
        ) : null}
      </div>
    </div>
  )
}
