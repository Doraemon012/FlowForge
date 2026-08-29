import { BrowserRouter, Route, Routes } from 'react-router-dom'
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

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider delayDuration={200}>
        <BrowserRouter>
          <Routes>
            <Route element={<RequirePublic />}>
              <Route path="/" element={<LandingPage />} />
              <Route path="/login" element={<LoginPage />} />
              <Route path="/signup" element={<SignupPage />} />
            </Route>

            <Route element={<RequireAuth />}>
              <Route path="/app" element={<AppShell />}>
                <Route index element={<DashboardPage />} />
                <Route path="projects" element={<ProjectsPage />} />
                <Route path="projects/:projectId" element={<ProjectOverviewPage />} />
                <Route path="projects/:projectId/workflows" element={<WorkflowsPage />} />
                <Route path="projects/:projectId/workflows/new" element={<WorkflowNewPage />} />
                <Route path="projects/:projectId/workflows/:workflowId" element={<WorkflowDetailPage />} />
                <Route path="projects/:projectId/workflows/:workflowId/versions" element={<WorkflowVersionsPage />} />
                <Route path="projects/:projectId/executions" element={<ExecutionsPage />} />
                <Route path="projects/:projectId/executions/:executionId" element={<ExecutionDetailPage />} />
                <Route path="*" element={<NotFoundPage />} />
              </Route>
            </Route>

            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </BrowserRouter>
        <Toaster richColors position="top-right" />
      </TooltipProvider>
    </QueryClientProvider>
  )
}

export default App
