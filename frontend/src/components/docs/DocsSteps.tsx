import type { ReactNode } from 'react'

export interface DocsStepItem {
  title: string
  description?: ReactNode
  content?: ReactNode
}

interface DocsStepsProps {
  steps: DocsStepItem[]
}

export function DocsSteps({ steps }: DocsStepsProps) {
  return (
    <ol className="docs-steps">
      {steps.map((step, index) => (
        <li key={step.title}>
          <div className="docs-step-num">{index + 1}</div>
          <div className="docs-step-title">{step.title}</div>
          {step.description ? (
            <div className="docs-step-desc">{step.description}</div>
          ) : null}
          {step.content ? <div style={{ marginTop: 10 }}>{step.content}</div> : null}
        </li>
      ))}
    </ol>
  )
}
