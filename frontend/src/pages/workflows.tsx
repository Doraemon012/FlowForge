import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, Plus, Workflow as WorkflowIcon } from 'lucide-react'
import { ApiError } from '@/api/client'
import { useProject } from '@/hooks/use-projects'
import { useWorkflows } from '@/hooks/use-workflows'
import { WorkflowCard } from '@/components/workflows/WorkflowCard'
import { EmptyState } from '@/components/shared/EmptyState'
import { ErrorState } from '@/components/shared/ErrorState'
import { PageHeader } from '@/components/shared/PageHeader'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'

function WorkflowSkeleton() {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-border bg-surface p-4">
      <Skeleton className="h-9 w-9 rounded-lg" />
      <div className="flex-1 space-y-2">
        <Skeleton className="h-4 w-1/2" />
        <Skeleton className="h-3 w-1/3" />
      </div>
    </div>
  )
}

export function WorkflowsPage() {
  const { projectId } = useParams<{ projectId: string }>()
  const { data: project, isLoading: projectLoading, isError: projectError, error: projectErr, refetch: refetchProject } = useProject(projectId ?? '')
  const { data: workflows, isLoading, isError, error, refetch } = useWorkflows(projectId ?? '')

  if (projectLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-8 w-1/2" />
        <Skeleton className="h-4 w-1/3" />
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <WorkflowSkeleton key={index} />
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

  return (
    <div className="space-y-6">
      <Link
        to="/app/projects"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Projects
      </Link>

      <PageHeader
        title={`${project?.name ?? 'Project'} workflows`}
        description="Workflows turn a sequence of tasks into a repeatable execution."
        actions={
          <Button asChild>
            <Link to={`/app/projects/${projectId}/workflows/new`}>
              <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
              New workflow
            </Link>
          </Button>
        }
      />

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, index) => (
            <WorkflowSkeleton key={index} />
          ))}
        </div>
      ) : isError ? (
        <ErrorState
          title="Couldn't load workflows"
          message={
            error instanceof ApiError && error.status === 404
              ? 'This project may have been archived or removed.'
              : 'The server could not be reached. Please try again.'
          }
          onRetry={refetch}
        />
      ) : !workflows || workflows.length === 0 ? (
        // One creation surface: templates and the blank workflow both live on
        // the new-workflow page, so there is a single obvious way to start.
        <EmptyState
          icon={WorkflowIcon}
          title="No workflows yet"
          description="A workflow turns a sequence of tasks into a repeatable execution. Start from a ready-made template, or build one from scratch."
          action={
            <Button asChild variant="outline">
              <Link to={`/app/projects/${projectId}/workflows/new`}>
                <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
                Create workflow
              </Link>
            </Button>
          }
        />
      ) : (
        <div className="space-y-3">
          {workflows.map((workflow) => (
            <WorkflowCard key={workflow.id} projectId={projectId ?? ''} workflow={workflow} />
          ))}
        </div>
      )}
    </div>
  )
}
