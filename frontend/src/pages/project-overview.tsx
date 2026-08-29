import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, ArrowRight, Plus, Workflow as WorkflowIcon } from 'lucide-react'
import { ApiError } from '@/api/client'
import { useProject } from '@/hooks/use-projects'
import { useWorkflows } from '@/hooks/use-workflows'
import { WorkflowCard } from '@/components/workflows/WorkflowCard'
import { EditProjectDialog } from '@/components/projects/EditProjectDialog'
import { DeleteProjectDialog } from '@/components/projects/DeleteProjectDialog'
import { ErrorState } from '@/components/shared/ErrorState'
import { PageHeader } from '@/components/shared/PageHeader'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { formatDate, formatDateTime } from '@/lib/utils'

function ProjectOverviewSkeleton() {
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
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      </div>
    </div>
  )
}

function WorkflowOverviewSkeleton() {
  return (
    <div className="flex items-center gap-3 rounded-lg border p-4">
      <Skeleton className="h-9 w-9 rounded-md" />
      <div className="flex-1 space-y-2">
        <Skeleton className="h-4 w-1/2" />
        <Skeleton className="h-3 w-1/3" />
      </div>
    </div>
  )
}

function getStatusVariant(status: string): 'success' | 'secondary' {
  return status === 'active' ? 'success' : 'secondary'
}

export function ProjectOverviewPage() {
  const { projectId } = useParams<{ projectId: string }>()
  const { data: project, isLoading, isError, error, refetch } = useProject(projectId ?? '')
  const {
    data: workflows,
    isLoading: workflowsLoading,
    isError: workflowsError,
    error: workflowsErr,
    refetch: refetchWorkflows,
  } = useWorkflows(projectId ?? '')

  if (isLoading) {
    return <ProjectOverviewSkeleton />
  }

  if (isError) {
    const notFound = error instanceof ApiError && error.status === 404
    return (
      <ErrorState
        title={notFound ? 'Project not found' : "Couldn't load this project"}
        message={
          notFound
            ? 'This project may have been archived or removed.'
            : 'The server could not be reached. Please try again.'
        }
        onRetry={refetch}
      />
    )
  }

  if (!project) {
    return null
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
        title={project.name}
        description={`Created ${formatDate(project.created_at)}`}
        actions={
          <>
            <Badge variant={getStatusVariant(project.status)} className="capitalize">
              {project.status}
            </Badge>
            <EditProjectDialog project={project} />
            <DeleteProjectDialog project={project} />
          </>
        }
      />

      <Card>
        <CardHeader>
          <CardTitle>Details</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Status</p>
            <p className="mt-1 text-sm font-medium capitalize">{project.status}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Created</p>
            <p className="mt-1 text-sm font-medium">{formatDateTime(project.created_at)}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Updated</p>
            <p className="mt-1 text-sm font-medium">{formatDateTime(project.updated_at)}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Project ID</p>
            <p className="mt-1 font-mono text-sm break-all">{project.id}</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Workflows</CardTitle>
          <Button asChild size="sm" variant="outline">
            <Link to={`/app/projects/${project.id}/workflows`}>
              View all
              <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />
            </Link>
          </Button>
        </CardHeader>
        <CardContent>
          {workflowsLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, index) => (
                <WorkflowOverviewSkeleton key={index} />
              ))}
            </div>
          ) : workflowsError ? (
            <ErrorState
              title="Couldn't load workflows"
              message={
                workflowsErr instanceof ApiError && workflowsErr.status === 404
                  ? 'This project may have been archived or removed.'
                  : 'The server could not be reached. Please try again.'
              }
              onRetry={refetchWorkflows}
            />
          ) : !workflows || workflows.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed px-6 py-12 text-center">
              <WorkflowIcon className="h-10 w-10 text-muted-foreground" aria-hidden="true" />
              <div className="space-y-1">
                <h3 className="text-base font-semibold">No workflows yet</h3>
                <p className="max-w-md text-sm text-muted-foreground">
                  Create a workflow to turn a sequence of tasks into a repeatable execution.
                </p>
              </div>
              <Button asChild variant="outline" size="sm" className="mt-2">
                <Link to={`/app/projects/${project.id}/workflows/new`}>
                  <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
                  Create workflow
                </Link>
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              {workflows.slice(0, 5).map((workflow) => (
                <WorkflowCard key={workflow.id} projectId={project.id} workflow={workflow} />
              ))}
              {workflows.length > 5 ? (
                <Button asChild variant="ghost" size="sm" className="w-full">
                  <Link to={`/app/projects/${project.id}/workflows`}>
                    View all {workflows.length} workflows
                    <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />
                  </Link>
                </Button>
              ) : null}
              <Button asChild variant="ghost" size="sm" className="w-full">
                <Link to={`/app/projects/${project.id}/workflows/new`}>
                  <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
                  Create workflow
                </Link>
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
