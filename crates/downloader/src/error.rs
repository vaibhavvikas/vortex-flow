use thiserror::Error;

#[derive(Error, Debug)]
pub enum DownloadError {
    #[error("HTTP request error: {0}")]
    Http(#[from] reqwest::Error),

    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),

    #[error("Serialization error: {0}")]
    Serialization(#[from] serde_json::Error),

    #[error("Task not found: {0}")]
    TaskNotFound(String),

    #[error("HTTP Range headers not supported by remote server for URL: {0}")]
    RangeNotSupported(String),

    #[error("Download task was cancelled: {0}")]
    Cancelled(String),

    #[error("Max auto-retries ({max}) exceeded for task {task_id}: {last_error}")]
    MaxRetriesExceeded {
        task_id: String,
        max: u32,
        last_error: String,
    },

    #[error("Remote file changed on server during resume: {0}")]
    ServerFileChanged(String),

    #[error("Invalid task descriptor: {0}")]
    InvalidTask(String),
}
