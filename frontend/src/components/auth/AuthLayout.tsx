import type * as React from 'react'
import { cn } from '@/lib/utils'
import { FlowForgeLogo } from '@/components/brand/FlowForgeLogo'
import heroOrchestration from '@/assets/hero-orchestration-640.webp'

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
    <div className="auth">
      <div
        className="auth-l"
        style={{
          backgroundImage:
            'radial-gradient(circle at 30% 60%, rgba(94, 234, 212, 0.08), transparent 60%)',
        }}
      >
        <div className="inner">
          <FlowForgeLogo />
          <h1>
            Durable workflow
            <br />
            orchestration for
            <br />
            developers.
          </h1>
          <ul>
            {highlights.map((highlight) => (
              <li key={highlight}>
                <span className="live-dot" aria-hidden="true" />
                {highlight}
              </li>
            ))}
          </ul>
          <div className="auth-art">
            <img
              src={heroOrchestration}
              alt="A FlowForge task graph rendered in 3D: one task fans out to three dependents, two of which have finished and one of which is being retried, with worker nodes alongside."
              width={640}
              height={640}
              decoding="async"
            />
          </div>
        </div>
        <div
          style={{
            position: 'relative',
            zIndex: 1,
            color: 'var(--dim)',
            fontFamily: 'var(--font-mono)',
            fontSize: 11,
          }}
        >
          © {new Date().getFullYear()} FlowForge
        </div>
      </div>

      <div className="auth-r">
        <div className={cn('auth-card', className)}>
          <FlowForgeLogo
            className="justify-center lg:hidden"
            wordmarkClassName="font-display text-lg font-semibold tracking-tight"
          />

          <h2>{title}</h2>
          {description ? <p className="lead">{description}</p> : null}

          <div className="auth-form">{children}</div>

          {footer ? <div className="auth-foot">{footer}</div> : null}
        </div>
      </div>
    </div>
  )
}
