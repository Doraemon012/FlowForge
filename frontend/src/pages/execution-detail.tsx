import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, ListTodo } from 'lucide-react'
import { ApiError } from '@/api/client'
import { useProject } from '@/hooks/use-projects'
import { useWorkflow } from '@/hooks/use-workflows'
import { useExecution, useTaskRuns } from '@/hooks/use-executions'
import { ExecutionStatusBadge } from '@/components/executions/ExecutionStatusBadge'
import { TaskRunItem } from '@/components/executions/TaskRunItem'
import { EmptyState } from '@/components/shared/EmptyState'
import { ErrorState } from '@/components/shared/ErrorState'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { formatDateTime } from '@/lib/utils'

function ExecutionDetailSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-4 w-24" />
      <div className="space-y-2">
        <Skeleton className="h-8 w-1/2" />
        <Skeleton className="h-4 w-1/3" />
      </div>
      <div className="panel p-6">
        <Skeleton className="h-5 w-24" />
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      </div>
      <div className="panel p-6">
        <Skeleton className="h-5 w-24" />
        <div className="mt-4 space-y-3">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      </div>
    </div>
  )
}

export function ExecutionDetailPage() {
  const { projectId, executionId } = useParams<{
    projectId: string
    executionId: string
  }>()
  const {
    isLoading: projectLoading,
    isError: projectError,
    error: projectErr,
    refetch: refetchProject,
  } = useProject(projectId ?? '')
  const {
    data: execution,
    isLoading: executionLoading,
    isError: executionError,
    error: executionErr,
    refetch: refetchExecution,
  } = useExecution(executionId ?? '')
  const {
    data: taskRuns,
    isLoading: taskRunsLoading,
    isError: taskRunsError,
    error: taskRunsErr,
    refetch: refetchTaskRuns,
  } = useTaskRuns(executionId ?? '')
  const { data: workflow } = useWorkflow(projectId ?? '', execution?.workflow_id ?? '')

  if (projectLoading) {
    return <ExecutionDetailSkeleton />
  }

  if (projectError) {
    const notFound = projectErr instanceof ApiError && projectErr.status === 404
    return (
      <ErrorState
        title={notFound ? 'Project not found' : "Couldn't load this project"}
        message={
          notFound
            ? 'This project may have been archived or removed.'
            : 'The server could not be reached. Please try again.'
        }
        onRetry={refetchProject}
      />
    )
  }

  if (executionLoading && !execution) {
    return <ExecutionDetailSkeleton />
  }

  if (executionError) {
    const notFound = executionErr instanceof ApiError && executionErr.status === 404
    return (
      <ErrorState
        title={notFound ? 'Execution not found' : "Couldn't load this execution"}
        message={
          notFound
            ? 'This execution may have been removed or is in a project you cannot access.'
            : 'The server could not be reached. Please try again.'
        }
        onRetry={refetchExecution}
      />
    )
  }

  if (!execution) {
    return null
  }

  return (
    <div className="space-y-6">
      <Link
        to={`/app/projects/${projectId}/executions`}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Execution history
      </Link>

      <div className="exec-head">
        <div>
          <div className="exec-title">
            <span className="truncate">{workflow?.name ?? 'Execution'}</span>
          </div>
          <div className="exec-meta">
            <div className="m">
              <span className="lbl">Status</span>
              <span className="val">
                <ExecutionStatusBadge status={execution.status} />
              </span>
            </div>
            <div className="m">
              <span className="lbl">Created</span>
              <span className="val">{formatDateTime(execution.created_at)}</span>
            </div>
            {execution.started_at ? (
              <div className="m">
                <span className="lbl">Started</span>
                <span className="val">{formatDateTime(execution.started_at)}</span>
              </div>
            ) : null}
            {execution.completed_at ? (
              <div className="m">
                <span className="lbl">Completed</span>
                <span className="val">{formatDateTime(execution.completed_at)}</span>
              </div>
            ) : null}
            <div className="m">
              <span className="lbl">Workflow</span>
              <span className="val">
                {workflow ? (
                  <Link
                    to={`/app/projects/${projectId}/workflows/${workflow.id}`}
                    className="text-accent underline-offset-4 hover:underline"
                  >
                    {workflow.name}
                  </Link>
                ) : (
                  execution.workflow_id
                )}
              </span>
            </div>
            <div className="m">
              <span className="lbl">Execution</span>
              <span className="val">{execution.id.slice(0, 12)}…</span>
            </div>
          </div>
        </div>
        {execution.failure_reason ? (
          <div
            className="rounded-lg border border-failed/30 bg-failed/5 px-3 py-2 text-sm text-failed"
            role="alert"
          >
            {execution.failure_reason}
          </div>
        ) : null}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Status</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div>
            <p className="text-xs uppercase tracking-wide text-muted">Status</p>
            <div className="mt-1">
              <ExecutionStatusBadge status={execution.status} />
            </div>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-muted">Created</p>
            <p className="mt-1 font-mono text-sm">{formatDateTime(execution.created_at)}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-muted">Started</p>
            <p className="mt-1 font-mono text-sm">{formatDateTime(execution.started_at)}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-muted">Completed</p>
            <p className="mt-1 font-mono text-sm">{formatDateTime(execution.completed_at)}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-muted">Workflow</p>
            <p className="mt-1 text-sm font-medium">
              {workflow ? (
                <Link
                  to={`/app/projects/${projectId}/workflows/${workflow.id}`}
                  className="text-accent underline-offset-4 hover:underline"
                >
                  {workflow.name}
                </Link>
              ) : (
                execution.workflow_id
              )}
            </p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-muted">Execution ID</p>
            <p className="mt-1 break-all font-mono text-sm">{execution.id}</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Tasks</CardTitle>
        </CardHeader>
        <CardContent>
          {taskRunsLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, index) => (
                <Skeleton key={index} className="h-16 w-full" />
              ))}
            </div>
          ) : taskRunsError ? (
            <ErrorState
              title="Couldn't load task runs"
              message={
                taskRunsErr instanceof ApiError && taskRunsErr.status === 404
                  ? 'This execution may have been removed.'
                  : 'The server could not be reached. Please try again.'
              }
              onRetry={refetchTaskRuns}
            />
          ) : !taskRuns || taskRuns.length === 0 ? (
            <EmptyState
              icon={ListTodo}
              title="No task runs"
              description="Task runs will appear once the execution starts processing."
            />
          ) : (
            <div className="space-y-3">
              {taskRuns.map((taskRun) => (
                <TaskRunItem key={taskRun.id} taskRun={taskRun} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
