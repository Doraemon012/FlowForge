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

const highlights = [
  'Graph-based workflow definitions',
  'Fault-tolerant, durable execution',
  'Complete attempt history',
]

export function AuthLayout({ title, description, children, footer, className }: AuthLayoutProps) {
  return (
    <div className="flex min-h-svh">
      <div className="relative hidden w-1/2 overflow-hidden bg-foreground lg:block">
        <div
          className="absolute inset-0 opacity-90"
          style={{
            backgroundImage:
              'radial-gradient(600px 400px at 20% 20%, color-mix(in oklch, var(--primary) 22%, transparent), transparent 60%)',
          }}
          aria-hidden="true"
        />
        <div
          className="absolute inset-0"
          style={{
            backgroundImage:
              'linear-gradient(to bottom right, color-mix(in oklch, var(--primary) 12%, transparent) 1px, transparent 1px)',
            backgroundSize: '28px 28px',
          }}
          aria-hidden="true"
        />
        <div className="relative flex h-full flex-col justify-between p-12">
          <div className="flex items-center gap-2 text-background">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-lg">
              <Workflow className="h-5 w-5" aria-hidden="true" />
            </div>
            <span className="font-display text-lg font-semibold tracking-tight">FlowForge</span>
          </div>

          <div className="space-y-6">
            <h2 className="font-display text-4xl font-semibold leading-tight tracking-tight text-background">
              Durable workflow orchestration for developers.
            </h2>
            <ul className="space-y-2.5">
              {highlights.map((highlight) => (
                <li key={highlight} className="flex items-center gap-2 text-background/80">
                  <span className="h-1.5 w-1.5 rounded-full bg-primary" aria-hidden="true" />
                  <span className="text-sm">{highlight}</span>
                </li>
              ))}
            </ul>
          </div>

          <p className="text-xs text-background/60">© {new Date().getFullYear()} FlowForge</p>
        </div>
      </div>

      <div className="flex flex-1 flex-col items-center justify-center px-6 py-10">
        <div className={cn('flex w-full max-w-sm flex-col gap-6', className)}>
          <div className="flex items-center justify-center gap-2 lg:hidden">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm">
              <Workflow className="h-5 w-5" aria-hidden="true" />
            </div>
            <span className="font-display text-lg font-semibold tracking-tight">FlowForge</span>
          </div>

          <div className="surface rounded-xl p-6">
            <div className="space-y-1">
              <h1 className="font-display text-xl font-semibold tracking-tight">{title}</h1>
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
    </div>
  )
}
