use crate::chunk::ChunkDownloader;
use crate::error::DownloadError;
use crate::retry::RetryPolicy;
use crate::types::{
    DownloadEvent, DownloadMetaState, DownloadProgress, DownloadSegment, DownloadStatus,
    DownloadTaskDescriptor,
};
use chrono::Utc;
use reqwest::Client;
use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant};
use tokio::sync::{broadcast, RwLock, Semaphore};
use tokio::task::JoinSet;
use tokio::time::sleep;
use tokio_util::sync::CancellationToken;

struct TaskStateInternal {
    descriptor: DownloadTaskDescriptor,
    status: DownloadStatus,
    downloaded_bytes: Arc<AtomicU64>,
    total_bytes: Arc<AtomicU64>,
    cancel_token: CancellationToken,
    pause_token: CancellationToken,
    exec_handle: Option<tokio::task::JoinHandle<()>>,
}

pub struct DownloadManager {
    tasks: Arc<RwLock<HashMap<String, TaskStateInternal>>>,
    client: Arc<Client>,
    event_sender: broadcast::Sender<DownloadEvent>,
    retry_policy: RetryPolicy,
    concurrency_semaphore: Arc<Semaphore>,
    pub max_concurrent_large: usize,
    pub max_concurrent_small: usize,
}

impl Default for DownloadManager {
    fn default() -> Self {
        Self::new()
    }
}

impl DownloadManager {
    pub fn new() -> Self {
        let (event_sender, _) = broadcast::channel(512);

        let client = Client::builder()
            .user_agent("VortexFlow-Downloader/2.4 (aria2/idm-engine)")
            .tcp_keepalive(Duration::from_secs(60))
            .connect_timeout(Duration::from_secs(15))
            .pool_idle_timeout(Duration::from_secs(90))
            .pool_max_idle_per_host(32)
            .redirect(reqwest::redirect::Policy::limited(10))
            .build()
            .unwrap_or_default();

        Self {
            tasks: Arc::new(RwLock::new(HashMap::new())),
            client: Arc::new(client),
            event_sender,
            retry_policy: RetryPolicy::default(),
            concurrency_semaphore: Arc::new(Semaphore::new(4)),
            max_concurrent_large: 2,
            max_concurrent_small: 6,
        }
    }

    pub fn subscribe_events(&self) -> broadcast::Receiver<DownloadEvent> {
        self.event_sender.subscribe()
    }

    /// Submit a new download task to the manager.
    pub async fn submit_task(&self, descriptor: DownloadTaskDescriptor) -> Result<(), DownloadError> {
        let id = descriptor.id.clone();
        let expected_size = descriptor.expected_size_bytes;

        let task_internal = TaskStateInternal {
            descriptor: descriptor.clone(),
            status: DownloadStatus::Queued,
            downloaded_bytes: Arc::new(AtomicU64::new(0)),
            total_bytes: Arc::new(AtomicU64::new(expected_size)),
            cancel_token: CancellationToken::new(),
            pause_token: CancellationToken::new(),
            exec_handle: None,
        };

        {
            let mut tasks = self.tasks.write().await;
            tasks.insert(id.clone(), task_internal);
        }

        let _ = self.event_sender.send(DownloadEvent::TaskSubmitted(id.clone()));
        let _ = self.event_sender.send(DownloadEvent::StatusChanged {
            task_id: id.clone(),
            status: DownloadStatus::Queued,
        });

        // Spawn background execution task
        self.spawn_task_execution(id).await;
        Ok(())
    }

    pub async fn pause_task(&self, task_id: &str) -> Result<(), DownloadError> {
        let mut tasks = self.tasks.write().await;
        if let Some(task) = tasks.get_mut(task_id) {
            task.pause_token.cancel();
            task.status = DownloadStatus::Paused;
            if let Some(handle) = task.exec_handle.take() {
                tokio::spawn(async move {
                    tokio::time::sleep(Duration::from_millis(1500)).await;
                    handle.abort();
                });
            }

            let downloaded = task.downloaded_bytes.load(Ordering::Relaxed);
            let total = task.total_bytes.load(Ordering::Relaxed);

            let _ = self.event_sender.send(DownloadEvent::StatusChanged {
                task_id: task_id.to_string(),
                status: DownloadStatus::Paused,
            });
            let _ = self.event_sender.send(DownloadEvent::ProgressUpdated(DownloadProgress {
                task_id: task_id.to_string(),
                group_id: task.descriptor.group_id.clone(),
                downloaded_bytes: downloaded,
                total_bytes: total,
                speed_bytes_per_sec: 0,
                eta_seconds: None,
                status: DownloadStatus::Paused,
            }));
            Ok(())
        } else {
            Err(DownloadError::TaskNotFound(task_id.to_string()))
        }
    }

