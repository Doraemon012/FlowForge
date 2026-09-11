import type { WorkflowDefinition, WorkflowTask } from '@/api/types'

/**
 * A ready-to-run starting point for a new workflow. Templates exist so a new
 * user can go from "no workflows" to a working, runnable pipeline without
 * having to design a task graph from a blank canvas first.
 *
 * Every template is a plain `WorkflowDefinition`, so creating one is the same
 * request a user could make by hand — there is no template-only code path.
 * Each definition is valid against the server's rules (supported task types,
 * required task config, acyclic dependencies) and is also checked by the
 * frontend test suite so a template can never ship broken.
 */
export interface WorkflowTemplate {
  id: string
  name: string
  /** One line shown on the template card. */
  summary: string
  /** Longer "what it does / how to use it" copy shown in the card body. */
  description: string
  /** Task-type tags, used for quick scanning and grouping. */
  tags: string[]
  definition: WorkflowDefinition
}

const NOTIFICATION_RECIPIENT = 'ops@example.com'
const SENDER = 'flowforge@example.com'

function tasks(...items: WorkflowTask[]): WorkflowDefinition {
  return { tasks: items }
}

/**
 * Starter workflows. Ordered deliberately: the first is the simplest "fetch →
 * shape → notify" pipeline, the rest add branching, timing, and event-driven
 * patterns.
 */
export const WORKFLOW_TEMPLATES: WorkflowTemplate[] = [
  {
    id: 'api-fetch-and-notify',
    name: 'Fetch an API and email a summary',
    summary: 'Call an external API, reshape the response, then send an email.',
    description:
      'The simplest end-to-end pipeline: an HTTP task calls an API, a transform task reshapes the response, and an email task reports the result. The transform receives the HTTP task\u2019s output as its input.',
    tags: ['http', 'transform', 'email'],
    definition: tasks(
      {
        id: 'fetch',
        type: 'http',
        config: { url: 'https://httpbin.org/json', method: 'GET' },
        depends_on: [],
      },
      {
        id: 'summarize',
        type: 'transform',
        config: { output: { summary: 'Fetched a payload from httpbin' } },
        depends_on: ['fetch'],
      },
      {
        id: 'notify',
        type: 'email',
        config: {
          to: NOTIFICATION_RECIPIENT,
          from: SENDER,
          subject: 'Workflow finished: fetch-and-notify',
          body: 'The fetch-and-notify workflow completed successfully.',
        },
        depends_on: ['summarize'],
      },
    ),
  },
  {
    id: 'status-guard',
    name: 'Check an API status and branch on it',
    summary: 'Call a health endpoint, evaluate its status code, then notify.',
    description:
      'Demonstrates the conditional task. The HTTP task\u2019s output (including status_code) becomes the conditional task\u2019s input, which evaluates the field and emits a boolean. Note: a conditional produces a result but does not gate downstream tasks.',
    tags: ['http', 'conditional', 'email'],
    definition: tasks(
      {
        id: 'check',
        type: 'http',
        config: { url: 'https://httpbin.org/status/200', method: 'GET' },
        depends_on: [],
      },
      {
        id: 'evaluate',
        type: 'conditional',
        config: { field: 'status_code', operator: 'gte', value: 500 },
        depends_on: ['check'],
      },
      {
        id: 'report',
        type: 'email',
        config: {
          to: 'oncall@example.com',
          from: SENDER,
          subject: 'Health check finished',
          body: 'Read the evaluate task output for the boolean result of the status check.',
        },
        depends_on: ['evaluate'],
      },
    ),
  },
  {
    id: 'scheduled-digest',
    name: 'Scheduled digest',
    summary: 'Assemble a payload, wait, then email it. Pair with a schedule.',
    description:
      'A timed pipeline: a transform builds a payload, a delay waits, then an email sends it. Add a schedule trigger from the workflow\u2019s Triggers dialog to run it automatically.',
    tags: ['transform', 'delay', 'email'],
    definition: tasks(
      {
        id: 'assemble',
        type: 'transform',
        config: { output: { title: 'Daily digest', items: [] } },
        depends_on: [],
      },
      {
        id: 'pause',
        type: 'delay',
        config: { seconds: 2 },
        depends_on: ['assemble'],
      },
      {
        id: 'send',
        type: 'email',
        config: {
          to: 'team@example.com',
          from: SENDER,
          subject: 'Daily digest',
          body: 'Replace this body with your digest content.',
        },
        depends_on: ['pause'],
      },
    ),
  },
  {
    id: 'webhook-relay',
    name: 'Webhook relay',
    summary: 'Normalize an incoming payload and forward it downstream.',
    description:
      'An event-driven pipeline: a transform normalizes the incoming execution input, an HTTP task forwards a payload to another service, and a final transform confirms it. Add a webhook trigger to drive it with real events.',
    tags: ['http', 'transform'],
    definition: tasks(
      {
        id: 'normalize',
        type: 'transform',
        config: { output: { event: 'received', source: 'flowforge' } },
        depends_on: [],
      },
      {
        id: 'forward',
        type: 'http',
        config: {
          url: 'https://httpbin.org/post',
          method: 'POST',
          body: '{"relayed":true}',
          headers: { 'Content-Type': 'application/json' },
        },
        depends_on: ['normalize'],
      },
      {
        id: 'confirm',
        type: 'transform',
        config: { output: { relayed: true } },
        depends_on: ['forward'],
      },
    ),
  },
]

export function getTemplateById(id: string): WorkflowTemplate | undefined {
  return WORKFLOW_TEMPLATES.find((template) => template.id === id)
}

/** A short "3 tasks" style label for a template card. */
export function templateTaskCount(template: WorkflowTemplate): number {
  return template.definition.tasks.length
}
