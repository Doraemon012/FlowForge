import { Link, useParams } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { ApiError } from '@/api/client'
import { useProject } from '@/hooks/use-projects'
import { ErrorState } from '@/components/shared/ErrorState'
import { PageHeader } from '@/components/shared/PageHeader'
import { Badge } from '@/components/ui/badge'
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
    </div>
  )
}

function getStatusVariant(status: string): 'success' | 'secondary' {
  return status === 'active' ? 'success' : 'secondary'
}

export function ProjectOverviewPage() {
  const { projectId } = useParams<{ projectId: string }>()
  const { data: project, isLoading, isError, error, refetch } = useProject(projectId ?? '')

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
          <Badge variant={getStatusVariant(project.status)} className="capitalize">
            {project.status}
          </Badge>
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
    </div>
  )
}
