import type { ReactNode } from 'react'
import {
  AlertTriangle,
  Info,
  Lock,
  ShieldCheck,
  Sparkles,
  CheckCircle2,
} from 'lucide-react'
import { cn } from '@/lib/utils'

export type DocsCalloutVariant =
  | 'info'
  | 'success'
  | 'warning'
  | 'deferred'
  | 'security'
  | 'v1'

interface DocsCalloutProps {
  variant?: DocsCalloutVariant
  title?: string
  children: ReactNode
  className?: string
}

const iconMap: Record<DocsCalloutVariant, ReactNode> = {
  info: <Info className="docs-callout-icon" aria-hidden="true" />,
  success: <CheckCircle2 className="docs-callout-icon" aria-hidden="true" />,
  warning: <AlertTriangle className="docs-callout-icon" aria-hidden="true" />,
  deferred: <Sparkles className="docs-callout-icon" aria-hidden="true" />,
  security: <Lock className="docs-callout-icon" aria-hidden="true" />,
  v1: <ShieldCheck className="docs-callout-icon" aria-hidden="true" />,
}

export function DocsCallout({
  variant = 'info',
  title,
  children,
  className,
}: DocsCalloutProps) {
  return (
    <div
      className={cn('docs-callout', variant, className)}
      role={variant === 'security' ? 'alert' : undefined}
    >
      {iconMap[variant]}
      <div>
        {title ? <div className="docs-callout-title">{title}</div> : null}
        {children}
      </div>
    </div>
  )
}
