import { Link } from 'react-router-dom'
import { FolderKanban } from 'lucide-react'
import type * as React from 'react'
import type { Project } from '@/api/types'
import { formatDate } from '@/lib/utils'

interface ProjectCardProps {
  project: Project
  /**
   * An optional control rendered inside the card but outside the navigation
   * link. The card is an anchor, so an action button placed within it would be
   * an interactive element nested inside another; giving the action its own row
   * keeps both usable and keyboard-reachable.
   */
  action?: React.ReactNode
}

export function ProjectCard({ project, action }: ProjectCardProps) {
  const body = (
    <>
      <div className="proj-head">
        <div className="proj-icon">
          <FolderKanban className="h-4 w-4" aria-hidden="true" />
        </div>
        <div>
          <div className="proj-name">{project.name}</div>
          <div className="proj-meta">
            {project.id.slice(0, 8)} · {formatDate(project.created_at)}
          </div>
        </div>
      </div>
      <div className="proj-stats" style={{ marginTop: 10 }}>
        <div>
          <span>Status</span>
          <b className="capitalize" style={{ color: project.status === 'active' ? 'var(--success)' : 'var(--muted)' }}>
            {project.status}
          </b>
        </div>
        <div>
          <span>Updated</span>
          <b>{formatDate(project.updated_at)}</b>
        </div>
      </div>
    </>
  )

  if (!action) {
    return (
      <Link to={`/app/projects/${project.id}`} className="proj-card">
        {body}
      </Link>
    )
  }

  return (
    <div className="proj-card">
      <Link to={`/app/projects/${project.id}`} className="block">
        {body}
      </Link>
      <div className="mt-3">{action}</div>
    </div>
  )
}
