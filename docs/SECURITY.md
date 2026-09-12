# Security Requirements

## Identity and authorization

FlowForge provides email/password account creation and login, stores only a slow password hash, and issues short-lived bearer access tokens for control-plane requests. A token identifies an active `User`; authentication failures return `401`. Projects are owned by a single user. Every workflow, version, execution, schedule, credential, log, event, and artifact lookup is constrained by the caller's project ownership; missing resources may return `404` to avoid disclosure. Mutations require ownership and lifecycle checks. Password reset, collaborator roles, and external SSO are not implemented.

Workers use separate service credentials, register an identity and capabilities, and may call only worker/task endpoints. A worker receives only the selected task context, artifact references, and authorized credential references. It cannot browse project resources.

## Credentials and secrets

Credentials are project-scoped references. Secret values come from a secret provider or protected configuration and are never stored in workflow JSON, queue payloads, normal API responses, logs, metrics labels, traces, or error messages. Access is audited and limited to the worker executing the task. Rotation invalidates old material without changing immutable workflow definitions.

Logs and outputs are redacted by structured field policy. User-supplied values are treated as sensitive by default where they may contain tokens. Exports and debugging views contain references or masked values only.

## Webhooks and input validation

Each webhook has a project/workflow scope and independent secret or signature configuration. Requests require signature verification over the raw body, timestamp/nonce replay protection where configured, size limits, content-type checks, and rate limits. Secrets are compared using constant-time methods. Repeated delivery is handled with an idempotency key; it must not create uncontrolled duplicate executions.

All API input is schema-validated. Limits apply to payload size, DAG nodes/edges, nesting, execution frequency, task output, and query pagination. URLs, redirects, headers, and task configuration are validated to reduce SSRF and injection risk.

## Privileged task types

HTTP and email tasks are constrained by allowlists and credential policy where deployment requires it. Shell, container, SQL, and arbitrary-code tasks are privileged and excluded from the initial built-in set unless isolated. They must not run inside the control plane and require an execution sandbox, resource limits, network policy, filesystem isolation, and explicit project authorization.

## Abuse prevention

Apply rate limits to authentication, public APIs, webhook invocation, and execution creation. Apply concurrency, queue, retention, and artifact quotas to prevent one project from exhausting shared capacity. Detect repeated failures and runaway schedules. Do not expose internal stack traces or credentials to callers.

## Operations

Use TLS for external and worker communication, least-privilege database roles, secret injection through deployment configuration, dependency scanning, migration review, audit events for authentication/resource/credential actions, and backups protected with access controls. Security tests cover cross-project access, token failures, webhook forgery/replay, redaction, validation limits, SSRF controls, and privileged task isolation.
