use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum DownloadStatus {
    Queued,
    Downloading,
    Paused,
    Completed,
    Failed(String),
    Cancelled,
}

impl std::fmt::Display for DownloadStatus {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Queued => write!(f, "queued"),
            Self::Downloading => write!(f, "downloading"),
            Self::Paused => write!(f, "paused"),
            Self::Completed => write!(f, "completed"),
            Self::Failed(_) => write!(f, "failed"),
            Self::Cancelled => write!(f, "cancelled"),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DownloadSegment {
    pub index: usize,
    pub start: u64,
    pub end: u64,
    pub downloaded_bytes: u64,
}

impl DownloadSegment {
    pub fn is_complete(&self) -> bool {
        let expected = self.end.saturating_sub(self.start) + 1;
        self.downloaded_bytes >= expected
    }

    pub fn current_offset(&self) -> u64 {
        self.start + self.downloaded_bytes
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DownloadMetaState {
    pub task_id: String,
    pub group_id: Option<String>,
    pub url: String,
    pub etag: Option<String>,
    pub last_modified: Option<String>,
    pub total_bytes: u64,
    pub supports_range: bool,
    pub destination_path: PathBuf,
    pub staging_path: PathBuf,
    pub segments: Vec<DownloadSegment>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DownloadTaskDescriptor {
    pub id: String,
    pub group_id: Option<String>,
    pub url: String,
    pub destination_path: PathBuf,
    pub temp_dir: PathBuf,
    pub expected_size_bytes: u64,
    pub priority: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DownloadProgress {
    pub task_id: String,
    pub group_id: Option<String>,
    pub downloaded_bytes: u64,
    pub total_bytes: u64,
    pub speed_bytes_per_sec: u64,
    pub eta_seconds: Option<u64>,
    pub status: DownloadStatus,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum DownloadEvent {
    TaskSubmitted(String),
    StatusChanged { task_id: String, status: DownloadStatus },
    ProgressUpdated(DownloadProgress),
    TaskFinished { task_id: String, destination: PathBuf },
    TaskFailed { task_id: String, error: String },
}
