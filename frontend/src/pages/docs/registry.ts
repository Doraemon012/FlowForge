import type { ComponentType } from 'react'
import { IntroductionPage } from './introduction'
import { ConceptsPage } from './concepts'
import { ArchitecturePage } from './architecture'
import { StackPage } from './stack'
import { FeaturesPage } from './features'
import { HowWorkflowsWorkPage } from './how-workflows-work'
import { CreatingAProjectPage } from './creating-a-project'
import { CreatingAWorkflowPage } from './creating-a-workflow'
import { AddingTasksPage } from './adding-tasks'
import { DagPage } from './dag'
import { ValidationPage } from './validation'
import { VersionsPage } from './versions'
import { RunningPage } from './running'
import { ExecutionsPage } from './executions'
import { RecoveryPage } from './recovery'
import { ObservabilityPage } from './observability'
import { TaskTypesPage } from './task-types'
import { ExamplesPage } from './examples'
import { TutorialsPage } from './tutorials'
import { TroubleshootingPage } from './troubleshooting'
import { GlossaryPage } from './glossary'
import { InterviewPage } from './interview'

export const docsPageRegistry: Record<string, ComponentType> = {
  introduction: IntroductionPage,
  concepts: ConceptsPage,
  architecture: ArchitecturePage,
  stack: StackPage,
  features: FeaturesPage,
  'how-workflows-work': HowWorkflowsWorkPage,
  'creating-a-project': CreatingAProjectPage,
  'creating-a-workflow': CreatingAWorkflowPage,
  'adding-tasks': AddingTasksPage,
  dag: DagPage,
  validation: ValidationPage,
  versions: VersionsPage,
  running: RunningPage,
  executions: ExecutionsPage,
  recovery: RecoveryPage,
  observability: ObservabilityPage,
  'task-types': TaskTypesPage,
  examples: ExamplesPage,
  tutorials: TutorialsPage,
  troubleshooting: TroubleshootingPage,
  glossary: GlossaryPage,
  interview: InterviewPage,
}