    pub async fn resume_task(&self, task_id: &str) -> Result<(), DownloadError> {
        {
            let mut tasks = self.tasks.write().await;
            if let Some(task) = tasks.get_mut(task_id) {
                if let Some(handle) = task.exec_handle.take() {
                    handle.abort();
                }
                task.pause_token = CancellationToken::new();
                task.cancel_token = CancellationToken::new();
                task.status = DownloadStatus::Queued;
            } else {
                return Err(DownloadError::TaskNotFound(task_id.to_string()));
            }
        }

        self.spawn_task_execution(task_id.to_string()).await;
        Ok(())
    }

    pub async fn cancel_task(&self, task_id: &str) -> Result<(), DownloadError> {
        let destination = {
            let mut tasks = self.tasks.write().await;
            if let Some(task) = tasks.get_mut(task_id) {
                task.cancel_token.cancel();
                task.status = DownloadStatus::Cancelled;
                if let Some(handle) = task.exec_handle.take() {
                    handle.abort();
                }
                task.descriptor.destination_path.clone()
            } else {
                return Err(DownloadError::TaskNotFound(task_id.to_string()));
            }
        };

        let (staging_path, meta_path) = ChunkDownloader::get_staging_paths(&destination);
        tokio::spawn(async move {
            ChunkDownloader::cleanup_staging(&staging_path, &meta_path).await;
        });

        let _ = self.event_sender.send(DownloadEvent::StatusChanged {
            task_id: task_id.to_string(),
            status: DownloadStatus::Cancelled,
        });

        Ok(())
    }

    pub async fn remove_task(&self, task_id: &str) -> Result<(), DownloadError> {
        let destination = {
            let mut tasks = self.tasks.write().await;
            if let Some(mut task) = tasks.remove(task_id) {
                task.cancel_token.cancel();
                if let Some(handle) = task.exec_handle.take() {
                    handle.abort();
                }
                Some(task.descriptor.destination_path.clone())
            } else {
                return Ok(());
            }
        };

        if let Some(dest) = destination {
            let (staging_path, meta_path) = ChunkDownloader::get_staging_paths(&dest);
            tokio::spawn(async move {
                ChunkDownloader::cleanup_staging(&staging_path, &meta_path).await;
            });
        }

        Ok(())
    }

    pub async fn retry_task(&self, task_id: &str) -> Result<(), DownloadError> {
        let destination = {
            let mut tasks = self.tasks.write().await;
            if let Some(task) = tasks.get_mut(task_id) {
                task.downloaded_bytes.store(0, Ordering::Relaxed);
                task.status = DownloadStatus::Queued;
                task.descriptor.destination_path.clone()
            } else {
                return Err(DownloadError::TaskNotFound(task_id.to_string()));
            }
        };

        let (staging_path, meta_path) = ChunkDownloader::get_staging_paths(&destination);
        if destination.exists() {
            let _ = tokio::fs::remove_file(&destination).await;
        }
        ChunkDownloader::cleanup_staging(&staging_path, &meta_path).await;

        self.resume_task(task_id).await
    }

    pub async fn get_progress(&self, task_id: &str) -> Option<DownloadProgress> {
        let tasks = self.tasks.read().await;
        tasks.get(task_id).map(|t| DownloadProgress {
            task_id: t.descriptor.id.clone(),
            group_id: t.descriptor.group_id.clone(),
            downloaded_bytes: t.downloaded_bytes.load(Ordering::Relaxed),
            total_bytes: t.total_bytes.load(Ordering::Relaxed),
            speed_bytes_per_sec: 0,
            eta_seconds: None,
            status: t.status.clone(),
        })
    }

