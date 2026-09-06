import type { ReactNode } from 'react'

interface DocsDiagramProps {
  label?: string
  children: ReactNode
}

export function DocsDiagram({ label, children }: DocsDiagramProps) {
  return (
    <div className="docs-diagram">
      {label ? <div className="docs-diagram-label">{label}</div> : null}
      {children}
    </div>
  )
}
