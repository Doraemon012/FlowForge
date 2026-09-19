import { useSyncExternalStore } from 'react'

export type Theme = 'dark' | 'light' | 'system'

export const THEME_STORAGE_KEY = 'flowforge.theme'

function getSystemTheme(): 'dark' | 'light' {
  if (typeof window === 'undefined') return 'light'
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function readStoredTheme(): Theme {
  // Light is the default a first-time visitor sees. `system` remains a
  // selectable option, but it is never assumed: the OS preference no longer
  // decides what a new visitor gets.
  if (typeof window === 'undefined') return 'light'
  const stored = window.localStorage.getItem(THEME_STORAGE_KEY)
  if (stored === 'dark' || stored === 'light' || stored === 'system') {
    return stored
  }
  return 'light'
}

/** Keeps the browser chrome (mobile address bar, PWA shell) on the same
    background the page is actually painting. */
function applyThemeColor(isDark: boolean) {
  const meta = document.querySelector('meta[name="theme-color"]')
  if (meta) {
    meta.setAttribute('content', isDark ? '#0A0B0D' : '#F5F7F8')
  }
}

function applyTheme(theme: Theme) {
  if (typeof document === 'undefined') return
  const resolved = theme === 'system' ? getSystemTheme() : theme
  const isDark = resolved === 'dark'
  document.documentElement.classList.toggle('dark', isDark)
  applyThemeColor(isDark)
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
