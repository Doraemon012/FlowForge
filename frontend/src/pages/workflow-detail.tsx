import { useParams } from 'react-router-dom'
import { ApiError } from '@/api/client'
import { useProject } from '@/hooks/use-projects'
import { useWorkflow } from '@/hooks/use-workflows'
import { WorkflowEditor } from '@/components/workflows/WorkflowEditor'
import { ErrorState } from '@/components/shared/ErrorState'
import { Skeleton } from '@/components/ui/skeleton'

function WorkflowDetailSkeleton() {
  return (
    <div className="flex h-[calc(100svh-56px)] flex-col overflow-hidden rounded-xl border border-border/80 bg-card shadow-sm">
      <div className="flex h-14 shrink-0 items-center gap-3 border-b px-3">
        <Skeleton className="h-8 w-8" />
        <Skeleton className="h-8 w-56" />
      </div>
      <div className="flex flex-1">
        <div className="w-56 border-r p-3">
          <Skeleton className="h-8 w-full" />
          <Skeleton className="mt-2 h-8 w-full" />
        </div>
        <div className="flex-1 p-3">
          <Skeleton className="h-full w-full" />
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
    return (
      <div className="-m-6 h-[calc(100svh-56px)]">
        <WorkflowDetailSkeleton />
      </div>
    )
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
    <div className="-m-6 h-[calc(100svh-56px)]" data-project-name={project?.name}>
      <WorkflowEditor key={workflow.id} projectId={projectId ?? ''} workflow={workflow} />
    </div>
  )
}
