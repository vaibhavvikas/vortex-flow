use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SraRecord {
    pub id: String,
    pub accession: String,
    pub title: String,
    pub organism: String,
    pub platform: String,
    pub total_spots: String,
    pub release_date: String,
    pub study_id: String,

    // Rich fields from Entrez ESummary expxml
    pub instrument_model: Option<String>,
    pub library_strategy: Option<String>,
    pub library_source: Option<String>,
    pub library_selection: Option<String>,
    pub library_layout: Option<String>,
    pub total_runs: Option<String>,
    pub total_bases: Option<String>,
    pub total_size: Option<String>,
    pub submitter_acc: Option<String>,
    pub center_name: Option<String>,
    pub experiment_acc: Option<String>,
    pub bioproject: Option<String>,
    pub biosample: Option<String>,
    pub sample_acc: Option<String>,
    pub construction_protocol: Option<String>,
    pub cell_line: Option<String>,
    pub source_name: Option<String>,
    pub treatment: Option<String>,
    pub antibody: Option<String>,
    pub expxml: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SraSearchResponse {
    pub query: String,
    pub total_count: usize,
    pub page: usize,
    pub page_size: usize,
    pub records: Vec<SraRecord>,
}
