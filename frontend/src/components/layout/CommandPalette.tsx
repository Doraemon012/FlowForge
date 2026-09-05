import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import {
  FolderKanban,
  LayoutDashboard,
  Plus,
  Search,
  Workflow,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  commandPaletteStore,
  useCommandPaletteOpen,
} from '@/components/layout/command-palette-store'

interface CommandItem {
  id: string
  label: string
  sub?: string
  icon: React.ComponentType<{ className?: string; 'aria-hidden'?: boolean | 'true' | 'false' }>
  kbd?: string
  action: () => void
}

interface CommandSection {
  label: string
  items: CommandItem[]
}

function CommandPalettePane() {
  const navigate = useNavigate()
  const location = useLocation()
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  const close = useCallback(() => {
    commandPaletteStore.close()
  }, [])

  const projectId = useMemo(() => {
    const segments = location.pathname.split('/').filter(Boolean)
    const projectsIndex = segments.indexOf('projects')
    if (projectsIndex >= 0 && segments[projectsIndex + 1]) {
      return segments[projectsIndex + 1]
    }
    return undefined
  }, [location.pathname])

  const sections = useMemo<CommandSection[]>(
    () => [
      {
        label: 'Jump to',
        items: [
          {
            id: 'overview',
            label: 'Overview',
            sub: 'Workspace dashboard',
            icon: LayoutDashboard,
            action: () => navigate('/app'),
          },
          {
            id: 'projects',
            label: 'Projects',
            sub: 'All projects',
            icon: FolderKanban,
            action: () => navigate('/app/projects'),
          },
        ],
      },
      {
        label: 'Commands',
        items: [
          {
            id: 'new-project',
            label: 'Create project…',
            sub: 'Start a new project',
            icon: Plus,
            kbd: 'C then P',
            action: () => navigate('/app/projects?create=1'),
          },
          {
            id: 'new-workflow',
            label: 'Create workflow…',
            sub: projectId
              ? 'New workflow in this project'
              : 'Select a project to add a workflow',
            icon: Workflow,
            kbd: 'C then W',
            action: () => {
              if (projectId) {
                navigate(`/app/projects/${projectId}/workflows/new`)
              } else {
                navigate('/app/projects')
              }
            },
          },
        ],
      },
    ],
    [navigate, projectId],
  )

  const filteredSections = useMemo(() => {
    if (!query.trim()) return sections
    const q = query.toLowerCase()
    return sections
      .map((section) => ({
        ...section,
        items: section.items.filter(
          (item) =>
            item.label.toLowerCase().includes(q) ||
            item.sub?.toLowerCase().includes(q) ||
            item.kbd?.toLowerCase().includes(q),
        ),
      }))
      .filter((section) => section.items.length > 0)
  }, [sections, query])

  const filteredItems = useMemo(
    () => filteredSections.flatMap((section) => section.items),
    [filteredSections],
  )

  // Clamp the active index during render instead of resetting in an effect.
  const safeIndex = Math.min(activeIndex, Math.max(0, filteredItems.length - 1))

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  useEffect(() => {
    if (!filteredItems.length) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        close()
        return
      }
      if (event.key === 'ArrowDown') {
        event.preventDefault()
        setActiveIndex((index) => Math.min(index + 1, filteredItems.length - 1))
        return
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault()
        setActiveIndex((index) => Math.max(index - 1, 0))
        return
      }
      if (event.key === 'Enter') {
        event.preventDefault()
        const item = filteredItems[safeIndex]
        if (item) {
          item.action()
          close()
        }
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [close, filteredItems, safeIndex])

  return (
    <>
      <div className="modal-overlay on" onClick={close} aria-hidden="true" />
      <div className="cmdk on" role="dialog" aria-modal="true" aria-label="Command palette">
        <div className="cmdk-in">
          <Search className="h-4 w-4 text-dim" aria-hidden="true" />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search or type a command…"
            aria-label="Search or type a command"
          />
          <span className="kbd">esc</span>
        </div>
        {filteredSections.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-muted">No results found.</div>
        ) : (
          filteredSections.map((section) => (
            <div className="cmdk-sec" key={section.label}>
              <h5>{section.label}</h5>
              {section.items.map((item) => {
                const flatIndex = filteredItems.indexOf(item)
                const Icon = item.icon
                return (
                  <button
                    type="button"
                    key={item.id}
                    role="option"
                    aria-selected={flatIndex === safeIndex}
                    className={cn('cmdk-item', flatIndex === safeIndex && 'active')}
                    onClick={() => {
                      item.action()
                      close()
                    }}
                    onMouseEnter={() => setActiveIndex(flatIndex)}
                  >
                    <Icon className="h-4 w-4" aria-hidden="true" />
                    <div>
                      <div>{item.label}</div>
                      {item.sub ? <div className="text-xs text-muted">{item.sub}</div> : null}
                    </div>
                    {item.kbd ? <span className="kk">{item.kbd}</span> : null}
                  </button>
                )
              })}
            </div>
          ))
        )}
      </div>
    </>
  )
}

export function CommandPalette() {
  const open = useCommandPaletteOpen()

  // Global ⌘K / Ctrl+K shortcut
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        commandPaletteStore.toggle()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  if (!open) return null

  return <CommandPalettePane />
}
