import { DocsSection, DocsParagraph } from '@/components/docs/DocsSection'
import { DocsCallout } from '@/components/docs/DocsCallout'
import { DocsVersionBadge } from '@/components/docs/DocsVersionBadge'
import { DocsTable } from '@/components/docs/DocsTable'

export function ExecutionsPage() {
  return (
    <>
      <div className="docs-hero">
        <div className="docs-eyebrow">Guides & References</div>
        <h1 className="docs-title">Executions, task runs & failures</h1>
        <p className="docs-lead">
          An execution is one run of a specific workflow version. Inside it, each task is a
          task run that records its own attempts and outcome.
        </p>
        <div className="docs-hero-badges">
          <DocsVersionBadge label="V1" />
        </div>
      </div>

      <DocsSection title="Execution statuses">
        <DocsTable
          headers={['Status', 'Meaning']}
          rows={[
            ['pending', 'Created but not yet started.'],
            ['running', 'At least one task run is in progress.'],
            ['completed', 'All tasks succeeded.'],
            ['failed', 'A task failed and the workflow stopped.'],
            ['cancel_requested', 'A cancellation was requested; the engine is stopping the run.'],
            ['cancelled', 'The execution was cancelled.'],
            ['timed_out', 'The execution exceeded its time limit.'],
          ]}
        />
      </DocsSection>

      <DocsSection title="Task-run statuses">
        <DocsTable
          headers={['Status', 'Meaning']}
          rows={[
            ['pending', 'Created, waiting to be queued.'],
            ['queued', 'Ready for a worker to claim.'],
            ['running', 'Claimed by a worker and executing.'],
            ['succeeded', 'Completed successfully.'],
            ['failed', 'Failed. May be retried if the error is classified transient.'],
            ['blocked', 'Waiting on a dependency that has not succeeded.'],
          ]}
        />
        <DocsParagraph>
          Additional statuses include <code>retry_scheduled</code>,{' '}
          <code>cancel_requested</code>, <code>cancelled</code>, and{' '}
          <code>timed_out</code>.
        </DocsParagraph>
      </DocsSection>

      <DocsSection title="Execution detail">
        <DocsParagraph>
          The execution detail page shows the header — workflow, pinned version, status, and
          timestamps — followed by the task-run list with outputs and failure reasons, plus
          attempt history for each task run.
        </DocsParagraph>
      </DocsSection>

      <DocsSection title="Failure view">
        <DocsParagraph>
          When a task fails, the detail page shows the failed task, the failure reason,
          attempt information, and a path back to the workflow. Technical details are
          progressively disclosed.
        </DocsParagraph>
      </DocsSection>

      <DocsCallout variant="v1" title="Status is never color alone">
        Execution status is always communicated with text and icons — never color alone —
        so the UI remains accessible and unambiguous.
      </DocsCallout>

      <DocsCallout variant="deferred" title="Frontend gap">
        While the backend exposes execution event and log streaming endpoints, the V1
        frontend surfaces attempt history on execution detail and the execution list with
        polling. Live streaming is not yet in the app.
      </DocsCallout>
    </>
  )
}
