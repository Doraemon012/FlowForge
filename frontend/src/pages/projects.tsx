import { FolderKanban, Plus } from 'lucide-react'
import { useProjects } from '@/hooks/use-projects'
import { ProjectCard } from '@/components/projects/ProjectCard'
import { CreateProjectDialog } from '@/components/projects/CreateProjectDialog'
import { EmptyState } from '@/components/shared/EmptyState'
import { ErrorState } from '@/components/shared/ErrorState'
import { PageHeader } from '@/components/shared/PageHeader'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'

function ProjectSkeleton() {
  return (
    <div className="proj-card" style={{ display: 'block' }}>
      <div className="proj-head" style={{ marginBottom: 12 }}>
        <Skeleton className="h-8 w-8 rounded-lg" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-3 w-1/3" />
        </div>
      </div>
      <div className="proj-stats" style={{ marginTop: 10 }}>
        <div className="space-y-1">
          <Skeleton className="h-3 w-14" />
          <Skeleton className="h-4 w-10" />
        </div>
        <div className="space-y-1">
          <Skeleton className="h-3 w-14" />
          <Skeleton className="h-4 w-12" />
        </div>
      </div>
    </div>
  )
}

export function ProjectsPage() {
  const { data: projects, isLoading, isError, refetch } = useProjects()

  return (
    <div className="space-y-6">
      <PageHeader
        title="Projects"
        description="All projects belonging to your account."
        actions={<CreateProjectDialog />}
      />

      {isLoading ? (
        <div className="proj-strip">
          {Array.from({ length: 6 }).map((_, index) => (
            <ProjectSkeleton key={index} />
          ))}
        </div>
      ) : isError ? (
        <ErrorState
          title="Couldn't load your projects"
          message="The server could not be reached. Please try again."
          onRetry={refetch}
        />
      ) : !projects || projects.length === 0 ? (
        <EmptyState
          icon={FolderKanban}
          title="No projects yet"
          description="Create a project to start building workflows and turning tasks into repeatable executions."
          action={
            <CreateProjectDialog
              trigger={
                <Button>
                  <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
                  Create project
                </Button>
              }
            />
          }
        />
      ) : (
        <div className="proj-strip">
          {projects.map((project) => (
            <ProjectCard key={project.id} project={project} />
          ))}
        </div>
      )}
    </div>
  )
}
