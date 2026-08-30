import { useSyncExternalStore } from 'react'

type Listener = () => void

let isOpen = false
const listeners = new Set<Listener>()

function emit() {
  for (const listener of listeners) listener()
}

export const commandPaletteStore = {
  open() {
    isOpen = true
    emit()
  },
  close() {
    isOpen = false
    emit()
  },
  toggle() {
    isOpen = !isOpen
    emit()
  },
  subscribe(listener: Listener) {
    listeners.add(listener)
    return () => listeners.delete(listener)
  },
  getSnapshot() {
    return isOpen
  },
}

export function useCommandPaletteOpen() {
  return useSyncExternalStore(
    commandPaletteStore.subscribe,
    commandPaletteStore.getSnapshot,
    () => false,
  )
}
