use crate::error::DownloadError;
use crate::types::{DownloadMetaState, DownloadSegment};
use futures_util::StreamExt;
use reqwest::Client;
use std::io::SeekFrom;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use tokio::fs::{self, OpenOptions};
use tokio::io::{AsyncSeekExt, AsyncWriteExt};
use tokio_util::sync::CancellationToken;

#[derive(Debug, Clone)]
pub struct ProbeInfo {
    pub total_bytes: u64,
    pub supports_range: bool,
    pub etag: Option<String>,
    pub last_modified: Option<String>,
}

pub struct ChunkDownloader;

impl ChunkDownloader {
    /// Probe remote URL for Content-Length, Range support, ETag, and Last-Modified headers.
    pub async fn probe_file(client: &Client, url: &str) -> Result<ProbeInfo, DownloadError> {
        let res_result = client.head(url).send().await;
        let res = match res_result {
            Ok(r) if r.status().is_success() => r,
            _ => client
                .get(url)
                .header(reqwest::header::RANGE, "bytes=0-0")
                .send()
                .await?,
        };

        let mut total_bytes: u64 = res
            .headers()
            .get(reqwest::header::CONTENT_LENGTH)
            .and_then(|v| v.to_str().ok())
            .and_then(|v| v.parse::<u64>().ok())
            .unwrap_or(0);

        let mut supports_range = res
            .headers()
            .get(reqwest::header::ACCEPT_RANGES)
            .and_then(|v| v.to_str().ok())
            .map(|v| v.contains("bytes"))
            .unwrap_or(false);

        if let Some(content_range) = res.headers().get(reqwest::header::CONTENT_RANGE) {
            supports_range = true;
            if let Ok(range_str) = content_range.to_str() {
                if let Some(total_str) = range_str.rsplit('/').next() {
                    if let Ok(total) = total_str.parse::<u64>() {
                        total_bytes = total;
                    }
                }
            }
        }

        if res.status() == reqwest::StatusCode::PARTIAL_CONTENT {
            supports_range = true;
        }

        let etag = res
            .headers()
            .get(reqwest::header::ETAG)
            .and_then(|v| v.to_str().ok())
            .map(|s| s.to_string());

        let last_modified = res
            .headers()
            .get(reqwest::header::LAST_MODIFIED)
            .and_then(|v| v.to_str().ok())
            .map(|s| s.to_string());

        Ok(ProbeInfo {
            total_bytes,
            supports_range,
            etag,
            last_modified,
        })
    }

    /// Calculate optimal download segments based on file size and range support.
    pub fn calculate_segments(total_bytes: u64, supports_range: bool) -> Vec<DownloadSegment> {
        if !supports_range || total_bytes == 0 || total_bytes < 5 * 1024 * 1024 {
            // Single stream for unknown sizes, non-range servers, or small files (<5MB)
            return vec![DownloadSegment {
                index: 0,
                start: 0,
                end: total_bytes.saturating_sub(1),
                downloaded_bytes: 0,
            }];
        }

        let num_segments = if total_bytes > 500 * 1024 * 1024 {
            8
        } else if total_bytes > 50 * 1024 * 1024 {
            4
        } else {
            2
        };

        let segment_size = total_bytes / num_segments as u64;
        let mut segments = Vec::with_capacity(num_segments);

        for i in 0..num_segments {
            let start = i as u64 * segment_size;
            let end = if i == num_segments - 1 {
                total_bytes.saturating_sub(1)
            } else {
                (i as u64 + 1) * segment_size - 1
            };

            segments.push(DownloadSegment {
                index: i,
                start,
                end,
                downloaded_bytes: 0,
            });
        }

        segments
    }

    /// Compute staging path and meta control path for a destination path.
    pub fn get_staging_paths(destination_path: &Path) -> (PathBuf, PathBuf) {
        let file_name = destination_path
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("download");

        let parent = destination_path.parent().unwrap_or_else(|| Path::new("."));
        let staging_path = parent.join(format!("{}.vfdownload", file_name));
        let meta_path = parent.join(format!("{}.vfdownload.meta", file_name));

        (staging_path, meta_path)
    }

    /// Preallocate destination staging file.
    pub async fn preallocate_staging_file(
        staging_path: &Path,
        total_bytes: u64,
    ) -> Result<(), DownloadError> {
        if let Some(parent) = staging_path.parent() {
            fs::create_dir_all(parent).await?;
        }

        let file = OpenOptions::new()
            .create(true)
            .write(true)
            .truncate(false)
            .open(staging_path)
            .await?;

        if total_bytes > 0 {
            file.set_len(total_bytes).await?;
        }

        Ok(())
    }

    /// Load persisted metadata state from sidecar control file.
    pub async fn load_meta_state(meta_path: &Path) -> Option<DownloadMetaState> {
        if !meta_path.exists() {
            return None;
        }
        let data = fs::read(meta_path).await.ok()?;
        serde_json::from_slice(&data).ok()
    }

    /// Atomically persist metadata state to sidecar control file.
    pub async fn save_meta_state(
        meta_path: &Path,
        state: &DownloadMetaState,
    ) -> Result<(), DownloadError> {
        if let Some(parent) = meta_path.parent() {
            fs::create_dir_all(parent).await?;
        }

        let data = serde_json::to_vec_pretty(state)?;
        let tmp_meta = meta_path.with_extension("meta.tmp");
        fs::write(&tmp_meta, &data).await?;
        fs::rename(&tmp_meta, meta_path).await?;
        Ok(())
    }

