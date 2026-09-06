export interface DocsNavItem {
  slug: string
  title: string
}

export interface DocsNavGroup {
  label: string
  items: DocsNavItem[]
}

export const docsNavGroups: DocsNavGroup[] = [
  {
    label: 'Getting Started',
    items: [
      { slug: 'introduction', title: 'What FlowForge is' },
      { slug: 'creating-a-project', title: 'Creating a project' },
      { slug: 'creating-a-workflow', title: 'Creating a workflow' },
      { slug: 'adding-tasks', title: 'Adding & configuring tasks' },
      { slug: 'dag', title: 'Connecting tasks into a DAG' },
      { slug: 'validation', title: 'Validation' },
      { slug: 'versions', title: 'Save, publish & activate' },
      { slug: 'running', title: 'Running a workflow' },
    ],
  },
  {
    label: 'Concepts',
    items: [
      { slug: 'concepts', title: 'Core concepts & terminology' },
      { slug: 'architecture', title: 'Architecture' },
      { slug: 'stack', title: 'Technology stack' },
      { slug: 'features', title: 'V1 features' },
      { slug: 'how-workflows-work', title: 'How workflows work' },
    ],
  },
  {
    label: 'Guides & References',
    items: [
      { slug: 'executions', title: 'Executions, task runs & failures' },
      { slug: 'recovery', title: 'Retries, workers & recovery' },
      { slug: 'observability', title: 'Observability' },
      { slug: 'task-types', title: 'Supported task types' },
      { slug: 'examples', title: 'Realistic examples' },
      { slug: 'tutorials', title: 'Step-by-step tutorials' },
      { slug: 'troubleshooting', title: 'Troubleshooting' },
      { slug: 'glossary', title: 'Glossary' },
      { slug: 'interview', title: 'How FlowForge works' },
    ],
  },
]

export interface FlatDocsItem {
  slug: string
  title: string
  group: string
}

export function getFlatDocs(): FlatDocsItem[] {
  const flat: FlatDocsItem[] = []
  for (const group of docsNavGroups) {
    for (const item of group.items) {
      flat.push({ ...item, group: group.label })
    }
  }
  return flat
}

export function getDocsPage(slug: string): FlatDocsItem | undefined {
  return getFlatDocs().find((item) => item.slug === slug)
}

export function getPrevNext(slug: string): { prev?: FlatDocsItem; next?: FlatDocsItem } {
  const flat = getFlatDocs()
  const index = flat.findIndex((item) => item.slug === slug)
  if (index === -1) return {}
  return {
    prev: index > 0 ? flat[index - 1] : undefined,
    next: index < flat.length - 1 ? flat[index + 1] : undefined,
  }
}

export function getGroupForSlug(slug: string): string | undefined {
  return getDocsPage(slug)?.group
}
