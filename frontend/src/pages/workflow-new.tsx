import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import type { Workflow } from '@/api/types'
import { WorkflowForm } from '@/components/workflows/WorkflowForm'
import { PageHeader } from '@/components/shared/PageHeader'
import { Card, CardContent } from '@/components/ui/card'

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
        title="Create workflow"
        description="Create a new workflow and open it in the builder."
      />

      <Card>
        <CardContent className="pt-6">
          <WorkflowForm projectId={projectId ?? ''} onSuccess={handleSuccess} />
        </CardContent>
      </Card>
    </div>
  )
}
