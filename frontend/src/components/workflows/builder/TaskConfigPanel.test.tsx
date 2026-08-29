import { useState } from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { TaskConfigPanel } from './TaskConfigPanel'
import type { WorkflowTask } from '@/api/types'

const httpTask: WorkflowTask = {
  id: 'fetch',
  type: 'http',
  config: { url: 'https://api.example.com', method: 'GET' },
  depends_on: [],
}

interface HarnessProps {
  initialTask: WorkflowTask | null
  onChange: (patch: Partial<WorkflowTask>) => void
  onDelete: () => void
  onClose: () => void
}

function Harness({ initialTask, onChange, onDelete, onClose }: HarnessProps) {
  const [task, setTask] = useState(initialTask)
  return (
    <TaskConfigPanel
      task={task}
      onChange={(patch) => {
        setTask((current) => (current ? { ...current, ...patch } : current))
        onChange(patch)
      }}
      onDelete={onDelete}
      onClose={onClose}
    />
  )
}

function renderHarness(overrides: Partial<HarnessProps> = {}) {
  const onChange = vi.fn()
  const onDelete = vi.fn()
  const onClose = vi.fn()
  render(
    <Harness
      initialTask={httpTask}
      onChange={onChange}
      onDelete={onDelete}
      onClose={onClose}
      {...overrides}
    />,
  )
  return { onChange, onDelete, onClose }
}

describe('TaskConfigPanel', () => {
  it('shows an empty state when no task is selected', () => {
    render(
      <TaskConfigPanel task={null} onChange={vi.fn()} onDelete={vi.fn()} onClose={vi.fn()} />,
    )
    expect(screen.getByText('Select a task')).toBeInTheDocument()
  })

  it('renders the task id and type-specific config fields', () => {
    renderHarness()
    expect(screen.getByLabelText('Task ID')).toHaveValue('fetch')
    expect(screen.getByLabelText('URL')).toHaveValue('https://api.example.com')
    expect(screen.getByLabelText('HTTP method')).toHaveValue('GET')
    expect(screen.getByRole('button', { name: /delete task/i })).toBeInTheDocument()
  })

  it('calls onChange with an updated id when the task id field changes', async () => {
    const user = userEvent.setup()
    const { onChange } = renderHarness()
    const input = screen.getByLabelText('Task ID')
    await user.clear(input)
    await user.type(input, 'fetch-data')
    await waitFor(() => {
      expect(onChange).toHaveBeenCalledWith({ id: 'fetch-data' })
    })
  })

  it('calls onChange with the updated config when a config field changes', async () => {
    const user = userEvent.setup()
    const { onChange } = renderHarness()
    const url = screen.getByLabelText('URL')
    await user.clear(url)
    await user.type(url, 'https://new.example.com')
    await waitFor(() => {
      expect(onChange).toHaveBeenCalled()
    })
    expect(onChange).toHaveBeenLastCalledWith({
      config: { url: 'https://new.example.com', method: 'GET' },
    })
  })

  it('calls onDelete when the delete button is clicked', async () => {
    const user = userEvent.setup()
    const { onDelete } = renderHarness()
    await user.click(screen.getByRole('button', { name: /delete task/i }))
    expect(onDelete).toHaveBeenCalled()
  })

  it('calls onClose when the close button is clicked', async () => {
    const user = userEvent.setup()
    const { onClose } = renderHarness()
    await user.click(screen.getByRole('button', { name: /close task configuration/i }))
    expect(onClose).toHaveBeenCalled()
  })
})
