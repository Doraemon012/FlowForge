# FlowForge — UI Design Specification

## 1. Purpose

This document defines the visual language, interaction principles, and UX quality bar for the FlowForge frontend.

FlowForge is a developer-focused workflow orchestration platform.

The UI should make a technically sophisticated system feel simple and approachable without hiding important information.

The product should feel like a serious modern developer tool rather than a generic CRUD dashboard or generic AI SaaS application.

---

# 2. Design Goals

The UI should communicate:

- technical sophistication
- reliability
- clarity
- precision
- confidence
- modernity
- simplicity

The interface should prioritize usability and information hierarchy over visual decoration.

---

# 3. Product Personality

FlowForge should feel:

- modern
- technical
- calm
- precise
- trustworthy
- slightly distinctive

It should not feel:

- corporate and dated
- overly playful
- visually noisy
- like a generic admin dashboard
- like an AI-generated SaaS template

---

# 4. Visual Direction

Use a restrained, polished visual system.

Prefer:

- strong typography
- clear spacing
- subtle borders
- controlled contrast
- restrained surfaces
- meaningful icons
- purposeful motion
- strong hierarchy

Avoid:

- excessive gradients
- excessive glassmorphism
- glowing interfaces
- excessive rounded cards
- decorative blobs
- excessive shadows
- unnecessary animations
- visual effects that do not improve usability

---

# 5. Application Layout

Authenticated pages use a persistent application shell.

```text
┌─────────────────────────────────────────────────────────────┐
│ Top Bar                                                     │
├──────────────┬──────────────────────────────────────────────┤
│              │                                              │
│   Sidebar    │                 Main Content                  │
│              │                                              │
│              │                                              │
│              │                                              │
└──────────────┴──────────────────────────────────────────────┘
````

The sidebar provides primary navigation.

The top bar provides contextual information and user controls.

The main content area changes according to the active route.

---

# 6. Navigation

Primary navigation:

* Overview
* Projects
* Executions
* Settings

Workflow navigation should become contextual when the user enters a project.

Avoid unnecessary nested navigation.

Use breadcrumbs when they improve orientation.

---

# 7. Typography

Use a modern sans-serif interface font.

Typography should have a clear hierarchy:

* page title
* section title
* body text
* supporting text
* metadata

Use monospace selectively for technical identifiers such as:

* execution IDs
* task IDs
* version identifiers
* technical values

Do not use monospace for ordinary UI copy.

---

# 8. Color

Use a restrained neutral foundation.

Semantic colors should represent:

* success
* warning
* error
* running
* informational

Color must not be the only indicator of state.

For example, a failed execution should communicate failure through:

* icon
* text
* visual treatment

not color alone.

---

# 9. Spacing

Use a consistent spacing system.

Prefer generous whitespace around major sections.

Avoid both:

* cramped interfaces
* excessive empty space that pushes useful information below the fold

---

# 10. Cards

Cards should be used to group meaningful information.

Avoid excessive card nesting.

Prefer a small number of strong surfaces over many small floating containers.

---

# 11. Buttons

Primary actions:

* Create Project
* Create Workflow
* Save
* Publish
* Run Workflow

Secondary actions:

* Validate
* View Versions
* Edit

Destructive actions require confirmation.

Buttons must communicate:

* default state
* hover state
* focus state
* disabled state
* loading state

---

# 12. Forms

Forms should:

* have clear labels
* show validation near the relevant field
* preserve useful input after recoverable failures
* clearly communicate submission state

Do not rely exclusively on placeholder text as labels.

---

# 13. Workflow Builder

The workflow builder is the primary product surface.

It should feel closer to a professional developer/design tool than a standard form.

The canvas should provide:

* clear nodes
* clear directed edges
* pan
* zoom
* node selection
* node movement
* task creation
* task configuration

The canvas should remain usable as workflow complexity increases.

---

# 14. Workflow Nodes

A node should communicate:

* task type
* task name
* execution state when viewing execution
* connection points

Example:

```text
┌─────────────────────┐
│  HTTP Request       │
│                     │
│  Fetch transcript   │
└─────────────────────┘
```

The node design should remain compact.

---

# 15. Execution Visualization

Execution status should be immediately understandable.

Example:

```text
Upload ─────→ Transcribe ─────→ Email
   ✓              ✓                ●
```

Possible states:

* pending
* queued
* running
* succeeded
* failed
* recovered/retrying where supported

---

# 16. Execution Recovery

When backend data supports attempt information, display recovery in a human-readable manner.

Example:

```text
Attempt 1
Worker A
Worker lost

       ↓

Attempt 2
Worker B
Succeeded
```

Do not expose raw lease tokens or database mechanics.

---

# 17. Motion

Motion should be purposeful.

Good uses:

* route transitions where appropriate
* node selection
* panel opening
* button loading
* state transitions
* successful actions

Avoid decorative animation.

Motion should be fast and unobtrusive.

---

# 18. Loading States

Every asynchronous screen must have a deliberate loading state.

Prefer:

* skeletons for page content
* button loading states for mutations
* contextual indicators

Avoid blank screens.

---

# 19. Empty States

Empty states should answer:

1. What is missing?
2. Why does it matter?
3. What should the user do next?

Example:

```text
No workflows yet

Create your first workflow by connecting tasks
into a repeatable execution.

[Create workflow]
```

---

# 20. Error States

Errors should be understandable and actionable.

Bad:

```text
HTTP 500
```

Better:

```text
Couldn't load this workflow.

Please try again.

[Try again]
```

When possible, explain how the user can resolve the problem.

---

# 21. Success Feedback

Use concise feedback for successful actions.

Examples:

* Workflow saved
* Version published
* Workflow activated
* Execution started
* Project created

Do not overuse notifications.

---

# 22. Responsive Design

Desktop is the primary target because workflow editing is inherently desktop-oriented.

The application must remain usable on smaller screens.

The workflow builder may provide a reduced editing experience on mobile rather than attempting to reproduce the full desktop experience.

---

# 23. Accessibility

The UI must support:

* keyboard navigation where practical
* visible focus states
* semantic labels
* accessible dialogs
* accessible form errors
* sufficient contrast
* non-color-only status communication

---

# 24. Design Quality Bar

A page is not considered complete merely because it renders.

Each meaningful screen should have intentional:

* loading state
* empty state
* error state
* success feedback where relevant
* responsive behavior
* accessibility behavior

The final product should feel coherent across all routes.
