import type * as React from 'react'
import { Link } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { FlowForgeLogo } from '@/components/brand/FlowForgeLogo'
import { OrchestrationArt } from '@/components/brand/OrchestrationArt'
import { ThemeToggle } from '@/components/layout/ThemeToggle'

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
      <div className="auth-l">
        <div className="inner">
          <div className="auth-l-top">
            {/* The brand always leads home, on every surface. */}
            <Link to="/" className="auth-l-brand" aria-label="FlowForge home">
              <FlowForgeLogo />
            </Link>
            <ThemeToggle />
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
          {/* The same illustration the landing page leads with, so the sign-in
              column belongs to the product instead of showing a placeholder. */}
          <div className="auth-art">
            <OrchestrationArt />
          </div>
        </div>
        <div className="auth-l-foot">© {new Date().getFullYear()} FlowForge</div>
      </div>

      <div className="auth-r">
        <div className={cn('auth-card', className)}>
          {/* Below `lg` the left column is hidden, so the brand and the theme
              switch move above the form. The responsive utility sits on a
              wrapper because the unlayered `.auth-card-head` rule sets
              `display: flex` and would outrank Tailwind's layered `lg:hidden`
              if both were on the same element. */}
          <div className="lg:hidden">
            <div className="auth-card-head">
              <Link to="/" aria-label="FlowForge home">
                <FlowForgeLogo
                  wordmarkClassName="font-display text-lg font-semibold tracking-tight"
                />
              </Link>
              <ThemeToggle />
            </div>
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
