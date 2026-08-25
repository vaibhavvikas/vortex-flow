import { apiFetch } from "./api-client"

export interface SraRecord {
  id: string
  accession: string
  title: string
  organism: string
  platform: string
  total_spots: string
  release_date: string
  study_id: string

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
