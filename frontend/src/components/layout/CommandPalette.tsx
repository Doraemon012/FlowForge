import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  BookOpen,
  FolderKanban,
  LayoutDashboard,
  PlayCircle,
  Plus,
  Search,
  Workflow as WorkflowIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useRouteContext } from '@/hooks/use-route-context'
import {
  commandPaletteStore,
  useCommandPaletteOpen,
} from '@/components/layout/command-palette-store'

type CommandIcon = React.ComponentType<{
  className?: string
  'aria-hidden'?: boolean | 'true' | 'false'
}>

interface CommandItem {
  id: string
  label: string
  sub?: string
  icon: CommandIcon
  kbd?: string
  action: () => void
}

interface CommandSection {
  label: string
  items: CommandItem[]
}

/**
 * Builds the palette's contents for the route the user is on.
 *
 * The commands are derived from one place — the shared route context — so the
 * palette, the sidebar and the breadcrumbs agree about which project is open.
 * Previously the palette re-derived the project id with its own copy of the
 * path scan and only ever offered two destinations.
 */
function useCommandSections(): CommandSection[] {
  const navigate = useNavigate()
  const { projectId, inProject } = useRouteContext()

  return useMemo(() => {
    const jumpItems: CommandItem[] = [
      {
        id: 'overview',
        label: 'Workspace overview',
        sub: 'Your projects at a glance',
        icon: LayoutDashboard,
        action: () => navigate('/app'),
      },
      {
        id: 'projects',
        label: 'All projects',
        sub: 'Browse every project',
        icon: FolderKanban,
        action: () => navigate('/app/projects'),
      },
    ]

    if (projectId) {
      jumpItems.push(
        {
          id: 'project-overview',
          label: 'This project',
          sub: 'Project overview',
          icon: FolderKanban,
          action: () => navigate(`/app/projects/${projectId}`),
        },
        {
          id: 'project-workflows',
          label: 'Workflows',
          sub: 'Definitions in this project',
          icon: WorkflowIcon,
          action: () => navigate(`/app/projects/${projectId}/workflows`),
        },
        {
          id: 'project-runs',
          label: 'Runs',
          sub: 'Execution history in this project',
          icon: PlayCircle,
          action: () => navigate(`/app/projects/${projectId}/executions`),
        },
      )
    }

    const sections: CommandSection[] = [{ label: 'Jump to', items: jumpItems }]

    const createItems: CommandItem[] = [
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
        sub: inProject
          ? 'New workflow in this project'
          : 'Select a project to add a workflow',
        icon: WorkflowIcon,
        kbd: 'C then W',
        action: () => {
          if (projectId) {
            navigate(`/app/projects/${projectId}/workflows/new`)
          } else {
            navigate('/app/projects')
          }
        },
      },
    ]

    sections.push({ label: 'Create', items: createItems })
    sections.push({
      label: 'Help',
      items: [
        {
          id: 'docs',
          label: 'Documentation',
          sub: 'Concepts, task types, troubleshooting',
          icon: BookOpen,
          action: () => navigate('/docs'),
        },
      ],
    })

    return sections
  }, [navigate, projectId, inProject])
}

function CommandPalettePane() {
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const sections = useCommandSections()

  const close = useCallback(() => {
    commandPaletteStore.close()
  }, [])

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
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        close()
        return
      }
      if (!filteredItems.length) return
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
            onChange={(event) => {
              setQuery(event.target.value)
              setActiveIndex(0)
            }}
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
                    {/* `flex-1` so the trailing shortcut hint can be pushed to
                        the right edge by its `margin-left: auto` instead of
                        sitting against the end of the label. */}
                    <div className="min-w-0 flex-1">
                      <div className="truncate">{item.label}</div>
                      {item.sub ? (
                        <div className="truncate text-xs text-muted">{item.sub}</div>
                      ) : null}
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
