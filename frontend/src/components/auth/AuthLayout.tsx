import type * as React from 'react'
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
    <div className="auth">
      <div
        className="auth-l"
        style={{
          backgroundImage:
            'radial-gradient(circle at 30% 60%, rgba(94, 234, 212, 0.08), transparent 60%)',
        }}
      >
        <div className="inner">
          <div className="logo">
            <span className="logo-mark">F</span>
            <span>FlowForge</span>
          </div>
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
          <div className="dagpreview" aria-hidden="true">
            <div className="lnode" style={{ left: 24, top: 80, width: 140 }}>
              <div className="lnode-head">
                <div className="task-icon ti-http" style={{ width: 20, height: 20 }}>
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="9" />
                  </svg>
                </div>
                <div className="lnode-title" style={{ fontSize: '11.5px' }}>Fetch</div>
              </div>
            </div>
            <div className="lnode" style={{ left: 210, top: 40, width: 140 }}>
              <div className="lnode-head">
                <div className="task-icon ti-transform" style={{ width: 20, height: 20 }}>
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M4 7h16" />
                  </svg>
                </div>
                <div className="lnode-title" style={{ fontSize: '11.5px' }}>Transform</div>
              </div>
            </div>
            <div className="lnode" style={{ left: 210, top: 130, width: 140 }}>
              <div className="lnode-head">
                <div className="task-icon ti-email" style={{ width: 20, height: 20 }}>
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M3 6h18v12H3z" />
                  </svg>
                </div>
                <div className="lnode-title" style={{ fontSize: '11.5px' }}>Notify</div>
              </div>
            </div>
            <svg style={{ position: 'absolute', inset: 0 }} width="100%" height="100%" viewBox="0 0 380 240">
              <path d="M165,100 C190,100 190,55 210,55" stroke="#5EEAD4" strokeWidth="1.4" fill="none" />
              <path d="M165,110 C190,110 190,150 210,150" stroke="#60A5FA" strokeWidth="1.4" fill="none" strokeDasharray="4 3" />
            </svg>
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
          <div className="flex items-center justify-center gap-2 lg:hidden">
            <div className="logo-mark">F</div>
            <span className="font-display text-lg font-semibold tracking-tight">FlowForge</span>
          </div>

          <h2>{title}</h2>
          {description ? <p className="lead">{description}</p> : null}

          <div className="auth-form">{children}</div>

          {footer ? <div className="auth-foot">{footer}</div> : null}
        </div>
      </div>
    </div>
  )
}
