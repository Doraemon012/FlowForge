# FlowForge — UI Component Specification

## 1. Purpose

This document defines the reusable UI component system for FlowForge.

Components should provide consistent behavior and visual language across the application without creating unnecessary abstraction.

The component system must remain aligned with:

- UI_DESIGN.md
- UI_UX.md
- UI_ARCHITECTURE.md
- actual backend capabilities

---

# 2. Component Principles

Components should be:

- reusable
- composable
- accessible
- predictable
- visually consistent
- focused on one responsibility

Avoid abstractions created only for the sake of abstraction.

Prefer simple components with clear responsibilities.

---

# 3. Application Shell

## 3.1 AppShell

Provides the authenticated application structure.

Responsibilities:

- persistent application layout
- sidebar
- top bar
- main content region
- responsive behavior

It should not contain business logic for projects, workflows, or executions.

---

## 3.2 Sidebar

Provides primary application navigation.

Primary navigation:

- Overview
- Projects
- Executions
- Settings

Navigation should only expose capabilities that currently exist.

Project/workflow-specific navigation may be contextual.

---

## 3.3 TopBar

Provides contextual information and controls.

May contain:

- page title
- breadcrumbs
- contextual actions
- user/account control

The top bar should not become a second navigation system.

---

# 4. Authentication Components

## 4.1 LoginForm

Responsibilities:

- credential input
- client-side validation
- submission
- loading state
- authentication error display

It should communicate authentication failures clearly without exposing sensitive information.

---

## 4.2 SignupForm

Responsibilities:

- account information input
- validation
- submission
- loading state
- registration error display

---

## 4.3 AuthGuard

Responsible for protecting authenticated routes.

Behavior:

- allow authenticated users to access protected routes
- redirect unauthenticated users to authentication
- avoid rendering protected application content before authentication state is known

It should not implement authentication itself.

---

# 5. Dashboard Components

## 5.1 DashboardOverview

Displays meaningful high-level information available from backend APIs.

Possible sections:

- projects
- recent workflows
- recent executions
- primary actions

Do not create fake statistics.

---

## 5.2 RecentActivity

Displays recent activity only when actual backend data supports it.

It should gracefully handle:

- no activity
- loading
- errors

---

# 6. Project Components

## 6.1 ProjectList

Responsibilities:

- retrieve and display projects
- loading state
- empty state
- error state
- navigation

It should not contain raw HTTP implementation details.

---

## 6.2 ProjectCard

Displays a single project.

May contain:

- project name
- relevant metadata
- navigation action

Avoid displaying information that does not exist in the backend response.

---

## 6.3 ProjectForm

Used for project creation and supported project editing.

Responsibilities:

- field rendering
- client-side validation
- submission state
- server error display

---

## 6.4 ProjectHeader

Displays project identity and contextual actions.

May contain:

- project name
- breadcrumbs
- project actions

---

# 7. Workflow Components

## 7.1 WorkflowList

Displays workflows belonging to a project.

Responsibilities:

- loading
- empty state
- error state
- workflow navigation

---

## 7.2 WorkflowCard

Displays:

- workflow name
- supported status/version information
- relevant metadata
- navigation

Do not display unsupported workflow properties.

---

## 7.3 WorkflowCanvas

The primary workflow editing surface.

Responsibilities:

- render workflow tasks
- render dependencies
- task selection
- task movement
- pan
- zoom
- connection interaction

The canvas must not own API persistence logic.

---

## 7.4 TaskPalette

Displays the task types supported by the backend.

Responsibilities:

- communicate available task types
- initiate creation of a task in the editor

It must never advertise task types that the backend cannot execute.

---

## 7.5 WorkflowNode

Represents a task in the workflow.

Displays:

- task name
- task type
- connection points
- selected state
- execution state when applicable

The component should remain visually compact.

---

## 7.6 WorkflowEdge

Represents a dependency between tasks.

Responsibilities:

- visually connect nodes
- clearly communicate direction

---

## 7.7 TaskConfigPanel

Displays configuration for the selected task.

Responsibilities:

- task-specific fields
- configuration validation
- configuration editing
- unsaved state

It should adapt to supported task types rather than contain unrelated workflow logic.

---

## 7.8 WorkflowToolbar

Contains workflow-level actions such as:

- Save
- Validate
- Publish
- Run when supported

Actions must reflect the current workflow state.

For example:

- Save should communicate unsaved changes.
- Run should not be available when execution is not currently valid.
- Publish should communicate its effect.

---

## 7.9 WorkflowBuilderLayout

Coordinates the major regions of the editor:

