import { DocsSection, DocsParagraph } from '@/components/docs/DocsSection'
import { DocsCallout } from '@/components/docs/DocsCallout'
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
      </div>

      <DocsSection title="Execution statuses">
        <DocsTable
          headers={['Status', 'Meaning']}
          rows={[
            ['pending', 'Created but not yet started.'],
            ['running', 'At least one task run is in progress.'],
            ['completed', 'All tasks succeeded.'],
            ['failed', 'A task failed and the workflow stopped.'],
            ['cancelled', 'Stopped before it finished. Tasks that had not started were cancelled too, and a task already executing is stopped and reported cancelled.'],
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
          <code>cancelled</code>, and <code>timed_out</code>.
        </DocsParagraph>
      </DocsSection>

      <DocsSection title="Execution detail">
        <DocsParagraph>
          The execution detail page shows the header — workflow, pinned version, status, and
          timestamps — followed by the task-run list with outputs and failure reasons, plus
          attempt history for each task run.
        </DocsParagraph>
        <DocsParagraph>
          While a run is pending or running, the page offers a <strong>Cancel run</strong>{' '}
          action. Cancelling marks the execution <code>cancelled</code> and cancels the work
          behind it — tasks that have not started so a worker never claims them, and the one
          executing right now, which stops as soon as its worker notices the released lease.
          A cancelled run never resumes: a late result from the interrupted attempt is
          rejected. Once the run settles, <strong>Run again</strong> becomes the recovery
          action.
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

      <DocsCallout variant="info" title="How the app reads this data">
        The API exposes execution events and logs. The app fetches them by polling, so the
        execution list and detail page always reflect the durable records.
      </DocsCallout>
    </>
  )
}
