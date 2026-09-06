import { Link } from 'react-router-dom'
import { ArrowLeft, ArrowRight } from 'lucide-react'
import { getPrevNext } from '@/components/docs/nav-data'

interface DocsPagerProps {
  slug: string
}

export function DocsPager({ slug }: DocsPagerProps) {
  const { prev, next } = getPrevNext(slug)

  return (
    <nav className="docs-pager" aria-label="Page navigation">
      {prev ? (
        <Link to={`/docs/${prev.slug}`} className="docs-pager-link prev">
          <span className="docs-pager-label">Previous</span>
          <span className="docs-pager-title">
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
            {prev.title}
          </span>
        </Link>
      ) : (
        <span />
      )}
      {next ? (
        <Link to={`/docs/${next.slug}`} className="docs-pager-link next">
          <span className="docs-pager-label">Next</span>
          <span className="docs-pager-title">
            {next.title}
            <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </span>
        </Link>
      ) : null}
    </nav>
  )
}
