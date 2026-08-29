export type ExecutionStatusVariant =
  | 'success'
  | 'secondary'
  | 'warning'
  | 'info'
  | 'destructive'

export function getExecutionStatusVariant(status: string): ExecutionStatusVariant {
  switch (status) {
    case 'completed':
      return 'success'
    case 'failed':
      return 'destructive'
    case 'running':
    case 'pending':
    case 'queued':
      return 'info'
    case 'cancelled':
    case 'cancel_requested':
    case 'timed_out':
      return 'warning'
    default:
      return 'secondary'
  }
}

export function getTaskRunStatusVariant(status: string): ExecutionStatusVariant {
  switch (status) {
    case 'succeeded':
      return 'success'
    case 'failed':
      return 'destructive'
    case 'running':
    case 'pending':
    case 'queued':
    case 'leased':
      return 'info'
    case 'blocked':
    case 'retry_scheduled':
    case 'timed_out':
    case 'cancelled':
    case 'cancel_requested':
      return 'warning'
    default:
      return 'secondary'
  }
}

export function statusLabel(status: string): string {
  const label = status
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
  return label || 'Unknown'
}
