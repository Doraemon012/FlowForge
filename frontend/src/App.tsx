import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import { QueryClientProvider } from '@tanstack/react-query'
import { TooltipProvider } from '@/components/ui/tooltip'
import { Toaster } from '@/components/ui/sonner'
import { queryClient } from '@/lib/query-client'
import { RequireAuth } from '@/components/auth/RequireAuth'
import { RequirePublic } from '@/components/auth/RequirePublic'
import { AppShell } from '@/components/layout/AppShell'
import { LandingPage } from '@/pages/landing'
import { LoginPage } from '@/pages/login'
import { SignupPage } from '@/pages/signup'
import { DashboardPage } from '@/pages/dashboard'
import { ProjectsPage } from '@/pages/projects'
import { ProjectOverviewPage } from '@/pages/project-overview'
import { WorkflowsPage } from '@/pages/workflows'
import { WorkflowNewPage } from '@/pages/workflow-new'
import { WorkflowDetailPage } from '@/pages/workflow-detail'
import { WorkflowVersionsPage } from '@/pages/workflow-versions'
import { ExecutionsPage } from '@/pages/executions'
import { ExecutionDetailPage } from '@/pages/execution-detail'
import { NotFoundPage } from '@/pages/not-found'
import { DocsIndexPage, DocsDocumentPage } from '@/pages/docs'

// A data router (rather than `<BrowserRouter><Routes>`) so route changes are
// observable: `useBlocker` needs a data router to intercept navigations the
// click interceptor cannot see, most importantly the browser Back button. The
// route tree below is identical to the previous JSX `<Routes>` nesting.
const router = createBrowserRouter([
  { path: '/docs', element: <DocsIndexPage /> },
  { path: '/docs/:slug', element: <DocsDocumentPage /> },
  {
    element: <RequirePublic />,
    children: [
      { path: '/', element: <LandingPage /> },
      { path: '/login', element: <LoginPage /> },
      { path: '/signup', element: <SignupPage /> },
    ],
  },
  {
    element: <RequireAuth />,
    children: [
      {
        path: '/app',
        element: <AppShell />,
        children: [
          { index: true, element: <DashboardPage /> },
          { path: 'projects', element: <ProjectsPage /> },
          { path: 'projects/:projectId', element: <ProjectOverviewPage /> },
          { path: 'projects/:projectId/workflows', element: <WorkflowsPage /> },
          { path: 'projects/:projectId/workflows/new', element: <WorkflowNewPage /> },
          {
            path: 'projects/:projectId/workflows/:workflowId',
            element: <WorkflowDetailPage />,
          },
          {
            path: 'projects/:projectId/workflows/:workflowId/versions',
            element: <WorkflowVersionsPage />,
          },
          { path: 'projects/:projectId/executions', element: <ExecutionsPage /> },
          {
            path: 'projects/:projectId/executions/:executionId',
            element: <ExecutionDetailPage />,
          },
          { path: '*', element: <NotFoundPage /> },
        ],
      },
    ],
  },
  { path: '*', element: <NotFoundPage /> },
])

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider delayDuration={200}>
        <RouterProvider router={router} />
        <Toaster richColors position="top-right" />
      </TooltipProvider>
    </QueryClientProvider>
  )
}

export default App
