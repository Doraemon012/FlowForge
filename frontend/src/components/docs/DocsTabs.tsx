import { useState, type ReactNode } from 'react'

export interface DocsTabItem {
  label: string
  content: ReactNode
}

interface DocsTabsProps {
  tabs: DocsTabItem[]
  ariaLabel?: string
}

export function DocsTabs({ tabs, ariaLabel }: DocsTabsProps) {
  const [active, setActive] = useState(0)

  return (
    <div className="docs-tabs">
      <div className="docs-tab-list" role="tablist" aria-label={ariaLabel}>
        {tabs.map((tab, index) => (
          <button
            key={tab.label}
            type="button"
            role="tab"
            aria-selected={index === active}
            className={`docs-tab-btn${index === active ? ' active' : ''}`}
            onClick={() => setActive(index)}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div className="docs-tab-panel" role="tabpanel">
        {tabs[active].content}
      </div>
    </div>
  )
}
