import { Badge } from '@/components/ui/badge'
import { getExecutionStatusVariant, statusLabel } from './execution-status'

interface ExecutionStatusBadgeProps {
  status: string
  className?: string
}

export function ExecutionStatusBadge({ status, className }: ExecutionStatusBadgeProps) {
  return (
    <Badge variant={getExecutionStatusVariant(status)} className={className}>
      {statusLabel(status)}
    </Badge>
  )
}
