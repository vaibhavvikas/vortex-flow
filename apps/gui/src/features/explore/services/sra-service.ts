import { apiFetch } from "@/lib/api-client"

export interface SraRecord {
  id: string
  accession: string
  title: string
  organism: string
  platform: string
  total_spots: string
  release_date: string
  study_id: string
  isDownloaded?: boolean
  is_downloaded?: boolean
  status?: "saved" | "downloaded" | "downloading"

  instrument_model?: string
  library_strategy?: string
  library_source?: string
  library_selection?: string
  library_layout?: string
  total_runs?: string
  total_bases?: string
  total_size?: string
  submitter_acc?: string
  center_name?: string
  experiment_acc?: string
  bioproject?: string
  biosample?: string
  sample_acc?: string
  construction_protocol?: string
  cell_line?: string
  source_name?: string
  treatment?: string
  antibody?: string
  expxml?: string
}

export interface SraSearchResponse {
  records: SraRecord[]
  total_count: number
}

export async function searchSraRecords(
  query: string,
  db: string = "sra",
  page: number = 1,
  retmax: number = 100
): Promise<SraSearchResponse> {
  const term = encodeURIComponent(query)
  return apiFetch<SraSearchResponse>(`/api/search/sra?term=${term}&db=${db}&page=${page}&retmax=${retmax}`)
}

export async function getCollectionApi(): Promise<SraRecord[]> {
  return apiFetch<SraRecord[]>("/api/collection")
}

export async function addToCollectionApi(records: SraRecord[]): Promise<{ success: boolean; total_collection_count: number }> {
  return apiFetch<{ success: boolean; total_collection_count: number }>("/api/collection/add", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ records }),
  })
}

export async function removeFromCollectionApi(ids: string[]): Promise<{ success: boolean; deleted_count: number }> {
  return apiFetch<{ success: boolean; deleted_count: number }>("/api/collection/remove", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ids }),
  })
}

export async function getDatasetDetailsApi(id: string): Promise<any> {
  return apiFetch<any>(`/api/collection/${id}/details`)
}

export interface ResolvedFileMetadata {
  item_id: string
  accession: string
  file_name: string
  format: "sra" | "fastq" | "fasta"
  download_url: string
  mirror_type: string
  file_size_bytes: number
  md5_checksum?: string
  sha256_checksum?: string
}

export interface ResolveUrlsResponse {
  success: boolean
  format: string
  resolved_count: number
  files: ResolvedFileMetadata[]
}

export async function resolveCollectionUrlsApi(
  format: "sra" | "fastq" | "fasta",
  ids?: string[]
): Promise<ResolveUrlsResponse> {
  return apiFetch<ResolveUrlsResponse>("/api/collection/resolve-urls", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ids, format }),
  })
}

export interface DownloadTaskItem {
  file_id: string
  item_id: string
  accession: string
  title: string
  organism: string
  file_name: string
  format: string
  download_url?: string
  local_path?: string
  file_size_bytes: number
  downloaded_bytes: number
  download_status: string
  speed_bytes_per_sec?: number
  eta_seconds?: number
}

export async function getDownloadsApi(): Promise<DownloadTaskItem[]> {
  return apiFetch<DownloadTaskItem[]>("/api/downloads")
}

export async function startDownloadsApi(
  file_ids?: string[],
  format?: string
): Promise<{ success: boolean; enqueued_count: number }> {
  return apiFetch<{ success: boolean; enqueued_count: number }>("/api/downloads/start", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ file_ids, format }),
  })
}

export async function pauseDownloadApi(id: string): Promise<{ success: boolean }> {
  return apiFetch<{ success: boolean }>(`/api/downloads/${encodeURIComponent(id)}/pause`, { method: "POST" })
}

export async function resumeDownloadApi(id: string): Promise<{ success: boolean }> {
  return apiFetch<{ success: boolean }>(`/api/downloads/${encodeURIComponent(id)}/resume`, { method: "POST" })
}

export async function cancelDownloadApi(id: string): Promise<{ success: boolean }> {
  return apiFetch<{ success: boolean }>(`/api/downloads/${encodeURIComponent(id)}/cancel`, { method: "POST" })
}

export async function retryDownloadApi(id: string): Promise<{ success: boolean }> {
  return apiFetch<{ success: boolean }>(`/api/downloads/${encodeURIComponent(id)}/retry`, { method: "POST" })
}

export async function deleteDownloadApi(id: string): Promise<{ success: boolean }> {
  return apiFetch<{ success: boolean }>(`/api/downloads/${encodeURIComponent(id)}`, { method: "DELETE" })
}

export interface GenomePackageLayers {
  genome_fasta: boolean
  genome_gff: boolean
  protein_fasta: boolean
  cds_fasta: boolean
  rna_fasta: boolean
  sequence_report: boolean
}

export async function downloadGenomesApi(
  accessions: string[],
  layers: GenomePackageLayers
): Promise<{ success: boolean; enqueued_count: number }> {
  return apiFetch<{ success: boolean; enqueued_count: number }>("/api/downloads/genomes", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ accessions, layers }),
  })
}