```text
┌───────────────────────────────────────────────────────┐
│ Workflow Toolbar                                      │
├──────────────┬────────────────────────┬───────────────┤
│ Task Palette │       Canvas           │ Config Panel  │
│              │                        │               │
│              │                        │               │
└──────────────┴────────────────────────┴───────────────┘
````

The layout should remain usable as workflow complexity increases.

---

# 8. Version Components

## 8.1 VersionList

Displays workflow versions.

Responsibilities:

* version history
* publication state
* activation state
* relevant timestamps

---

## 8.2 VersionItem

Represents one workflow version.

Displays information such as:

* version identifier
* publication state
* activation state
* timestamp

---

## 8.3 VersionActions

Provides actions actually supported by the backend.

Examples:

* activate
* deactivate
* inspect

Do not expose unsupported operations.

---

# 9. Execution Components

## 9.1 ExecutionList

Displays workflow executions.

Responsibilities:

* execution list
* status
* relevant timestamps
* navigation
* loading
* empty state
* error state

---

## 9.2 ExecutionRow

Displays a single execution.

May contain:

* workflow name
* execution status
* creation/start time
* completion time where available
* navigation

---

## 9.3 ExecutionSummary

Displays the overall execution state.

Should answer:

* what ran?
* which version ran?
* what is the current status?
* when did it start?
* when did it finish?
* what was the outcome?

---

## 9.4 ExecutionGraph

Displays the workflow graph with execution state overlaid.

Example:

```text
Upload ─────→ Transcribe ─────→ Email
   ✓              ✓                ●
```

The component should derive state from actual task-run data.

It must not simulate execution progress.

---

## 9.5 ExecutionTask

Represents the execution state of an individual workflow task.

May display:

* task name
* status
* result
* failure reason
* relevant timing
* attempt information

---

## 9.6 AttemptHistory

Displays task attempts when the backend exposes the necessary information.

Example:

```text
Attempt 1
Worker A
Worker lost

Attempt 2
Worker B
Succeeded
```

Do not expose internal lease tokens or database implementation details.

---

## 9.7 ExecutionFailure

Provides a focused representation of execution failure.

Should display:

* failed task
* failure reason
* relevant attempt information
* actionable navigation

Technical details may be progressively disclosed.

---

# 10. Shared Feedback Components

## 10.1 StatusBadge

Represents semantic application states.

Examples:

* Draft
* Published
* Active
* Pending
* Queued
* Running
* Succeeded
* Failed

Status must not rely solely on color.

---

## 10.2 EmptyState

Standard empty collection experience.

Required elements:

* title
* explanation
* primary action when applicable

---

## 10.3 LoadingState

Provides consistent loading behavior.

Prefer contextual skeletons for page content.

---

## 10.4 ErrorState

Provides:

* understandable error message
* optional supporting detail
* retry action where appropriate

---

## 10.5 Toast

Provides concise transient feedback.

Appropriate for:

* successful saves
* successful creation
* successful publication
* concise operation failures

Important errors must not rely exclusively on toasts.

---

## 10.6 ConfirmDialog

Used for destructive or consequential actions.

Must provide:

* clear description
* explicit confirmation
* cancellation
* accessible focus management

---

# 11. Form Components

Forms should provide:

* persistent labels
* validation
* submission state
* server-side error handling
* accessible error messages

Use reusable form primitives for consistent behavior.

---

# 12. Button Components

Buttons should support:

* primary
* secondary
* destructive
* disabled
* loading
* focus states

Loading buttons should prevent accidental duplicate submissions.

---

# 13. Navigation Components

## Breadcrumbs

Use when they improve orientation within:

```text
Project → Workflow → Execution
```

Do not use breadcrumbs where navigation is already obvious.

---

# 14. Modal and Dialog Components

Dialogs should be used for focused interactions such as:

* project creation
* confirmation
* compact configuration interactions

Avoid putting complex multi-step workflows inside dialogs when a full page is more appropriate.

---

# 15. Component State Requirements

Interactive components should account for relevant states:

* default
* hover
* focus
* active
* disabled
* loading
* error
* empty where applicable

The implementation should avoid inconsistent state handling between similar components.

---

# 16. Accessibility Requirements

Reusable components must preserve:

* keyboard accessibility
* semantic HTML
* visible focus
* accessible labels
* accessible descriptions
* correct dialog focus behavior
* accessible validation messages
* non-color-only status indicators

---

# 17. Component Boundary Rules

UI components must not:

* access PostgreSQL directly
* access queue tables directly
* communicate directly with workers
* manage leases
* execute backend business logic
* contain duplicated API client logic
* invent backend state
* invent unsupported features

Backend interaction belongs in the appropriate frontend data/application layer.

---

# 18. Reuse Rule

Before creating a new component, determine whether an existing component can reasonably support the requirement.

However, do not force unrelated concepts into one overly generic component merely to reduce file count.

Prefer meaningful reuse over maximal reuse.
