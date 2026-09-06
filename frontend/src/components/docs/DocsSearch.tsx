import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search } from 'lucide-react'
import { getFlatDocs } from '@/components/docs/nav-data'

interface DocsSearchProps {
  open: boolean
  onClose: () => void
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function DocsSearch({ open, onClose }: DocsSearchProps) {
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const flatDocs = useMemo(() => getFlatDocs(), [])

  const results = useMemo(() => {
    if (!query.trim()) return flatDocs
    const terms = query
      .toLowerCase()
      .split(/\s+/)
      .filter(Boolean)
      .map(escapeRegExp)
    return flatDocs.filter((item) => {
      const haystack = `${item.title} ${item.group} ${item.slug}`.toLowerCase()
      return terms.every((term) => haystack.includes(term))
    })
  }, [query, flatDocs])

  useEffect(() => {
    if (open) {
      setQuery('')
      setActiveIndex(0)
      window.setTimeout(() => inputRef.current?.focus(), 30)
    }
  }, [open])

  useEffect(() => {
    if (activeIndex >= results.length) {
      setActiveIndex(Math.max(0, results.length - 1))
    }
  }, [results.length, activeIndex])

  if (!open) return null

  const handleNavigate = (slug: string) => {
    navigate(`/docs/${slug}`)
    onClose()
  }

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActiveIndex((index) => Math.min(index + 1, results.length - 1))
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActiveIndex((index) => Math.max(index - 1, 0))
    } else if (event.key === 'Enter') {
      event.preventDefault()
      const selected = results[activeIndex]
      if (selected) handleNavigate(selected.slug)
    } else if (event.key === 'Escape') {
      event.preventDefault()
      onClose()
    }
  }

  return (
    <>
      <div className="docs-search-overlay on" onClick={onClose} aria-hidden="true" />
      <div className="docs-search-dialog on" role="dialog" aria-modal="true" aria-label="Search documentation">
        <div className="docs-search-in">
          <Search className="h-4 w-4 text-muted" aria-hidden="true" />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value)
              setActiveIndex(0)
            }}
            onKeyDown={handleKeyDown}
            placeholder="Search documentation…"
            aria-label="Search documentation"
          />
          <span className="kbd">ESC</span>
        </div>
        <div className="docs-search-results" role="listbox" aria-label="Search results">
          {results.length === 0 ? (
            <div className="docs-search-empty">No results found.</div>
          ) : (
            results.map((item, index) => (
              <button
                key={item.slug}
                type="button"
                role="option"
                aria-selected={index === activeIndex}
                className={`docs-search-item${index === activeIndex ? ' active' : ''}`}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => handleNavigate(item.slug)}
              >
                <span className="si-title">{item.title}</span>
                <span className="si-group">{item.group}</span>
              </button>
            ))
          )}
        </div>
      </div>
    </>
  )
}
