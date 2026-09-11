import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, GitBranch, PlayCircle } from 'lucide-react'
import { toast } from 'sonner'
import { ApiError } from '@/api/client'
import { useWorkflow, useListVersions, useActivateWorkflowVersion, useDeactivateWorkflow } from '@/hooks/use-workflows'
import { EmptyState } from '@/components/shared/EmptyState'
import { ErrorState } from '@/components/shared/ErrorState'
import { PageHeader } from '@/components/shared/PageHeader'
import { WorkflowVersionDetailsDialog } from '@/components/workflows/WorkflowVersionDetailsDialog'
import { WorkflowVersionCompareDialog } from '@/components/workflows/WorkflowVersionCompareDialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { formatDateTime } from '@/lib/utils'

function VersionSkeleton() {
  return (
    <div className="rounded-xl border border-border/80 bg-card p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-3 w-24" />
        </div>
        <Skeleton className="h-8 w-24" />
      </div>
    </div>
  )
}

export function WorkflowVersionsPage() {
  const { projectId, workflowId } = useParams<{ projectId: string; workflowId: string }>()
  const { data: workflow, isLoading: workflowLoading, isError: workflowError, error: workflowErr, refetch: refetchWorkflow } = useWorkflow(projectId ?? '', workflowId ?? '')
  const { data: versions, isLoading: versionsLoading, isError: versionsError, error: versionsErr, refetch: refetchVersions } = useListVersions(projectId ?? '', workflowId ?? '')
  const activateMutation = useActivateWorkflowVersion(projectId ?? '', workflowId ?? '')
  const deactivateMutation = useDeactivateWorkflow(projectId ?? '', workflowId ?? '')

  const handleActivate = async (versionId: string) => {
    try {
      await activateMutation.mutateAsync(versionId)
      toast.success('Workflow version activated')
    } catch (error) {
      if (error instanceof ApiError) {
        toast.error(error.message)
      } else {
        toast.error('Could not activate this version.')
      }
    }
  }

  const handleDeactivate = async () => {
    if (!workflow?.active_version_id) return
    try {
      await deactivateMutation.mutateAsync(workflow.active_version_id)
      toast.success('Workflow deactivated')
    } catch (error) {
      if (error instanceof ApiError) {
        toast.error(error.message)
      } else {
        toast.error('Could not deactivate the workflow.')
      }
    }
  }

  if (workflowLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-8 w-1/2" />
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <VersionSkeleton key={index} />
          ))}
        </div>
      </div>
    )
  }

  if (workflowError) {
    const notFound = workflowErr instanceof ApiError && workflowErr.status === 404
    return (
      <ErrorState
        title={notFound ? 'Workflow not found' : "Couldn't load this workflow"}
        message={
          notFound
            ? 'This workflow may have been removed or is in a project you cannot access.'
            : 'The server could not be reached. Please try again.'
        }
        onRetry={refetchWorkflow}
      />
    )
  }

  return (
    <div className="space-y-6">
      <Link
        to={`/app/projects/${projectId}/workflows/${workflowId}`}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Workflow
      </Link>

      <PageHeader
        title={`${workflow?.name ?? 'Workflow'} versions`}
        description="Published versions of this workflow."
        actions={
          workflow?.active_version_id ? (
            <Button
              variant="destructive"
              size="sm"
              onClick={handleDeactivate}
              loading={deactivateMutation.isPending}
            >
              Deactivate workflow
            </Button>
          ) : null
        }
      />

      {versionsLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <VersionSkeleton key={index} />
          ))}
        </div>
      ) : versionsError ? (
        <ErrorState
          title="Couldn't load versions"
          message={
            versionsErr instanceof ApiError && versionsErr.status === 404
              ? 'This workflow may have been removed.'
              : 'The server could not be reached. Please try again.'
          }
          onRetry={refetchVersions}
        />
      ) : !versions || versions.length === 0 ? (
        <EmptyState
          icon={GitBranch}
          title="No versions yet"
          description="Publish a version from the workflow editor to create an immutable snapshot."
        />
      ) : (
        <div className="space-y-3">
          {versions.map((version, index) => {
            const isActive = workflow?.active_version_id === version.id
            const previousVersion = index > 0 ? versions[index - 1] : undefined
            return (
              <Card key={version.id}>
                <CardContent className="flex items-center justify-between p-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border bg-secondary/50">
                      <GitBranch className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium">Version {version.version_number}</p>
                        {isActive ? (
                          <Badge variant="success">Active</Badge>
                        ) : (
                          <Badge variant="secondary">Published</Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {version.definition?.tasks?.length ?? 0} tasks · {formatDateTime(version.created_at)}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <WorkflowVersionCompareDialog version={version} previousVersion={previousVersion} />
                    <WorkflowVersionDetailsDialog version={version} />
                    {!isActive ? (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleActivate(version.id)}
                        loading={activateMutation.isPending}
                      >
                        <PlayCircle className="mr-2 h-4 w-4" aria-hidden="true" />
                        Activate
                      </Button>
                    ) : null}
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
