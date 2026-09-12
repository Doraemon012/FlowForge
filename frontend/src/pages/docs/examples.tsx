import { Link } from 'react-router-dom'
import { DocsSection, DocsParagraph } from '@/components/docs/DocsSection'
import { DocsCallout } from '@/components/docs/DocsCallout'
import { DocsTable } from '@/components/docs/DocsTable'
import { DocsDiagram } from '@/components/docs/DocsDiagram'
import { DocsCodeBlock } from '@/components/docs/DocsCodeBlock'

export function ExamplesPage() {
  return (
    <>
      <div className="docs-hero">
        <div className="docs-eyebrow">Guides & References</div>
        <h1 className="docs-title">Realistic examples</h1>
        <p className="docs-lead">
          Two complete, runnable workflows built entirely with built-in task types. Both run
          end-to-end with zero external setup.
        </p>
      </div>

      <DocsSection title="Start from a template (in the app)">
        <DocsParagraph>
          You do not have to build a graph from a blank canvas. The workflow empty states,
          the project overview, and the new-workflow page all offer ready-made{' '}
          <strong>starter templates</strong>. Choosing one creates an ordinary workflow with
          that definition already loaded — the exact same request you could make by hand —
          after which you can edit every task, publish, and run it. Each template below is
          validated against the server's rules, so it runs end-to-end without editing.
        </DocsParagraph>
        <DocsTable
          headers={['Template', 'Pipeline', 'Tasks']}
          rows={[
            ['Fetch an API and email a summary', 'http → transform → email', 'fetch, summarize, notify'],
            ['Check an API status and branch on it', 'http → conditional → email', 'check, evaluate, report'],
            ['Scheduled digest', 'transform → delay → email', 'assemble, pause, send'],
            ['Webhook relay', 'transform → http → transform', 'normalize, forward, confirm'],
          ]}
        />
        <DocsCallout variant="info" title="Templates are ordinary workflows">
          Creating from a template is not a special mode: it issues the same create-workflow
          request as building by hand, so the resulting workflow is a normal draft you own,
          version, and run like any other. The two worked examples below show the same
          patterns spelled out task by task.
        </DocsCallout>
      </DocsSection>

      <DocsSection title="Example A — Order notification pipeline">
        <DocsParagraph>
          A pipeline that normalizes an incoming order, routes it based on amount, and then
          waits before the notification gate. Tasks: <code>normalize</code> (transform) →{' '}
          <code>route</code> (conditional) → <code>notify</code> (delay).
        </DocsParagraph>
        <DocsDiagram label="example-a">
          <svg viewBox="0 0 640 160" width="100%" role="img" aria-label="Order notification pipeline DAG">
            {(() => {
              const nodes = [
                { x: 20, y: 56, w: 160, label: 'normalize', sub: 'transform' },
                { x: 250, y: 56, w: 160, label: 'route', sub: 'conditional' },
                { x: 480, y: 56, w: 140, label: 'notify', sub: 'delay' },
              ]
              return (
                <g>
                  {nodes.map((n) => (
                    <g key={n.label}>
                      <rect x={n.x} y={n.y} width={n.w} height={56} rx={8} fill="var(--surface-2)" stroke="var(--border-strong)" />
                      <text x={n.x + n.w / 2} y={n.y + 24} textAnchor="middle" fill="var(--text)" fontSize="12" fontWeight="600">{n.label}</text>
                      <text x={n.x + n.w / 2} y={n.y + 42} textAnchor="middle" fill="var(--muted)" fontSize="10">{n.sub}</text>
                    </g>
                  ))}
                  <path d="M180 84 C210 84, 220 84, 250 84" fill="none" stroke="var(--accent)" strokeWidth="1.6" />
                  <path d="M410 84 C440 84, 450 84, 480 84" fill="none" stroke="var(--accent)" strokeWidth="1.6" />
                </g>
              )
            })()}
          </svg>
        </DocsDiagram>
        <DocsTable
          headers={['Step', 'Task', 'Type', 'Purpose']}
          rows={[
            ['1', 'normalize', 'transform', 'Normalize the incoming order payload.'],
            ['2', 'route', 'conditional', 'Branch based on order amount.'],
            ['3', 'notify', 'delay', 'Wait a short duration before the notification gate.'],
          ]}
        />
        <DocsCodeBlock
          language="json"
          title="workflow definition"
          code={`{
  "tasks": [
    { "id": "normalize", "type": "transform", "config": {}, "depends_on": [] },
    { "id": "route", "type": "conditional", "config": { "field": "amount", "operator": "gte", "value": 100 }, "depends_on": ["normalize"] },
    { "id": "notify", "type": "delay", "config": { "seconds": 30 }, "depends_on": ["route"] }
  ]
}`}
        />
      </DocsSection>

      <DocsSection title="Example B — Support triage">
        <DocsParagraph>
          A triage pipeline classifies an incoming ticket, decides whether to escalate, and
          holds before the next action. Tasks: <code>classify</code> (transform) →{' '}
          <code>escalate</code> (conditional) → <code>hold</code> (delay).
        </DocsParagraph>
        <DocsDiagram label="example-b">
          <svg viewBox="0 0 640 160" width="100%" role="img" aria-label="Support triage DAG">
            {(() => {
              const nodes = [
                { x: 20, y: 56, w: 160, label: 'classify', sub: 'transform' },
                { x: 250, y: 56, w: 160, label: 'escalate', sub: 'conditional' },
                { x: 480, y: 56, w: 140, label: 'hold', sub: 'delay' },
              ]
              return (
                <g>
                  {nodes.map((n) => (
                    <g key={n.label}>
                      <rect x={n.x} y={n.y} width={n.w} height={56} rx={8} fill="var(--surface-2)" stroke="var(--border-strong)" />
                      <text x={n.x + n.w / 2} y={n.y + 24} textAnchor="middle" fill="var(--text)" fontSize="12" fontWeight="600">{n.label}</text>
                      <text x={n.x + n.w / 2} y={n.y + 42} textAnchor="middle" fill="var(--muted)" fontSize="10">{n.sub}</text>
                    </g>
                  ))}
                  <path d="M180 84 C210 84, 220 84, 250 84" fill="none" stroke="var(--accent)" strokeWidth="1.6" />
                  <path d="M410 84 C440 84, 450 84, 480 84" fill="none" stroke="var(--accent)" strokeWidth="1.6" />
                </g>
              )
            })()}
          </svg>
        </DocsDiagram>
        <DocsTable
          headers={['Step', 'Task', 'Type', 'Purpose']}
          rows={[
            ['1', 'classify', 'transform', 'Tag the incoming ticket with a severity.'],
            ['2', 'escalate', 'conditional', 'Decide whether the ticket needs escalation.'],
            ['3', 'hold', 'delay', 'Wait before the next action.'],
          ]}
        />
        <DocsCodeBlock
          language="json"
          title="workflow definition"
          code={`{
  "tasks": [
    { "id": "classify", "type": "transform", "config": {}, "depends_on": [] },
    { "id": "escalate", "type": "conditional", "config": { "field": "priority", "operator": "equals", "equals": "high" }, "depends_on": ["classify"] },
    { "id": "hold", "type": "delay", "config": { "seconds": 15 }, "depends_on": ["escalate"] }
  ]
}`}
        />
        <DocsCallout variant="info" title="Reproduce either example">
          Both examples can be built in the app: create a project, create a workflow, add
          the three tasks, configure the conditional field and comparison, connect them, validate,
          save, publish, and run. Publish activates the version for the run. See the{' '}
          <Link to="/docs/tutorials" className="inline-link">
            step-by-step tutorial
          </Link>{' '}
          for the full walkthrough.
        </DocsCallout>
      </DocsSection>

      <DocsCallout variant="warning" title="Advanced {http, email} variation">
        An advanced variation of these examples uses <code>http</code> (fetch a payload) and{' '}
        <code>email</code> (send a notification). These are real task types but require
        configured credentials and endpoints, so they are not part of the zero-setup
        follow-along demo.
      </DocsCallout>
    </>
  )
}
