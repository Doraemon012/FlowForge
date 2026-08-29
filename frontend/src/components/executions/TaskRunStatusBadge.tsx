import { Badge } from '@/components/ui/badge'
import { getTaskRunStatusVariant, statusLabel } from './execution-status'

interface TaskRunStatusBadgeProps {
  status: string
  className?: string
}

export function TaskRunStatusBadge({ status, className }: TaskRunStatusBadgeProps) {
  return (
    <Badge variant={getTaskRunStatusVariant(status)} className={className}>
      {statusLabel(status)}
    </Badge>
  )
}
