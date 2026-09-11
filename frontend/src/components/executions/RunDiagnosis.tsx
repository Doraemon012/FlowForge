import { Link } from 'react-router-dom'
import { AlertTriangle, ArrowRight, Wrench } from 'lucide-react'
import type { RunDiagnosis as RunDiagnosisResult } from '@/lib/run-diagnosis'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

function taskLink(projectId: string, workflowId: string, taskId: string): string {
  return `/app/projects/${projectId}/workflows/${workflowId}?task=${encodeURIComponent(taskId)}`
}

interface TaskTokenProps {
  taskId: string
  projectId: string
  workflowId: string
  tone?: 'default' | 'failed' | 'muted'
}

function TaskToken({ taskId, projectId, workflowId, tone = 'default' }: TaskTokenProps) {
  const toneClass =
    tone === 'failed'
      ? 'border-failed/30 bg-failed/10 text-failed'
      : tone === 'muted'
        ? 'border-border bg-surface-2 text-muted'
        : 'border-border bg-surface-2 text-foreground'
  return (
    <Link
      to={taskLink(projectId, workflowId, taskId)}
      className={`inline-flex items-center rounded-md border px-1.5 py-0.5 font-mono text-xs transition-colors hover:border-accent-dim hover:text-accent ${toneClass}`}
      title={`Open ${taskId} in the builder`}
    >
      {taskId}
    </Link>
  )
}

interface RunDiagnosisProps {
  projectId: string
  workflowId: string
  diagnosis: RunDiagnosisResult
}

/**
 * Explains why an execution failed and routes the user straight to the fix.
 *
 * The task runs and the workflow definition are enough to reconstruct the
 * causal chain: which task broke, which downstream tasks it took with it, and
 * which tasks never got the chance to run. Each task is a link into the builder
 * with that task focused, so "what went wrong" and "where to fix it" are one
 * step apart.
 */
export function RunDiagnosis({ projectId, workflowId, diagnosis }: RunDiagnosisProps) {
  if (!diagnosis.hasFindings || !diagnosis.summary) return null

  const { failed, blocked, neverRan, rootCause } = diagnosis
  const otherFailures = failed.filter((task) => task !== rootCause)

  return (
    <Card className="border-warning/40 bg-warning/[0.04]">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-warning" aria-hidden="true" />
          Run diagnosis
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm font-medium text-foreground">{diagnosis.summary}</p>

        {rootCause ? (
          <div className="rounded-lg border border-failed/30 bg-failed/5 p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-failed">
              Root cause
            </p>
            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              <TaskToken
                taskId={rootCause.taskId}
                projectId={projectId}
                workflowId={workflowId}
                tone="failed"
              />
              <span className="text-sm text-muted">
                {rootCause.poisonedBy.length > 0
                  ? 'failed after an upstream task did not succeed'
                  : 'failed on its own'}
              </span>
            </div>
            {rootCause.reason ? (
              <p className="mt-2 break-words font-mono text-xs text-failed">
                {rootCause.reason}
              </p>
            ) : null}
            <Link
              to={taskLink(projectId, workflowId, rootCause.taskId)}
              className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-accent underline-offset-4 hover:underline"
            >
              <Wrench className="h-4 w-4" aria-hidden="true" />
              Fix {rootCause.taskId} in the builder
            </Link>
          </div>
        ) : null}

        {otherFailures.length > 0 ? (
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">
              Other failures
            </p>
            <ul className="mt-1.5 space-y-1">
              {otherFailures.map((task) => (
                <li key={task.taskId} className="flex flex-wrap items-center gap-2 text-sm">
                  <TaskToken
                    taskId={task.taskId}
                    projectId={projectId}
                    workflowId={workflowId}
                    tone="failed"
                  />
                  {task.poisonedBy.length > 0 ? (
                    <span className="text-muted">
                      after{' '}
                      {task.poisonedBy.map((dependencyId) => (
                        <TaskToken
                          key={dependencyId}
                          taskId={dependencyId}
                          projectId={projectId}
                          workflowId={workflowId}
                          tone="muted"
                        />
                      ))}
                    </span>
                  ) : null}
                  {task.reason ? (
                    <span className="break-words font-mono text-xs text-muted">{task.reason}</span>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {blocked.length > 0 ? (
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">
              Never ran because a dependency failed
            </p>
            <ul className="mt-1.5 space-y-1">
              {blocked.map((task) => (
                <li key={task.taskId} className="flex flex-wrap items-center gap-1.5 text-sm">
                  <TaskToken taskId={task.taskId} projectId={projectId} workflowId={workflowId} />
                  {task.blockedBy.length > 0 ? (
                    <>
                      <ArrowRight className="h-3.5 w-3.5 text-muted" aria-hidden="true" />
                      <span className="text-muted">blocked by</span>
                      {task.blockedBy.map((dependencyId) => (
                        <TaskToken
                          key={dependencyId}
                          taskId={dependencyId}
                          projectId={projectId}
                          workflowId={workflowId}
                          tone="failed"
                        />
                      ))}
                    </>
                  ) : (
                    <span className="text-muted">did not run</span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {blocked.length === 0 && neverRan.length > 0 ? (
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">Never ran</p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {neverRan.map((taskId) => (
                <TaskToken
                  key={taskId}
                  taskId={taskId}
                  projectId={projectId}
                  workflowId={workflowId}
                  tone="muted"
                />
              ))}
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}
