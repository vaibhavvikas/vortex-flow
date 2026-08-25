import { QueryClient } from "@tanstack/react-query"

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // Data is fresh for 5 minutes
      gcTime: 1000 * 60 * 15,    // Automatic garbage collection / RAM cleanup after 15 minutes of inactivity
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
})
