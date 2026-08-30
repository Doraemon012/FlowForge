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
    description: 'Make an HTTP request',
    icon: Globe,
    accent: 'oklch(0.64 0.13 235)',
  },
  transform: {
    type: 'transform',
    label: 'Transform',
    description: 'Transform or map data',
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
    description: 'Branch on a condition',
    icon: GitBranch,
    accent: 'oklch(0.70 0.16 160)',
  },
  email: {
    type: 'email',
    label: 'Email',
    description: 'Send an email',
    icon: Mail,
    accent: 'oklch(0.60 0.15 340)',
  },
}

export const DEFAULT_CONFIG_BY_TYPE: Record<SupportedTaskType, Record<string, unknown>> = {
  http: { url: '', method: 'GET' },
  transform: { expression: '' },
  delay: { seconds: 5 },
  conditional: { condition: '' },
  email: { to: '', subject: '', body: '' },
}

export interface ConfigFieldSpec {
  key: string
  label: string
  type: 'text' | 'number' | 'textarea' | 'select'
  placeholder?: string
  options?: string[]
  required?: boolean
}

export const TASK_CONFIG_FIELDS: Record<SupportedTaskType, ConfigFieldSpec[]> = {
  http: [
    { key: 'url', label: 'URL', type: 'text', placeholder: 'https://api.example.com', required: true },
    {
      key: 'method',
      label: 'HTTP method',
      type: 'select',
      options: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    },
  ],
  transform: [
    {
      key: 'expression',
      label: 'Expression',
      type: 'textarea',
      placeholder: 'return data.value * 2',
      required: true,
    },
  ],
  delay: [{ key: 'seconds', label: 'Seconds', type: 'number', required: true }],
  conditional: [
    {
      key: 'condition',
      label: 'Condition',
      type: 'textarea',
      placeholder: 'data.status === "success"',
      required: true,
    },
  ],
  email: [
    { key: 'to', label: 'To', type: 'text', placeholder: 'recipient@example.com', required: true },
    { key: 'subject', label: 'Subject', type: 'text', placeholder: 'Workflow completed' },
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