    async fn spawn_task_execution(&self, task_id: String) {
        let tasks = self.tasks.clone();
        let client = self.client.clone();
        let event_sender = self.event_sender.clone();
        let retry_policy = self.retry_policy.clone();
        let semaphore = self.concurrency_semaphore.clone();

        let tid_exec = task_id.clone();
        let exec_task = tokio::spawn(async move {
            // Concurrency limiter: Acquire slot before downloading
            let _permit = match semaphore.acquire().await {
                Ok(p) => p,
                Err(_) => return,
            };

            let (descriptor, downloaded_counter, total_counter, cancel_token, pause_token) = {
                let tasks_guard = tasks.read().await;
                let task = match tasks_guard.get(&tid_exec) {
                    Some(t) => t,
                    None => return,
                };
                (
                    task.descriptor.clone(),
                    task.downloaded_bytes.clone(),
                    task.total_bytes.clone(),
                    task.cancel_token.clone(),
                    task.pause_token.clone(),
                )
            };

            if cancel_token.is_cancelled() || pause_token.is_cancelled() {
                return;
            }

            // Step 0: Check if destination file already exists and is fully downloaded on disk
            if descriptor.destination_path.exists() {
                if let Ok(file_meta) = tokio::fs::metadata(&descriptor.destination_path).await {
                    let disk_len = file_meta.len();
                    let is_complete = if descriptor.expected_size_bytes > 0 {
                        disk_len == descriptor.expected_size_bytes
                    } else {
                        disk_len > 0
                    };

                    if is_complete {
                        total_counter.store(disk_len, Ordering::Relaxed);
                        downloaded_counter.store(disk_len, Ordering::Relaxed);

                        {
                            let mut tasks_guard = tasks.write().await;
                            if let Some(task) = tasks_guard.get_mut(&tid_exec) {
                                task.status = DownloadStatus::Completed;
                            }
                        }
                        let _ = event_sender.send(DownloadEvent::StatusChanged {
                            task_id: tid_exec.clone(),
                            status: DownloadStatus::Completed,
                        });
                        let _ = event_sender.send(DownloadEvent::TaskFinished {
                            task_id: tid_exec.clone(),
                            destination: descriptor.destination_path.clone(),
                        });
                        return;
                    }
                }
            }

            {
                let mut tasks_guard = tasks.write().await;
                if let Some(task) = tasks_guard.get_mut(&tid_exec) {
                    task.status = DownloadStatus::Downloading;
                }
            }
            let _ = event_sender.send(DownloadEvent::StatusChanged {
                task_id: tid_exec.clone(),
                status: DownloadStatus::Downloading,
            });

            let (staging_path, meta_path) =
                ChunkDownloader::get_staging_paths(&descriptor.destination_path);

            // Step 1: Probe or recover state from sidecar control file (.vfdownload.meta)
            let mut meta_state = if let Some(saved) = ChunkDownloader::load_meta_state(&meta_path).await {
                saved
            } else {
                let probe = match ChunkDownloader::probe_file(&client, &descriptor.url).await {
                    Ok(p) => p,
                    Err(e) => {
                        let err_msg = e.to_string();
                        {
                            let mut tasks_guard = tasks.write().await;
                            if let Some(task) = tasks_guard.get_mut(&tid_exec) {
                                task.status = DownloadStatus::Failed(err_msg.clone());
                            }
                        }
                        let _ = event_sender.send(DownloadEvent::TaskFailed {
                            task_id: tid_exec.clone(),
                            error: err_msg,
                        });
                        return;
                    }
                };

                let total_size = if descriptor.expected_size_bytes > 0 {
                    descriptor.expected_size_bytes
                } else {
                    probe.total_bytes
                };

                let segments = ChunkDownloader::calculate_segments(total_size, probe.supports_range);

                if let Err(e) = ChunkDownloader::preallocate_staging_file(&staging_path, total_size).await {
                    let err_msg = format!("Failed to preallocate staging file: {}", e);
                    let _ = event_sender.send(DownloadEvent::TaskFailed {
                        task_id: tid_exec.clone(),
                        error: err_msg,
                    });
                    return;
                }

                let new_meta = DownloadMetaState {
                    task_id: tid_exec.clone(),
                    group_id: descriptor.group_id.clone(),
                    url: descriptor.url.clone(),
                    etag: probe.etag,
                    last_modified: probe.last_modified,
                    total_bytes: total_size,
                    supports_range: probe.supports_range,
                    destination_path: descriptor.destination_path.clone(),
                    staging_path: staging_path.clone(),
                    segments,
                    updated_at: Utc::now(),
                };

                let _ = ChunkDownloader::save_meta_state(&meta_path, &new_meta).await;
                new_meta
            };

            total_counter.store(meta_state.total_bytes, Ordering::Relaxed);

            let initial_downloaded: u64 = meta_state.segments.iter().map(|s| s.downloaded_bytes).sum();
            downloaded_counter.store(initial_downloaded, Ordering::Relaxed);

            let mut attempt = 0;

            loop {
                if cancel_token.is_cancelled() {
                    let _ = event_sender.send(DownloadEvent::StatusChanged {
                        task_id: tid_exec.clone(),
                        status: DownloadStatus::Cancelled,
                    });
                    return;
                }

                if pause_token.is_cancelled() {
                    let _ = event_sender.send(DownloadEvent::StatusChanged {
                        task_id: tid_exec.clone(),
                        status: DownloadStatus::Paused,
                    });
                    return;
                }

                // Check if all segments are complete
                let all_done = meta_state.segments.iter().all(|s| s.is_complete());
                if all_done && meta_state.total_bytes > 0 {
                    // Finalize download atomically
                    if let Err(e) = ChunkDownloader::finalize_download(
                        &staging_path,
                        &meta_path,
                        &descriptor.destination_path,
                    )
                    .await
                    {
                        let err_msg = format!("Finalization failed: {}", e);
                        {
                            let mut tasks_guard = tasks.write().await;
                            if let Some(task) = tasks_guard.get_mut(&tid_exec) {
                                task.status = DownloadStatus::Failed(err_msg.clone());
                            }
                        }
                        let _ = event_sender.send(DownloadEvent::TaskFailed {
                            task_id: tid_exec.clone(),
                            error: err_msg,
                        });
                        return;
                    }

                    {
                        let mut tasks_guard = tasks.write().await;
                        if let Some(task) = tasks_guard.get_mut(&tid_exec) {
                            task.status = DownloadStatus::Completed;
                        }
                    }
                    let _ = event_sender.send(DownloadEvent::StatusChanged {
                        task_id: tid_exec.clone(),
                        status: DownloadStatus::Completed,
                    });
                    let _ = event_sender.send(DownloadEvent::TaskFinished {
                        task_id: tid_exec.clone(),
                        destination: descriptor.destination_path.clone(),
                    });
                    return;
                }

                let (byte_tx, mut byte_rx) = tokio::sync::mpsc::unbounded_channel::<u64>();

                // Spawn EWMA speed calculator and throttled UI emitter
                let stream_task_id = tid_exec.clone();
                let stream_group_id = descriptor.group_id.clone();
                let stream_counter = downloaded_counter.clone();
                let stream_total = meta_state.total_bytes;
                let stream_sender = event_sender.clone();

                let speed_reporter = tokio::spawn(async move {
                    let mut smoothed_speed: f64 = 0.0;
                    let alpha = 0.15; // EWMA decay factor
                    let mut last_emit = Instant::now();
                    let mut last_time = Instant::now();
                    let mut last_bytes = stream_counter.load(Ordering::Relaxed);

                    while let Some(_len) = byte_rx.recv().await {
                        if last_emit.elapsed() >= Duration::from_millis(100) {
                            let now = Instant::now();
                            let current_bytes = stream_counter.load(Ordering::Relaxed);
                            let elapsed = last_time.elapsed().as_secs_f64();

                            if elapsed > 0.0 && current_bytes >= last_bytes {
                                let instant_speed = (current_bytes - last_bytes) as f64 / elapsed;
                                smoothed_speed = if smoothed_speed == 0.0 {
                                    instant_speed
                                } else {
                                    alpha * instant_speed + (1.0 - alpha) * smoothed_speed
                                };
                            }

                            let speed_u64 = smoothed_speed.round() as u64;
                            let eta = if speed_u64 > 0 && stream_total > current_bytes {
                                Some((stream_total - current_bytes) / speed_u64)
                            } else {
                                None
                            };

                            last_bytes = current_bytes;
                            last_time = now;
                            last_emit = now;

                            let _ = stream_sender.send(DownloadEvent::ProgressUpdated(DownloadProgress {
                                task_id: stream_task_id.clone(),
                                group_id: stream_group_id.clone(),
                                downloaded_bytes: current_bytes,
                                total_bytes: stream_total,
                                speed_bytes_per_sec: speed_u64,
                                eta_seconds: eta,
                                status: DownloadStatus::Downloading,
                            }));
                        }
                    }
                });

                let mut error_encountered = None;

                if !meta_state.supports_range || meta_state.total_bytes == 0 {
                    // Single stream execution
                    match ChunkDownloader::download_single_stream(
                        client.clone(),
                        &descriptor.url,
                        &staging_path,
                        &tid_exec,
                        downloaded_counter.clone(),
                        cancel_token.clone(),
                        pause_token.clone(),
                        Some(byte_tx),
                    )
                    .await
                    {
                        Ok(total_done) => {
                            meta_state.total_bytes = total_done;
                            meta_state.segments = vec![DownloadSegment {
                                index: 0,
                                start: 0,
                                end: total_done.saturating_sub(1),
                                downloaded_bytes: total_done,
                            }];
                        }
                        Err(e) => {
                            error_encountered = Some(e.to_string());
                        }
                    }
                } else {
                    // Multi-segment direct-offset parallel execution
                    let mut join_set = JoinSet::new();

                    for segment in &meta_state.segments {
                        if segment.is_complete() {
                            continue;
                        }

                        let seg = segment.clone();
                        let client_ref = client.clone();
                        let url = descriptor.url.clone();
                        let staging = staging_path.clone();
                        let tid = tid_exec.clone();
                        let counter = downloaded_counter.clone();
                        let cancel = cancel_token.clone();
                        let pause = pause_token.clone();
                        let tx = byte_tx.clone();

                        join_set.spawn(async move {
                            let res = ChunkDownloader::download_segment(
                                client_ref,
                                &url,
                                &seg,
                                &staging,
                                &tid,
                                counter,
                                cancel,
                                pause,
                                Some(tx),
                            )
                            .await;
                            (seg.index, res)
                        });
                    }

                    drop(byte_tx);

                    while let Some(res) = join_set.join_next().await {
                        match res {
                            Ok((idx, Ok(new_downloaded))) => {
                                if let Some(seg) = meta_state.segments.get_mut(idx) {
                                    seg.downloaded_bytes = new_downloaded;
                                }
                            }
                            Ok((_idx, Err(e))) => {
                                error_encountered = Some(e.to_string());
                            }
                            Err(join_err) => {
                                error_encountered = Some(join_err.to_string());
                            }
                        }
                    }
                }

                speed_reporter.abort();

                // Save updated meta state to sidecar
                meta_state.updated_at = Utc::now();
                let _ = ChunkDownloader::save_meta_state(&meta_path, &meta_state).await;

                if cancel_token.is_cancelled() {
                    let _ = event_sender.send(DownloadEvent::StatusChanged {
                        task_id: tid_exec.clone(),
                        status: DownloadStatus::Cancelled,
                    });
                    ChunkDownloader::cleanup_staging(&staging_path, &meta_path).await;
                    return;
                }

                if pause_token.is_cancelled() {
                    let _ = event_sender.send(DownloadEvent::StatusChanged {
                        task_id: tid_exec.clone(),
                        status: DownloadStatus::Paused,
                    });
                    return;
                }

                if let Some(err_msg) = error_encountered {
                    attempt += 1;
                    if attempt > retry_policy.max_retries {
                        let failure_status = DownloadStatus::Failed(err_msg.clone());
                        {
                            let mut tasks_guard = tasks.write().await;
                            if let Some(task) = tasks_guard.get_mut(&tid_exec) {
                                task.status = failure_status.clone();
                            }
                        }
                        let _ = event_sender.send(DownloadEvent::TaskFailed {
                            task_id: tid_exec.clone(),
                            error: err_msg,
                        });
                        return;
                    }

                    let delay = retry_policy.get_delay(attempt);
                    tracing::warn!(
                        "Download attempt {} failed for task {}. Retrying in {:?}",
                        attempt,
                        tid_exec,
                        delay
                    );

                    let end_time = Instant::now() + delay;
                    while Instant::now() < end_time {
                        if cancel_token.is_cancelled() || pause_token.is_cancelled() {
                            break;
                        }
                        sleep(Duration::from_millis(100)).await;
                    }
                    continue;
                }

                // If no error occurred and all segments complete, finalize
                if meta_state.segments.iter().all(|s| s.is_complete()) {
                    if let Err(e) = ChunkDownloader::finalize_download(
                        &staging_path,
                        &meta_path,
                        &descriptor.destination_path,
                    )
                    .await
                    {
                        let err_msg = format!("Finalization failed: {}", e);
                        {
                            let mut tasks_guard = tasks.write().await;
                            if let Some(task) = tasks_guard.get_mut(&tid_exec) {
                                task.status = DownloadStatus::Failed(err_msg.clone());
                            }
                        }
                        let _ = event_sender.send(DownloadEvent::TaskFailed {
                            task_id: tid_exec.clone(),
                            error: err_msg,
                        });
                        return;
                    }

                    {
                        let mut tasks_guard = tasks.write().await;
                        if let Some(task) = tasks_guard.get_mut(&tid_exec) {
                            task.status = DownloadStatus::Completed;
                        }
                    }
                    let _ = event_sender.send(DownloadEvent::StatusChanged {
                        task_id: tid_exec.clone(),
                        status: DownloadStatus::Completed,
                    });
                    let _ = event_sender.send(DownloadEvent::TaskFinished {
                        task_id: tid_exec.clone(),
                        destination: descriptor.destination_path.clone(),
                    });
                    return;
                }
            }
        });

        let mut tasks_guard = self.tasks.write().await;
        if let Some(task) = tasks_guard.get_mut(&task_id) {
            task.exec_handle = Some(exec_task);
        }
    }
}
