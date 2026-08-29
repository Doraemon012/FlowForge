import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, PlayCircle } from 'lucide-react'
import { ApiError } from '@/api/client'
import { useProject } from '@/hooks/use-projects'
import { useWorkflows } from '@/hooks/use-workflows'
import { useExecutions } from '@/hooks/use-executions'
import { ExecutionCard } from '@/components/executions/ExecutionCard'
import { EmptyState } from '@/components/shared/EmptyState'
import { ErrorState } from '@/components/shared/ErrorState'
import { PageHeader } from '@/components/shared/PageHeader'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'

function ExecutionSkeleton() {
  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="flex items-center gap-3">
        <Skeleton className="h-9 w-9 rounded-md" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-3 w-1/3" />
        </div>
      </div>
    </div>
  )
}

export function ExecutionsPage() {
  const { projectId } = useParams<{ projectId: string }>()
  const {
    data: project,
    isLoading: projectLoading,
    isError: projectError,
    error: projectErr,
    refetch: refetchProject,
  } = useProject(projectId ?? '')
  const { data: workflows } = useWorkflows(projectId ?? '')
  const {
    data: executions,
    isLoading,
    isError,
    error,
    refetch,
  } = useExecutions(projectId ?? '')

  if (projectLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-8 w-1/2" />
        <Skeleton className="h-4 w-1/3" />
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, index) => (
            <ExecutionSkeleton key={index} />
          ))}
        </div>
      </div>
    )
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

  const workflowNames = new Map<string, string>()
  for (const workflow of workflows ?? []) {
    workflowNames.set(workflow.id, workflow.name)
  }

  return (
    <div className="space-y-6">
      <Link
        to={`/app/projects/${projectId}`}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Project overview
      </Link>

      <PageHeader
        title="Execution history"
        description={`${project?.name ?? 'Project'} executions`}
        actions={
          <Button asChild variant="outline" size="sm">
            <Link to={`/app/projects/${projectId}/workflows`}>Back to workflows</Link>
          </Button>
        }
      />

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, index) => (
            <ExecutionSkeleton key={index} />
          ))}
        </div>
      ) : isError ? (
        <ErrorState
          title="Couldn't load executions"
          message={
            error instanceof ApiError && error.status === 404
              ? 'This project may have been archived or removed.'
              : 'The server could not be reached. Please try again.'
          }
          onRetry={refetch}
        />
      ) : !executions || executions.length === 0 ? (
        <EmptyState
          icon={PlayCircle}
          title="No executions yet"
          description="Run a workflow to see its executions here."
          action={
            <Button asChild variant="outline" size="sm">
              <Link to={`/app/projects/${projectId}/workflows`}>Open workflows</Link>
            </Button>
          }
        />
      ) : (
        <div className="space-y-3">
          {executions.map((execution) => (
            <ExecutionCard
              key={execution.id}
              projectId={projectId ?? ''}
              execution={execution}
              workflowName={workflowNames.get(execution.workflow_id) ?? execution.workflow_id}
            />
          ))}
        </div>
      )}
    </div>
  )
}
