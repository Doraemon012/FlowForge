import { DocsSection, DocsParagraph } from '@/components/docs/DocsSection'
import { DocsCallout } from '@/components/docs/DocsCallout'
import { DocsSteps } from '@/components/docs/DocsSteps'

export function TutorialsPage() {
  return (
    <>
      <div className="docs-hero">
        <div className="docs-eyebrow">Guides & References</div>
        <h1 className="docs-title">Step-by-step tutorial</h1>
        <p className="docs-lead">
          Build the "Order notification pipeline" end-to-end in the app. Every step uses
          built-in task types, so no external setup is needed.
        </p>
      </div>

      <DocsSection title="Build it yourself">
        <DocsParagraph>
          Follow these steps in the app. If the <strong>Run</strong> button is disabled
          at any point, you likely haven't activated a version yet.
        </DocsParagraph>
        <DocsSteps
          steps={[
            {
              title: 'Sign up or log in',
              description: 'Create an account or sign in to access the dashboard.',
            },
            {
              title: 'Create a project',
              description: 'Click Create Project on the dashboard and name it.',
            },
            {
              title: 'Create a workflow',
              description:
                'Open the project, click Create Workflow, and name it "Order notification".',
            },
            {
              title: 'Add the normalize task',
              description: 'Add a transform task named normalize with no dependencies.',
            },
            {
              title: 'Add the route task',
              description:
                'Add a conditional task named route and set depends_on to ["normalize"].',
            },
            {
              title: 'Add the notify task',
              description:
                'Add a delay task named notify with depends_on to ["route"] and config seconds: 30.',
            },
            {
              title: 'Validate',
              description:
                'Click Validate in the builder toolbar. Fix any errors the server reports.',
            },
            {
              title: 'Save',
              description: 'Save the draft to persist your work.',
            },
            {
              title: 'Publish',
              description:
                'Publish to create an immutable version. This does not activate it.',
            },
            {
              title: 'Activate the version',
              description:
                'Go to the Versions page and activate the published version.',
            },
            {
              title: 'Run',
              description:
                'Return to the workflow and click Run. Provide an order input if you like.',
            },
            {
              title: 'Inspect the execution',
              description:
                'Open the execution detail and inspect task runs and attempt history.',
            },
          ]}
        />
      </DocsSection>

      <DocsCallout variant="warning" title="Run button disabled?">
        The most common cause is that no version is <strong>active</strong>. Publish a
        version, then activate it on the Versions page.
      </DocsCallout>
    </>
  )
}
