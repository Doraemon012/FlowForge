import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import type { Workflow } from '@/api/types'
import { WorkflowForm } from '@/components/workflows/WorkflowForm'
import { WorkflowTemplateGallery } from '@/components/workflows/WorkflowTemplateGallery'
import { PageHeader } from '@/components/shared/PageHeader'
import { Card, CardContent } from '@/components/ui/card'

/**
 * The single place a workflow is created. Templates and the blank form live
 * here together so there is one obvious mental model for starting work: pick a
 * runnable example or name a blank workflow, then land in the builder.
 */
export function WorkflowNewPage() {
  const { projectId } = useParams<{ projectId: string }>()
  const navigate = useNavigate()

  const handleSuccess = (workflow: Workflow) => {
    navigate(`/app/projects/${projectId}/workflows/${workflow.id}`)
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
        title="New workflow"
        description="Start from a runnable template, or create a blank workflow and design it yourself. Either way you land in the builder with the definition loaded."
      />

      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold">Start from a template</h2>
          <p className="text-sm text-muted-foreground">
            Runnable examples you can open, run, and modify. Each one becomes an ordinary
            workflow you own.
          </p>
        </div>
        <WorkflowTemplateGallery projectId={projectId ?? ''} onCreated={handleSuccess} />
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold">Or start blank</h2>
          <p className="text-sm text-muted-foreground">
            Name the workflow, then add tasks from the palette and connect them into a graph.
          </p>
        </div>
        <Card>
          <CardContent className="pt-6">
            <WorkflowForm projectId={projectId ?? ''} onSuccess={handleSuccess} />
          </CardContent>
        </Card>
      </section>
    </div>
  )
}
