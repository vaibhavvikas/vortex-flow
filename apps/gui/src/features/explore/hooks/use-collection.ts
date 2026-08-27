import * as React from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { fetchCollection, addRecordsToCollection, removeRecordsFromCollection } from "../services/collection-service"
import type { SraRecord } from "../services/sra-service"

export function useCollection() {
  const queryClient = useQueryClient()

  const { data: collection = [], isLoading: loading } = useQuery<SraRecord[]>({
    queryKey: ["collection"],
    queryFn: fetchCollection,
    staleTime: 0,
    gcTime: 1000 * 60 * 15,
  })

  const addMutation = useMutation({
    mutationFn: addRecordsToCollection,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["collection"] })
    },
  })

  const removeMutation = useMutation({
    mutationFn: removeRecordsFromCollection,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["collection"] })
    },
  })

  const addToCollection = React.useCallback(
    async (newRecords: SraRecord[]) => {
      // Optimistic cache update
      queryClient.setQueryData<SraRecord[]>(["collection"], (old = []) => {
        const existingIds = new Set(old.map((r) => r.id))
        const uniqueNew = newRecords.filter((r) => !existingIds.has(r.id))
        return [...old, ...uniqueNew]
      })
      try {
        await addMutation.mutateAsync(newRecords)
      } catch {
        // Gracefully handled if offline
      }
    },
    [queryClient, addMutation]
  )

  const removeFromCollection = React.useCallback(
    async (idsToRemove: string[]) => {
      const removeSet = new Set(idsToRemove)
      queryClient.setQueryData<SraRecord[]>(["collection"], (old = []) =>
        old.filter((r) => !removeSet.has(r.id))
      )
      try {
        await removeMutation.mutateAsync(idsToRemove)
      } catch {
        // Gracefully handled
      }
    },
    [queryClient, removeMutation]
  )

  const reloadCollection = React.useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["collection"] })
  }, [queryClient])

  return {
    collection,
    loading,
    addToCollection,
    removeFromCollection,
    reloadCollection,
  }
}

