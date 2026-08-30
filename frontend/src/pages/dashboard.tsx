import { FolderKanban, Plus, Workflow as WorkflowIcon } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useAuth } from '@/hooks/use-auth'
import { useProjects } from '@/hooks/use-projects'
import { ProjectCard } from '@/components/projects/ProjectCard'
import { CreateProjectDialog } from '@/components/projects/CreateProjectDialog'
import { EmptyState } from '@/components/shared/EmptyState'
import { ErrorState } from '@/components/shared/ErrorState'
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

export function DashboardPage() {
  const { user } = useAuth()
  const { data: projects, isLoading, isError, refetch } = useProjects()

  const firstName = user?.displayName?.split(/\s+/)[0] ?? 'there'
  const projectCount = projects?.length ?? 0

  return (
    <div className="space-y-6">
      <div className="hero-strip">
        <div className="hero-strip-inner">
          <div>
            <h1 className="hero-greet">Good evening, {firstName}</h1>
            <p className="hero-summary">
              You have <b>{projectCount} project{projectCount === 1 ? '' : 's'}</b> in your
              workspace. Create a project to start building durable workflows.
            </p>
            <div className="hero-quick">
              <CreateProjectDialog
                trigger={
                  <button type="button" className="hero-chip">
                    <Plus className="h-3 w-3" aria-hidden="true" />
                    New project
                  </button>
                }
              />
              <Link to="/app/projects" className="hero-chip">
                <WorkflowIcon className="h-3 w-3" aria-hidden="true" />
                Browse projects
              </Link>
            </div>
          </div>
          <div className="page-actions">
            <CreateProjectDialog />
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="proj-strip">
          {Array.from({ length: 3 }).map((_, index) => (
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
                  Create your first project
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
