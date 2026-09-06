import { cn } from '@/lib/utils'

export type DocsVersionBadgeLabel = 'V1' | 'Deferred' | 'Frontend gap'

interface DocsVersionBadgeProps {
  label: DocsVersionBadgeLabel
  className?: string
}

const variantMap: Record<DocsVersionBadgeLabel, string> = {
  V1: 'v1',
  Deferred: 'deferred',
  'Frontend gap': 'frontend-gap',
}

export function DocsVersionBadge({ label, className }: DocsVersionBadgeProps) {
  return (
    <span className={cn('docs-version-badge', variantMap[label], className)}>
      {label}
    </span>
  )
}
