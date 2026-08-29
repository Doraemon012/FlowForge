import { Link, useParams } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { ApiError } from '@/api/client'
import { useProject } from '@/hooks/use-projects'
import { useWorkflow } from '@/hooks/use-workflows'
import { WorkflowEditor } from '@/components/workflows/WorkflowEditor'
import { ErrorState } from '@/components/shared/ErrorState'
import { PageHeader } from '@/components/shared/PageHeader'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'

function getStatusVariant(status: string): 'success' | 'secondary' | 'warning' | 'info' {
  switch (status) {
    case 'active':
      return 'success'
    case 'paused':
      return 'warning'
    case 'draft':
      return 'secondary'
    default:
      return 'info'
  }
}

function WorkflowDetailSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-4 w-24" />
      <div className="space-y-2">
        <Skeleton className="h-8 w-1/2" />
        <Skeleton className="h-4 w-1/3" />
      </div>
      <div className="rounded-xl border bg-card p-6">
        <Skeleton className="h-5 w-24" />
        <div className="mt-4 space-y-4">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      </div>
    </div>
  )
}

export function WorkflowDetailPage() {
  const { projectId, workflowId } = useParams<{ projectId: string; workflowId: string }>()
  const { data: project } = useProject(projectId ?? '')
  const {
    data: workflow,
    isLoading,
    isError,
    error,
    refetch,
  } = useWorkflow(projectId ?? '', workflowId ?? '')

  if (isLoading) {
    return <WorkflowDetailSkeleton />
  }

  if (isError) {
    const notFound = error instanceof ApiError && error.status === 404
    return (
      <ErrorState
        title={notFound ? 'Workflow not found' : "Couldn't load this workflow"}
        message={
          notFound
            ? 'This workflow may have been removed or is in a project you cannot access.'
            : 'The server could not be reached. Please try again.'
        }
        onRetry={refetch}
      />
    )
  }

  if (!workflow) {
    return null
  }

  return (
    <div className="space-y-6">
      <Link
        to={`/app/projects/${projectId}/workflows`}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Workflows
      </Link>

      <PageHeader
        title={workflow.name}
        description={workflow.description || `Workflow in ${project?.name ?? 'project'}`}
        actions={
          <Badge variant={getStatusVariant(workflow.status)} className="capitalize">
            {workflow.status}
          </Badge>
        }
      />

      <WorkflowEditor key={workflow.id} projectId={projectId ?? ''} workflow={workflow} />
    </div>
  )
}
