import { useSearchParams } from 'react-router-dom'
import { FolderKanban, Plus } from 'lucide-react'
import { useProjects } from '@/hooks/use-projects'
import { WorkflowGuide, type GuideStep } from '@/components/workflows/WorkflowGuide'
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

const PROJECTS_GUIDE_STEPS: GuideStep[] = [
  {
    id: 'project',
    label: 'Create a project',
    hint: 'Group related workflows under a project.',
    done: false,
  },
  {
    id: 'workflow',
    label: 'Create a workflow',
    hint: 'Open a project and start from a template or a blank canvas.',
    done: false,
  },
  {
    id: 'tasks',
    label: 'Add and configure tasks',
    hint: 'Drag tasks from the palette onto the canvas and configure them.',
    done: false,
  },
  {
    id: 'connect',
    label: 'Connect tasks',
    hint: 'Drag between task handles to set the execution order.',
    done: false,
  },
  {
    id: 'save',
    label: 'Save your changes',
    hint: 'Run stays disabled until the latest edits are saved.',
    done: false,
  },
  {
    id: 'validate',
    label: 'Validate the workflow',
    hint: 'Check the definition before publishing.',
    done: false,
  },
  {
    id: 'publish',
    label: 'Publish and activate',
    hint: 'Publishing snapshots a version; activating makes it runnable.',
    done: false,
  },
  {
    id: 'run',
    label: 'Run the workflow',
    hint: 'Start a manual run of the active version.',
    done: false,
  },
  {
    id: 'inspect',
    label: 'Inspect results and logs',
    hint: 'Open a run to see per-task output and failures.',
    done: false,
  },
]

export function ProjectsPage() {
  const { data: projects, isLoading, isError, refetch } = useProjects()
  const [searchParams, setSearchParams] = useSearchParams()
  const createRequested = searchParams.get('create') === '1'

  const guideSteps: GuideStep[] = PROJECTS_GUIDE_STEPS.map((step) =>
    step.id === 'project' ? { ...step, done: (projects?.length ?? 0) > 0 } : step,
  )

  const handleCreateOpenChange = (open: boolean) => {
    const nextParams = new URLSearchParams(searchParams)
    if (open) {
      nextParams.set('create', '1')
    } else {
      nextParams.delete('create')
    }
    setSearchParams(nextParams)
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Projects"
        description="All projects belonging to your account."
        actions={
          <>
            <WorkflowGuide steps={guideSteps} />
            <CreateProjectDialog
              open={createRequested}
              onOpenChange={handleCreateOpenChange}
            />
          </>
        }
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
              open={createRequested}
              onOpenChange={handleCreateOpenChange}
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
