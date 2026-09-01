import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { FolderKanban, Plus, Sparkles } from 'lucide-react'
import { toast } from 'sonner'
import { createProject } from '@/api/projects'
import { createWorkflow } from '@/api/workflows'
import type { WorkflowTask } from '@/api/types'
import { useProjects, projectKeys } from '@/hooks/use-projects'
import { workflowKeys } from '@/hooks/use-workflows'
import { ProjectCard } from '@/components/projects/ProjectCard'
import { CreateProjectDialog } from '@/components/projects/CreateProjectDialog'
import { EmptyState } from '@/components/shared/EmptyState'
import { ErrorState } from '@/components/shared/ErrorState'
import { PageHeader } from '@/components/shared/PageHeader'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'

interface SampleSpec {
  projectName: string
  workflowName: string
  workflowDescription: string
  tasks: WorkflowTask[]
  buttonLabel: string
}

// Example 1: Video Transcription.
// Uses only task types the builtin runtime can execute (delay, transform) so the
// workflow runs to completion when you press Run. The final step is a transform
// that produces the email delivery payload as its output (the runtime does not
// execute an email task, so modelling it as a transform keeps the demo honest and
// runnable end-to-end).
const videoTranscriptionTasks: WorkflowTask[] = [
  {
    id: 'receive_video',
    type: 'delay',
    config: { seconds: 2 },
    depends_on: [],
  },
  {
    id: 'transcribe',
    type: 'transform',
    config: {
      output: {
        transcript:
          'The quick brown fox jumps over the lazy dog — this is the transcribed audio from the uploaded video.',
      },
    },
    depends_on: ['receive_video'],
  },
  {
    id: 'format_transcript',
    type: 'transform',
    config: {
      output: {
        formatted: '## Transcript\n\nThe quick brown fox jumps over the lazy dog.',
      },
    },
    depends_on: ['transcribe'],
  },
  {
    id: 'send_email',
    type: 'transform',
    config: {
      output: {
        to: 'you@example.com',
        subject: 'Transcription complete',
        body: 'Your video has been transcribed. See the formatted transcript in the run output.',
      },
    },
    depends_on: ['format_transcript'],
  },
]

// Example 2: Support ticket triage.
// A different workflow pattern — it includes a conditional decision node that
// checks ticket priority before routing to the right team. Uses only
// runtime-executable task types (delay, transform, conditional).
const supportTriageTasks: WorkflowTask[] = [
  {
    id: 'receive_ticket',
    type: 'delay',
    config: { seconds: 2 },
    depends_on: [],
  },
  {
    id: 'classify_ticket',
    type: 'transform',
    config: {
      output: {
        category: 'billing',
        priority: 'high',
      },
    },
    depends_on: ['receive_ticket'],
  },
  {
    id: 'check_priority',
    type: 'conditional',
    config: {
      field: 'priority',
      equals: 'high',
      condition: 'data.priority === "high"',
    },
    depends_on: ['classify_ticket'],
  },
  {
    id: 'route_ticket',
    type: 'transform',
    config: {
      output: {
        assigned_team: 'billing-support',
        escalation: true,
        message:
          'High-priority billing ticket detected. Escalated to the billing-support team.',
      },
    },
    depends_on: ['check_priority'],
  },
]

const samples: SampleSpec[] = [
  {
    projectName: 'Video Transcription',
    workflowName: 'Transcribe uploaded video',
    workflowDescription:
      'Process an uploaded video: receive it, transcribe the audio, format the transcript, and produce the email delivery payload.',
    tasks: videoTranscriptionTasks,
    buttonLabel: 'Sample: Video Transcription',
  },
  {
    projectName: 'Support Triage',
    workflowName: 'Triage inbound support ticket',
    workflowDescription:
      'Simulate an inbound support ticket: receive it, classify the issue, check whether it is high priority, then route it to the right team.',
    tasks: supportTriageTasks,
    buttonLabel: 'Sample: Support Triage',
  },
]

function SampleProjectButton({ spec }: { spec: SampleSpec }) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [pending, setPending] = useState(false)

  const handleCreate = async () => {
    setPending(true)
    try {
      const project = await createProject({ name: spec.projectName })
      const workflow = await createWorkflow(project.id, {
        name: spec.workflowName,
        description: spec.workflowDescription,
        definition: { tasks: spec.tasks },
      })
      queryClient.invalidateQueries({ queryKey: projectKeys.lists() })
      queryClient.invalidateQueries({ queryKey: workflowKeys.list(project.id) })
      toast.success('Sample workflow created')
      navigate(`/app/projects/${project.id}/workflows/${workflow.id}`)
    } catch {
      toast.error('Could not create the sample workflow.')
    } finally {
      setPending(false)
    }
  }

  return (
    <Button variant="outline" size="sm" onClick={handleCreate} loading={pending}>
      <Sparkles className="mr-2 h-4 w-4" aria-hidden="true" />
      {spec.buttonLabel}
    </Button>
  )
}

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
        actions={
          <>
            {samples.map((spec) => (
              <SampleProjectButton key={spec.projectName} spec={spec} />
            ))}
            <CreateProjectDialog />
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
