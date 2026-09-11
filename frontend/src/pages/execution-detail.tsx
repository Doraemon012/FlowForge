import { useMemo } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, History, ListTodo, RotateCcw, ScrollText, Square, Waypoints } from 'lucide-react'
import { toast } from 'sonner'
import { ApiError } from '@/api/client'
import { useProject } from '@/hooks/use-projects'
import { useWorkflow, useWorkflowVersion } from '@/hooks/use-workflows'
import {
  isExecutionActive,
  useCancelExecution,
  useCreateExecution,
  useExecution,
  useExecutionAttempts,
  useExecutionEvents,
  useExecutionLogs,
  useTaskRuns,
} from '@/hooks/use-executions'
import { AttemptHistory } from '@/components/executions/AttemptHistory'
import { ExecutionStatusBadge } from '@/components/executions/ExecutionStatusBadge'
import { RunDiagnosis as RunDiagnosisPanel } from '@/components/executions/RunDiagnosis'
import { TaskRunItem } from '@/components/executions/TaskRunItem'
import { EmptyState } from '@/components/shared/EmptyState'
import { ErrorState } from '@/components/shared/ErrorState'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { diagnoseRun } from '@/lib/run-diagnosis'
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
  const {
    data: attempts,
    isLoading: attemptsLoading,
    isError: attemptsError,
    error: attemptsErr,
    refetch: refetchAttempts,
  } = useExecutionAttempts(executionId ?? '')
  const { data: events, isLoading: eventsLoading } = useExecutionEvents(executionId ?? '')
  const { data: logs, isLoading: logsLoading } = useExecutionLogs(executionId ?? '')
  const { data: workflow } = useWorkflow(projectId ?? '', execution?.workflow_id ?? '')
  const { data: workflowVersion } = useWorkflowVersion(
    projectId ?? '',
    execution?.workflow_id ?? '',
    execution?.workflow_version_id ?? '',
  )

  const navigate = useNavigate()
  const createExecutionMutation = useCreateExecution(
    projectId ?? '',
    execution?.workflow_id ?? '',
  )
  const cancelExecutionMutation = useCancelExecution(executionId ?? '', projectId ?? '')

  // Explain the failure by correlating the task runs with the dependency graph
  // of the exact version that ran. Everything is derived from data already on
  // the page, so the diagnosis never needs an extra request.
  const diagnosis = useMemo(
    () => diagnoseRun(workflowVersion?.definition, taskRuns ?? []),
    [workflowVersion?.definition, taskRuns],
  )

  const handleCancel = async () => {
    if (!execution) return
    try {
      await cancelExecutionMutation.mutateAsync()
      toast.success('Run cancelled')
    } catch (error) {
      if (error instanceof ApiError) {
        toast.error(error.message)
      } else {
        toast.error('Could not cancel the run.')
      }
    }
  }

  const handleRunAgain = async () => {
    if (!execution) return
    try {
      // Re-run the exact version that failed with the exact same input, so
      // "run again" reproduces the run instead of using whatever happens to be
      // active now with empty input. Replaying the input is what makes a
      // fix-and-re-run meaningful: the failure can actually be reproduced and
      // the fix verified against the same data.
      const created = await createExecutionMutation.mutateAsync({
        version_id: execution.workflow_version_id,
        input: execution.input ?? {},
      })
      toast.success('New run started')
      navigate(`/app/projects/${projectId}/executions/${created.id}`)
    } catch (error) {
      if (error instanceof ApiError) {
        toast.error(error.message)
      } else {
        toast.error('Could not start a new run.')
      }
    }
  }

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
              <span className="lbl">Version</span>
              <span className="val">
                {workflowVersion
                  ? `Version ${workflowVersion.version_number}`
                  : `${execution.workflow_version_id.slice(0, 12)}…`}
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

      {workflow ? (
        <div className="flex flex-wrap items-center gap-2">
          {/*
            Stop the run while it is still active. Cancelling is the one action
            that is only available in-flight: it marks the execution cancelled
            and cancels any task that has not started yet. The button
            disappears as soon as the run settles (the page polls status) and
            "Run again" takes its place as the recovery action.
          */}
          {isExecutionActive(execution.status) ? (
            <Button
              onClick={handleCancel}
              loading={cancelExecutionMutation.isPending}
              disabled={cancelExecutionMutation.isPending}
              size="sm"
              variant="outline"
            >
              <Square className="mr-2 h-4 w-4" aria-hidden="true" />
              Cancel run
            </Button>
          ) : null}
          {/*
            Only offer "Run again" once the run has reached a terminal state.
            While it is still pending/running, re-running would start a second
            execution of the same version concurrently, which is not a recovery
            action - the user should wait for the current run (the button
            reappears as soon as it settles, since the page polls status).
          */}
          {!isExecutionActive(execution.status) ? (
            <Button
              onClick={handleRunAgain}
              loading={createExecutionMutation.isPending}
              disabled={createExecutionMutation.isPending}
              size="sm"
            >
              <RotateCcw className="mr-2 h-4 w-4" aria-hidden="true" />
              Run again
            </Button>
          ) : null}
          <Button asChild variant="outline" size="sm">
            <Link to={`/app/projects/${projectId}/workflows/${workflow.id}`}>
              Open in builder
            </Link>
          </Button>
        </div>
      ) : null}

      {workflow && diagnosis.hasFindings ? (
        <RunDiagnosisPanel
          projectId={projectId ?? ''}
          workflowId={workflow.id}
          diagnosis={diagnosis}
        />
      ) : null}

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Waypoints className="h-4 w-4" aria-hidden="true" />
              Events
            </CardTitle>
          </CardHeader>
          <CardContent>
            {eventsLoading ? (
              <Skeleton className="h-24 w-full" />
            ) : !events || events.length === 0 ? (
              <EmptyState
                icon={Waypoints}
                title="No events yet"
                description="Lifecycle events will appear as the execution is queued, claimed, and completed."
              />
            ) : (
              <div className="max-h-80 space-y-3 overflow-y-auto">
                {events.map((event) => (
                  <div key={event.id} className="border-b border-border pb-3 last:border-0 last:pb-0">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-mono text-xs font-medium">{event.event_type}</span>
                      <span className="text-xs text-muted">{formatDateTime(event.created_at)}</span>
                    </div>
                    <p className="mt-1 text-xs text-muted">
                      {event.task_id ? `Task ${event.task_id}` : 'Execution'}
                      {event.worker_id ? ` · Worker ${event.worker_id}` : ''}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ScrollText className="h-4 w-4" aria-hidden="true" />
              Worker logs
            </CardTitle>
          </CardHeader>
          <CardContent>
            {logsLoading ? (
              <Skeleton className="h-24 w-full" />
            ) : !logs || logs.length === 0 ? (
              <EmptyState
                icon={ScrollText}
                title="No logs yet"
                description="Worker activity will appear here when a worker claims this execution."
              />
            ) : (
              <div className="max-h-80 space-y-3 overflow-y-auto">
                {logs.map((log) => (
                  <div key={log.id} className="border-b border-border pb-3 last:border-0 last:pb-0">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-xs font-medium uppercase">{log.severity} · {log.source}</span>
                      <span className="text-xs text-muted">{formatDateTime(log.created_at)}</span>
                    </div>
                    <p className="mt-1 text-sm">{log.message}</p>
                    <p className="mt-1 text-xs text-muted">
                      {log.task_id ? `Task ${log.task_id}` : 'Execution'}
                      {log.worker_id ? ` · Worker ${log.worker_id}` : ''}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

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
                <TaskRunItem
                  key={taskRun.id}
                  taskRun={taskRun}
                  attempts={attempts?.filter((attempt) => attempt.task_run_id === taskRun.id)}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Attempts</CardTitle>
        </CardHeader>
        <CardContent>
          {attemptsLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 2 }).map((_, index) => (
                <Skeleton key={index} className="h-20 w-full" />
              ))}
            </div>
          ) : attemptsError ? (
            attemptsErr instanceof ApiError && attemptsErr.status === 501 ? (
              <p className="text-sm text-muted">
                Attempt history is not available for this deployment.
              </p>
            ) : (
              <ErrorState
                title="Couldn't load attempt history"
                message={
                  attemptsErr instanceof ApiError && attemptsErr.status === 404
                    ? 'This execution may have been removed.'
                    : 'The server could not be reached. Please try again.'
                }
                onRetry={refetchAttempts}
              />
            )
          ) : !attempts || attempts.length === 0 ? (
            <EmptyState
              icon={History}
              title="No attempts yet"
              description="Attempt history will appear once tasks begin executing."
            />
          ) : (
            <AttemptHistory attempts={attempts} />
          )}
        </CardContent>
      </Card>
    </div>
  )
}
