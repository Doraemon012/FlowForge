import { useSyncExternalStore } from 'react'

export type Theme = 'dark' | 'light' | 'system'

const THEME_STORAGE_KEY = 'flowforge.theme'

function getSystemTheme(): 'dark' | 'light' {
  if (typeof window === 'undefined') return 'light'
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function readStoredTheme(): Theme {
  if (typeof window === 'undefined') return 'system'
  const stored = window.localStorage.getItem(THEME_STORAGE_KEY)
  if (stored === 'dark' || stored === 'light' || stored === 'system') {
    return stored
  }
  return 'system'
}

function applyTheme(theme: Theme) {
  if (typeof document === 'undefined') return
  const resolved = theme === 'system' ? getSystemTheme() : theme
  document.documentElement.classList.toggle('dark', resolved === 'dark')
}

let theme: Theme = readStoredTheme()
const listeners = new Set<() => void>()

function syncSystemTheme() {
  applyTheme(theme)
}

if (typeof window !== 'undefined') {
  const media = window.matchMedia('(prefers-color-scheme: dark)')
  media.addEventListener('change', syncSystemTheme)
}

function emit() {
  for (const listener of listeners) {
    listener()
  }
}

export const themeStore = {
  getSnapshot(): Theme {
    return theme
  },

  setTheme(next: Theme) {
    theme = next
    if (typeof window !== 'undefined') {
      try {
        window.localStorage.setItem(THEME_STORAGE_KEY, next)
      } catch {
        // Ignore storage failures.
      }
    }
    applyTheme(next)
    emit()
  },

  subscribe(listener: () => void) {
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  },
}

// Apply the resolved theme on module load so the correct variant is present
// before the first React render.
applyTheme(theme)

export function useTheme(): {
  theme: Theme
  resolvedTheme: 'dark' | 'light'
  setTheme: (t: Theme) => void
} {
  const current = useSyncExternalStore(
    themeStore.subscribe,
    themeStore.getSnapshot,
    () => 'system' as Theme,
  ) as Theme
  const resolvedTheme = current === 'system' ? getSystemTheme() : current
  return {
    theme: current,
    resolvedTheme,
    setTheme: themeStore.setTheme,
  }
}
