import { useQuery } from "@tanstack/react-query"
import { searchSraRecords, type SraRecord, type SraSearchResponse } from "@/services/sra-service"

export type { SraRecord }

export function useSraQuery(query: string, db: string, page: number) {
  return useQuery<SraSearchResponse>({
    queryKey: ["sra-search", db, query, page],
    queryFn: async () => {
      if (!query.trim()) {
        return { total_count: 0, count: 0, page, retmax: 100, records: [] }
      }
      return searchSraRecords(query.trim(), db, page, 100)
    },
    enabled: !!query.trim(),
    staleTime: 1000 * 60 * 5, // 5 minutes fresh
    gcTime: 1000 * 60 * 15,    // Automatic garbage collection after 15 minutes of inactivity
    placeholderData: (previousData) => previousData, // Keeps previous page data visible while fetching next page for smooth transitions
  })
}