    /// Download a single segment directly into the preallocated file at its exact byte offset.
    pub async fn download_segment(
        client: Arc<Client>,
        url: &str,
        segment: &DownloadSegment,
        staging_path: &Path,
        task_id: &str,
        downloaded_bytes_counter: Arc<AtomicU64>,
        cancel_token: CancellationToken,
        pause_token: CancellationToken,
        byte_sender: Option<tokio::sync::mpsc::UnboundedSender<u64>>,
    ) -> Result<u64, DownloadError> {
        let current_offset = segment.current_offset();
        if segment.end > 0 && current_offset > segment.end {
            // Segment is already complete
            return Ok(segment.downloaded_bytes);
        }

        let mut req = client.get(url);
        if segment.end > 0 {
            req = req.header(
                reqwest::header::RANGE,
                format!("bytes={}-{}", current_offset, segment.end),
            );
        } else if current_offset > 0 {
            req = req.header(
                reqwest::header::RANGE,
                format!("bytes={}-", current_offset),
            );
        }

        let res = req.send().await?;
        let status = res.status();

        if status == reqwest::StatusCode::RANGE_NOT_SATISFIABLE {
            // Range already satisfied.
            return Ok(segment.downloaded_bytes);
        }

        // A segmented request must never accept a full 200 response. Some
        // origins ignore Range headers; writing that body at a segment offset
        // would silently corrupt the staged file.
        if status != reqwest::StatusCode::PARTIAL_CONTENT {
            return Err(DownloadError::RangeNotSupported(url.to_string()));
        }

        let expected_range = format!("bytes {}-{}", current_offset, segment.end);
        let valid_content_range = res
            .headers()
            .get(reqwest::header::CONTENT_RANGE)
            .and_then(|value| value.to_str().ok())
            .is_some_and(|value| value.starts_with(&expected_range));
        if !valid_content_range {
            return Err(DownloadError::InvalidTask(format!(
                "Remote server returned an invalid Content-Range for {}",
                url
            )));
        }

        let mut file = OpenOptions::new()
            .write(true)
            .open(staging_path)
            .await?;

        file.seek(SeekFrom::Start(current_offset)).await?;

        let mut stream = res.bytes_stream();
        let mut newly_downloaded: u64 = 0;

        while let Some(item) = stream.next().await {
            if cancel_token.is_cancelled() {
                return Err(DownloadError::Cancelled(task_id.to_string()));
            }

            if pause_token.is_cancelled() {
                file.flush().await?;
                return Ok(segment.downloaded_bytes + newly_downloaded);
            }

            let chunk_data = item?;
            let len = chunk_data.len() as u64;
            let remaining = segment
                .end
                .saturating_sub(current_offset + newly_downloaded)
                .saturating_add(1);
            if len > remaining {
                return Err(DownloadError::InvalidTask(format!(
                    "Remote server sent more bytes than requested for segment {}",
                    segment.index
                )));
            }
            file.write_all(&chunk_data).await?;
            newly_downloaded += len;
            downloaded_bytes_counter.fetch_add(len, Ordering::Relaxed);

            if let Some(ref tx) = byte_sender {
                let _ = tx.send(len);
            }
        }

        file.flush().await?;
        Ok(segment.downloaded_bytes + newly_downloaded)
    }

    /// Single stream downloader for non-ranged files or unknown total length.
    pub async fn download_single_stream(
        client: Arc<Client>,
        url: &str,
        staging_path: &Path,
        task_id: &str,
        downloaded_bytes_counter: Arc<AtomicU64>,
        cancel_token: CancellationToken,
        pause_token: CancellationToken,
        byte_sender: Option<tokio::sync::mpsc::UnboundedSender<u64>>,
    ) -> Result<u64, DownloadError> {
        let res = client.get(url).send().await?;
        if !res.status().is_success() {
            return Err(DownloadError::Http(res.error_for_status().unwrap_err()));
        }

        let mut file = OpenOptions::new()
            .create(true)
            .write(true)
            .truncate(true)
            .open(staging_path)
            .await?;

        let mut stream = res.bytes_stream();
        let mut total_downloaded: u64 = 0;

        while let Some(item) = stream.next().await {
            if cancel_token.is_cancelled() {
                return Err(DownloadError::Cancelled(task_id.to_string()));
            }

            if pause_token.is_cancelled() {
                file.flush().await?;
                return Ok(total_downloaded);
            }

            let chunk_data = item?;
            let len = chunk_data.len() as u64;
            file.write_all(&chunk_data).await?;
            total_downloaded += len;
            downloaded_bytes_counter.fetch_add(len, Ordering::Relaxed);

            if let Some(ref tx) = byte_sender {
                let _ = tx.send(len);
            }
        }

        file.flush().await?;
        Ok(total_downloaded)
    }

    /// Finalize download by atomically renaming staging file to destination and removing meta file.
    pub async fn finalize_download(
        staging_path: &Path,
        meta_path: &Path,
        destination_path: &Path,
    ) -> Result<(), DownloadError> {
        if let Some(parent) = destination_path.parent() {
            fs::create_dir_all(parent).await?;
        }

        // Atomic rename on the same filesystem
        fs::rename(staging_path, destination_path).await?;

        // Cleanup sidecar meta file
        if meta_path.exists() {
            let _ = fs::remove_file(meta_path).await;
        }

        Ok(())
    }

    /// Cleanup staging and meta files on cancellation.
    pub async fn cleanup_staging(staging_path: &Path, meta_path: &Path) {
        if staging_path.exists() {
            let _ = fs::remove_file(staging_path).await;
        }
        if meta_path.exists() {
            let _ = fs::remove_file(meta_path).await;
        }
    }
}
