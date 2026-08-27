use std::path::PathBuf;
use thiserror::Error;

#[derive(Debug, Error)]
pub enum StorageError {
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),

    #[error("Zip archive error: {0}")]
    Zip(#[from] zip::result::ZipError),

    #[error("Invalid path or entry in archive: {0}")]
    InvalidPath(String),

    #[error("Archive exceeds extraction safety limits: {0}")]
    ExtractionLimit(String),

    #[error("Archive contains no recognizable genome accession directories: {0}")]
    NoGenomesFound(PathBuf),
}
