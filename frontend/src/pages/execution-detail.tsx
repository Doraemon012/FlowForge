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
      <div className="rounded-xl border bg-card p-6">
        <Skeleton className="h-5 w-24" />
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      </div>
      <div className="rounded-xl border bg-card p-6">
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
    data: project,
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

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">
            {workflow?.name ?? 'Execution'}
          </h1>
          <p className="text-sm text-muted-foreground">{project?.name ?? 'Project'} execution</p>
        </div>
        <ExecutionStatusBadge status={execution.status} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Status</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Status</p>
            <div className="mt-1">
              <ExecutionStatusBadge status={execution.status} />
            </div>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Created</p>
            <p className="mt-1 text-sm font-medium">{formatDateTime(execution.created_at)}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Started</p>
            <p className="mt-1 text-sm font-medium">{formatDateTime(execution.started_at)}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Completed</p>
            <p className="mt-1 text-sm font-medium">{formatDateTime(execution.completed_at)}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Workflow</p>
            <p className="mt-1 text-sm font-medium">
              {workflow ? (
                <Link
                  to={`/app/projects/${projectId}/workflows/${workflow.id}`}
                  className="text-primary underline-offset-4 hover:underline"
                >
                  {workflow.name}
                </Link>
              ) : (
                execution.workflow_id
              )}
            </p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Execution ID</p>
            <p className="mt-1 break-all font-mono text-sm">{execution.id}</p>
          </div>
          {execution.failure_reason ? (
            <div className="sm:col-span-2">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                Failure reason
              </p>
              <p className="mt-1 text-sm font-medium text-destructive">
                {execution.failure_reason}
              </p>
            </div>
          ) : null}
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
