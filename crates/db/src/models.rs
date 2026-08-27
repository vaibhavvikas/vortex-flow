use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CollectionItem {
    pub id: String,
    pub provider: String,
    pub accession: String,
    pub title: String,
    pub organism: String,
    pub platform: String,
    pub total_spots: String,
    pub status: String,
    pub added_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CollectionMetadata {
    pub item_id: String,
    pub raw_xml: Option<String>,
    pub metadata_json: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CollectionFile {
    pub id: String,
    pub item_id: String,
    pub file_name: String,
    pub format: String,
    pub read_pair: u8,
    pub file_type: Option<String>,
    pub download_url: Option<String>,
    pub local_path: Option<String>,
    pub file_size_bytes: u64,
    pub download_status: String,
    pub sha256_checksum: Option<String>,
    pub downloaded_at: Option<String>,
    pub last_verified_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DatasetDetails {
    pub item: CollectionItem,
    pub metadata: Option<CollectionMetadata>,
    pub files: Vec<CollectionFile>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DownloadTaskItem {
    pub file_id: String,
    pub item_id: String,
    pub accession: String,
    pub title: String,
    pub organism: String,
    pub file_name: String,
    pub format: String,
    pub download_url: Option<String>,
    pub local_path: Option<String>,
    pub file_size_bytes: u64,
    pub downloaded_bytes: u64,
    pub download_status: String,
}
