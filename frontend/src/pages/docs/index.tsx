import { Navigate, useParams } from 'react-router-dom'
import { DocsLayout } from '@/components/docs/DocsLayout'
import { docsPageRegistry } from './registry'
import { IntroductionPage } from './introduction'

function DocsPageShell({ slug, children }: { slug: string; children: React.ReactNode }) {
  return <DocsLayout slug={slug}>{children}</DocsLayout>
}

export function DocsIndexPage() {
  return (
    <DocsPageShell slug="introduction">
      <IntroductionPage />
    </DocsPageShell>
  )
}

export function DocsDocumentPage() {
  const { slug } = useParams()

  if (!slug) {
    return <Navigate to="/docs/introduction" replace />
  }

  const Page = docsPageRegistry[slug]
  if (!Page) {
    return <Navigate to="/docs/introduction" replace />
  }

  return (
    <DocsPageShell slug={slug}>
      <Page />
    </DocsPageShell>
  )
}
