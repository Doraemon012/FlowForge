import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { FolderKanban, Plus, Sparkles } from 'lucide-react'
import { toast } from 'sonner'
import { createExecution } from '@/api/executions'
import { createProject } from '@/api/projects'
import {
  activateWorkflowVersion,
  createWorkflow,
  publishWorkflow,
  validateWorkflow,
} from '@/api/workflows'
import type { WorkflowTask } from '@/api/types'
import { useProjects, projectKeys } from '@/hooks/use-projects'
import { executionKeys } from '@/hooks/use-executions'
import { workflowKeys } from '@/hooks/use-workflows'
import { WorkflowGuide, type GuideStep } from '@/components/workflows/WorkflowGuide'
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
// that produces the email delivery payload as its output — modelled as a transform
// to keep the demo self-contained and runnable without a configured mailer.
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
      operator: 'equals',
      equals: 'high',
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

// Example 3: Order processing.
// A small chain that demonstrates dependency/output propagation: a delay
// simulates receiving an order, a transform produces order data, a
// conditional evaluates the order total, and a final transform produces the
// approval result. Uses only runtime-executable task types (delay,
// transform, conditional).
const orderProcessingTasks: WorkflowTask[] = [
  {
    id: 'receive_order',
    type: 'delay',
    config: { seconds: 2 },
    depends_on: [],
  },
  {
    id: 'validate_order',
    type: 'transform',
    config: {
      output: {
        order_id: 'ORD-1001',
        total: 250,
        currency: 'USD',
      },
    },
    depends_on: ['receive_order'],
  },
  {
    id: 'check_total',
    type: 'conditional',
    config: {
      field: 'total',
      operator: 'gte',
      value: 200,
    },
    depends_on: ['validate_order'],
  },
  {
    id: 'approve_order',
    type: 'transform',
    config: {
      output: {
        order_id: 'ORD-1001',
        approved: true,
        message:
          'Order ORD-1001 was approved automatically (total $250.00 is at or above the $200 threshold).',
      },
    },
    depends_on: ['check_total'],
  },
]

// Example 4: Overdue invoice reminder.
// A notification-style workflow that demonstrates output propagation into a
// real email task: a transform produces invoice data, a conditional reads a
// field from that output to decide whether the invoice is overdue, and an
// email task sends the reminder. Uses only runtime-executable task types
// (transform, conditional, email).
const invoiceReminderTasks: WorkflowTask[] = [
  {
    id: 'prepare_invoice',
    type: 'transform',
    config: {
      output: {
        invoice_id: 'INV-1042',
        status: 'overdue',
        amount_due: 540,
        customer: 'Acme Corp',
      },
    },
    depends_on: [],
  },
  {
    id: 'check_overdue',
    type: 'conditional',
    config: {
      field: 'status',
      operator: 'equals',
      equals: 'overdue',
    },
    depends_on: ['prepare_invoice'],
  },
  {
    id: 'send_reminder',
    type: 'email',
    config: {
      to: 'billing@example.com',
      subject: 'Invoice INV-1042 is overdue',
      body: 'Invoice INV-1042 for Acme Corp is overdue. Amount due: $540.00.',
    },
    depends_on: ['check_overdue'],
  },
]

// Example 5: Sales consolidation.
// Demonstrates the fan-in pattern: two independent regional transforms run in
// parallel, and a final transform receives BOTH of their outputs as an object
// keyed by dependency task ID. Only runtime-executable task types (transform)
// are used so Run works end-to-end.
const salesConsolidationTasks: WorkflowTask[] = [
  {
    id: 'north_sales',
    type: 'transform',
    config: {
      output: {
        region: 'North',
        revenue: 12000,
        units: 120,
      },
    },
    depends_on: [],
  },
  {
    id: 'south_sales',
    type: 'transform',
    config: {
      output: {
        region: 'South',
        revenue: 8400,
        units: 80,
      },
    },
    depends_on: [],
  },
  {
    id: 'combined_summary',
    type: 'transform',
    config: {},
    depends_on: ['north_sales', 'south_sales'],
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
  {
    projectName: 'Order Processing',
    workflowName: 'Process an incoming order',
    workflowDescription:
      'Simulate an incoming order: receive it, validate the order data, check whether the total is large enough for automatic approval, then produce the approval result.',
    tasks: orderProcessingTasks,
    buttonLabel: 'Sample: Order Processing',
  },
  {
    projectName: 'Invoice Reminders',
    workflowName: 'Send overdue invoice reminder',
    workflowDescription:
      'Prepare invoice data, check whether it is overdue, then send a reminder email to the billing team.',
    tasks: invoiceReminderTasks,
    buttonLabel: 'Sample: Invoice Reminder',
  },
  {
    projectName: 'Sales Consolidation',
    workflowName: 'Combine regional sales',
    workflowDescription:
      'Run two regional sales summaries in parallel, then merge their outputs into one combined result. Demonstrates the fan-in pattern where a downstream task receives the outputs of multiple dependencies keyed by task ID.',
    tasks: salesConsolidationTasks,
    buttonLabel: 'Sample: Sales Consolidation',
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
      // Validate, publish, and activate so the sample is immediately runnable.
      const validation = await validateWorkflow(project.id, workflow.id)
      if (!validation.valid) {
        throw new Error(validation.errors.join('\n'))
      }
      const version = await publishWorkflow(project.id, workflow.id)
      await activateWorkflowVersion(project.id, workflow.id, version.id)
      // Run the freshly activated version so the user immediately sees the
      // workflow execute and its task results instead of having to press Run.
      const execution = await createExecution(project.id, workflow.id, {})
      queryClient.invalidateQueries({ queryKey: projectKeys.lists() })
      queryClient.invalidateQueries({ queryKey: workflowKeys.list(project.id) })
      queryClient.invalidateQueries({
        queryKey: workflowKeys.detail(project.id, workflow.id),
      })
      queryClient.invalidateQueries({ queryKey: executionKeys.list(project.id) })
      toast.success('Sample workflow created, activated, and running')
      navigate(`/app/projects/${project.id}/executions/${execution.id}`)
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
    hint: 'Open a project and create a workflow to start building.',
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
            {samples.map((spec) => (
              <SampleProjectButton key={spec.projectName} spec={spec} />
            ))}
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
