import { apiFetch } from "./api-client"
import type { SraRecord } from "./sra-service"

export async function fetchCollection(): Promise<SraRecord[]> {
  return apiFetch<SraRecord[]>("/api/collection")
}

export async function addRecordsToCollection(
  records: SraRecord[]
): Promise<{ success: boolean; total_collection_count: number }> {
  return apiFetch<{ success: boolean; total_collection_count: number }>("/api/collection/add", {
    method: "POST",
    body: JSON.stringify({ records }),
  })
}
