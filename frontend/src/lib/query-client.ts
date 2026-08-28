import { QueryClient } from '@tanstack/react-query'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
      retry: (failureCount, error) => {
        // Don't retry 4xx errors — they won't succeed on retry.
        const status = (error as { status?: number }).status
        if (typeof status === 'number' && status >= 400 && status < 500) {
          return false
        }
        return failureCount < 2
      },
    },
  },
})
