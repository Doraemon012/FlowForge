import { useSyncExternalStore } from 'react'

export interface AuthUser {
  id: string
  email?: string
  displayName?: string
  /**
   * True when this session belongs to a disposable public-trial account. Set
   * from the server's response (which is authoritative) so the UI can show the
   * trial indicator without asking again on every render.
   */
  isTrial?: boolean
}

export interface Session {
  token: string
  user: AuthUser
}

const SESSION_STORAGE_KEY = 'flowforge.session'

function readStoredSession(): Session | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(SESSION_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Session
    if (!parsed.token || !parsed.user?.id) return null
    return parsed
  } catch {
    return null
  }
}

function persistSession(session: Session | null) {
  if (typeof window === 'undefined') return
  try {
    if (session) {
      window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session))
    } else {
      window.localStorage.removeItem(SESSION_STORAGE_KEY)
    }
  } catch {
    // Ignore storage write failures (e.g. private mode). Session stays in memory.
  }
}

let session: Session | null = readStoredSession()
const listeners = new Set<() => void>()

function emit() {
  for (const listener of listeners) {
    listener()
  }
}

export const authStore = {
  getSnapshot(): Session | null {
    return session
  },

  setSession(next: Session | null) {
    session = next
    persistSession(next)
    emit()
  },

  clear() {
    session = null
    persistSession(null)
    emit()
  },

  subscribe(listener: () => void) {
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  },
}

export function useSession(): Session | null {
  return useSyncExternalStore(authStore.subscribe, authStore.getSnapshot)
}
