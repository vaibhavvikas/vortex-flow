pub mod chunk;
pub mod error;
pub mod manager;
pub mod retry;
pub mod types;

pub use error::DownloadError;
pub use manager::DownloadManager;
pub use retry::RetryPolicy;
pub use types::{
    DownloadEvent, DownloadMetaState, DownloadProgress, DownloadSegment, DownloadStatus,
    DownloadTaskDescriptor,
};
