import { createContext, useContext } from 'react'

export interface EdgeActions {
  onDeleteEdge: (edgeId: string) => void
}

const noopEdgeActions: EdgeActions = {
  onDeleteEdge: () => {},
}

export const EdgeActionsContext = createContext<EdgeActions>(noopEdgeActions)

export function useEdgeActions(): EdgeActions {
  return useContext(EdgeActionsContext)
}
