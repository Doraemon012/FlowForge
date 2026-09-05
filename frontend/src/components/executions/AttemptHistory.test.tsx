import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { AttemptHistory } from '@/components/executions/AttemptHistory'
import type { TaskAttempt } from '@/api/types'

function makeAttempt(overrides: Partial<TaskAttempt>): TaskAttempt {
  return {
    id: 'attempt-1',
    task_run_id: 'task-run-1',
    execution_id: 'exec-1',
    task_id: 'task-1',
    attempt_number: 1,
    worker_id: 'worker-a',
    status: 'succeeded',
    started_at: '2024-01-15T00:00:00Z',
    heartbeat_at: '2024-01-15T00:00:01Z',
    lease_expires_at: '2024-01-15T00:00:05Z',
    ...overrides,
  }
}

describe('AttemptHistory', () => {
  it('renders a single successful attempt', () => {
    render(<AttemptHistory attempts={[makeAttempt({})]} />)
    expect(screen.getByText('task-1')).toBeInTheDocument()
    expect(screen.getByText('Attempt 1')).toBeInTheDocument()
    expect(screen.getByText('Worker: worker-a')).toBeInTheDocument()
    expect(screen.getByText('1 attempt')).toBeInTheDocument()
  })

  it('shows a recovery message when a later attempt succeeds after a lost worker', () => {
    const attempts = [
      makeAttempt({
        id: 'attempt-1',
        attempt_number: 1,
        status: 'worker_lost',
        failure_classification: 'transient',
        failure_reason: 'worker lost',
      }),
      makeAttempt({
        id: 'attempt-2',
        attempt_number: 2,
        status: 'succeeded',
        worker_id: 'worker-b',
      }),
    ]
    render(<AttemptHistory attempts={attempts} />)
    expect(screen.getByText('task-1')).toBeInTheDocument()
    expect(screen.getByText('2 attempts')).toBeInTheDocument()
    expect(screen.getByText('Attempt 1')).toBeInTheDocument()
    expect(screen.getByText('Attempt 2')).toBeInTheDocument()
    expect(screen.getByText('Recovered after 2 attempts.')).toBeInTheDocument()
    expect(screen.getByText('Worker: worker-a')).toBeInTheDocument()
    expect(screen.getByText('Worker: worker-b')).toBeInTheDocument()
    expect(screen.getByText('Transient')).toBeInTheDocument()
  })

  it('groups attempts by task id', () => {
    const attempts = [
      makeAttempt({ id: 'a1', task_id: 'task-1', attempt_number: 1 }),
      makeAttempt({ id: 'a2', task_id: 'task-2', attempt_number: 1 }),
    ]
    render(<AttemptHistory attempts={attempts} />)
    expect(screen.getByText('task-1')).toBeInTheDocument()
    expect(screen.getByText('task-2')).toBeInTheDocument()
  })

  it('returns null when there are no attempts', () => {
    const { container } = render(<AttemptHistory attempts={[]} />)
    expect(container.firstChild).toBeNull()
  })
})
