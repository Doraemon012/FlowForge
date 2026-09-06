import { Clock, GitBranch, Globe, Mail, Sparkles, type LucideIcon } from 'lucide-react'
import type { Edge, Node } from '@xyflow/react'
import type { WorkflowTask } from '@/api/types'

export const SUPPORTED_TASK_TYPES = ['http', 'transform', 'delay', 'conditional', 'email'] as const
export type SupportedTaskType = (typeof SUPPORTED_TASK_TYPES)[number]

export interface TaskTypeMeta {
  type: SupportedTaskType
  label: string
  description: string
  icon: LucideIcon
  accent: string
}

export const TASK_TYPE_META: Record<SupportedTaskType, TaskTypeMeta> = {
  http: {
    type: 'http',
    label: 'HTTP Request',
    description: 'Call an external API and capture the response',
    icon: Globe,
    accent: 'oklch(0.64 0.13 235)',
  },
  transform: {
    type: 'transform',
    label: 'Transform',
    description: 'Emit a static value or pass input through',
    icon: Sparkles,
    accent: 'oklch(0.72 0.14 190)',
  },
  delay: {
    type: 'delay',
    label: 'Delay',
    description: 'Wait for a duration',
    icon: Clock,
    accent: 'oklch(0.72 0.14 75)',
  },
  conditional: {
    type: 'conditional',
    label: 'Conditional',
    description: 'Branch on a field in the input',
    icon: GitBranch,
    accent: 'oklch(0.70 0.16 160)',
  },
  email: {
    type: 'email',
    label: 'Email',
    description: 'Send an email (logged locally by default)',
    icon: Mail,
    accent: 'oklch(0.60 0.15 340)',
  },
}

export const DEFAULT_CONFIG_BY_TYPE: Record<SupportedTaskType, Record<string, unknown>> = {
  http: {
    url: '',
    method: 'GET',
  },
  transform: {},
  delay: { seconds: 5 },
  conditional: { field: '', operator: 'equals', equals: '', value: '' },
  email: { to: '', subject: '', body: '', from: '' },
}

export interface ConfigFieldSpec {
  key: string
  label: string
  type: 'text' | 'number' | 'textarea' | 'select'
  placeholder?: string
  options?: string[]
  required?: boolean
  help?: string
}

export const TASK_CONFIG_FIELDS: Record<SupportedTaskType, ConfigFieldSpec[]> = {
  http: [
    {
      key: 'url',
      label: 'URL',
      type: 'text',
      placeholder: 'https://api.example.com',
      required: true,
      help: 'The endpoint to call. The response body, headers, and status code are stored in this task\u2019s output.',
    },
    {
      key: 'method',
      label: 'HTTP method',
      type: 'select',
      options: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    },
    {
      key: 'body',
      label: 'Request body (optional)',
      type: 'textarea',
      placeholder: '{"message":"hi"}',
      help: 'Sent as the request body for non-GET requests. Enter JSON text, or a plain string.',
    },
    {
      key: 'headers',
      label: 'Headers (optional)',
      type: 'textarea',
      placeholder: '{"Content-Type":"application/json"}',
      help: 'A JSON object of header name \u2192 value, e.g. {"Content-Type": "application/json"}.',
    },
    {
      key: 'credential',
      label: 'Credential (optional)',
      type: 'text',
      placeholder: 'my-api-key',
      help: 'The name of a configured credential. FlowForge resolves it from the FLOWFORGE_SECRET_<NAME> environment variable. Leave blank to send the request without authentication.',
    },
    {
      key: 'auth',
      label: 'Auth type',
      type: 'select',
      options: ['bearer', 'basic', 'header'],
      help: 'How the credential is attached when a credential is set: bearer adds an Authorization: Bearer header, basic adds a Basic header, header sets a custom header name.',
    },
    {
      key: 'credential_header',
      label: 'Credential header',
      type: 'text',
      placeholder: 'X-API-Key',
      help: 'Only used when auth type is "header". The header that carries the credential value.',
    },
  ],
  transform: [
    {
      key: 'output',
      label: 'Output (JSON)',
      type: 'textarea',
      placeholder: '{"result": 42}',
      help: 'The static JSON value this task produces. If you leave it empty, the task passes its input through unchanged.',
    },
  ],
  delay: [{ key: 'seconds', label: 'Seconds', type: 'number', required: true, help: 'How long to wait before the task succeeds.' }],
  conditional: [
    {
      key: 'field',
      label: 'Field',
      type: 'text',
      placeholder: 'e.g. priority',
      required: true,
      help: 'The input field to read, e.g. "priority". The task resolves against the execution input.',
    },
    {
      key: 'operator',
      label: 'Operator',
      type: 'select',
      options: ['equals', 'not_equals', 'gt', 'lt', 'gte', 'lte', 'contains', 'exists', 'truthy'],
      help: 'How to compare the field value. Use "equals"/"not_equals" with the Equals field, or "gt"/"lt"/"gte"/"lte"/"contains" with the Value field.',
    },
    {
      key: 'equals',
      label: 'Equals',
      type: 'text',
      placeholder: 'e.g. high',
      help: 'Expected value when the operator is "equals" or "not_equals".',
    },
    {
      key: 'value',
      label: 'Value',
      type: 'text',
      placeholder: 'e.g. 5',
      help: 'Comparison value when the operator is gt/lt/gte/lte/contains.',
    },
  ],
  email: [
    {
      key: 'to',
      label: 'To',
      type: 'text',
      placeholder: 'recipient@example.com',
      required: true,
      help: 'Comma-separated recipient addresses.',
    },
    {
      key: 'from',
      label: 'From',
      type: 'text',
      placeholder: 'sender@example.com',
      help: 'The sender address. Required for real SMTP delivery; without a configured mailer FlowForge only logs the send.',
    },
    {
      key: 'subject',
      label: 'Subject',
      type: 'text',
      placeholder: 'Workflow completed',
      required: true,
      help: 'Required by the email runtime. The local development mailer records a safe send summary; external delivery requires a configured mailer.',
    },
    { key: 'body', label: 'Body', type: 'textarea', placeholder: 'Your workflow has finished.' },
  ],
}

export function isSupportedTaskType(type: string): type is SupportedTaskType {
  return (SUPPORTED_TASK_TYPES as readonly string[]).includes(type)
}

export function getTaskTypeMeta(type: string): TaskTypeMeta {
  if (isSupportedTaskType(type)) {
    return TASK_TYPE_META[type]
  }
  return {
    type: type as SupportedTaskType,
    label: type,
    description: 'Unknown task type',
    icon: Sparkles,
    accent: 'oklch(0.55 0.02 75)',
  }
}

export interface WorkflowNodeData extends Record<string, unknown> {
  task: WorkflowTask
  typeMeta: TaskTypeMeta
  validationErrors: string[]
}

export type WorkflowGraphNode = Node<WorkflowNodeData, 'workflowTask'>
export type WorkflowGraphEdge = Edge

export const WORKFLOW_NODE_TYPE = 'workflowTask' as const
