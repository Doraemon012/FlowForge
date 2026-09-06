export interface AuthResponse {
  user_id: string
  access_token: string
  token_type: string
  expires_in: number
}

export interface ApiErrorBody {
  code?: string
  message?: string
  errors?: string[]
}

export interface User {
  id: string
  email: string
  display_name: string
  status: string
  created_at: string
  updated_at: string
}

export interface Project {
  id: string
  owner_id: string
  name: string
  status: string
  created_at: string
  updated_at: string
}

export interface WorkflowTask {
  id: string
  type: string
  config: Record<string, unknown>
  depends_on?: string[]
}

export interface WorkflowDefinition {
  tasks: WorkflowTask[]
}

export interface Workflow {
  id: string
  project_id: string
  name: string
  description: string
  status: string
  draft_definition: WorkflowDefinition
  active_version_id?: string
  created_at: string
  updated_at: string
}

export interface WorkflowVersion {
  id: string
  workflow_id: string
  version_number: number
  definition: WorkflowDefinition
  created_at: string
}

export interface Execution {
  id: string
  project_id: string
  workflow_id: string
  workflow_version_id: string
  status: string
  input: Record<string, unknown>
  failure_reason?: string
  created_at: string
  started_at?: string
  completed_at?: string
}

export interface TaskRun {
  id: string
  execution_id: string
  task_id: string
  status: string
  output?: Record<string, unknown>
  failure_reason?: string
  created_at: string
  started_at?: string
  completed_at?: string
}

export interface TaskAttempt {
  id: string
  task_run_id: string
  execution_id: string
  task_id: string
  attempt_number: number
  worker_id: string
  status: string
  failure_reason?: string
  failure_classification?: string
  started_at: string
  heartbeat_at: string
  lease_expires_at: string
  completed_at?: string
}

export interface ExecutionEvent {
  id: string
  project_id: string
  execution_id: string
  task_id?: string
  task_run_id?: string
  task_attempt_id?: string
  worker_id?: string
  event_type: string
  created_at: string
  metadata?: Record<string, unknown>
}

export interface ExecutionLog {
  id: string
  project_id: string
  execution_id: string
  task_id?: string
  task_run_id?: string
  task_attempt_id?: string
  worker_id?: string
  severity: string
  source: string
  message: string
  created_at: string
}

export interface ValidationResult {
  valid: boolean
  errors: string[]
}
