use std::sync::Arc;
use vortexflow_db::CollectionService;
use vortexflow_downloader::{DownloadEvent, DownloadManager};
use vortexflow_providers::{NcbiClient, SequenceUrlResolver};

#[derive(Clone)]
pub struct AppState {
    pub api_token: Option<Arc<str>>,
    /// Only enabled by an explicit local-development environment setting.
    pub allow_insecure_dev_auth: bool,
    pub ncbi_client: Arc<NcbiClient>,
    pub collection_service: Arc<CollectionService>,
    pub url_resolver: Arc<SequenceUrlResolver>,
    pub download_manager: Arc<DownloadManager>,
    pub manifest_loader: Arc<vortexflow_workflow::ManifestLoader>,
    pub install_log_mgr: Arc<vortexflow_engine::InstallLogManager>,
}

impl Default for AppState {
    fn default() -> Self {
        Self::new()
    }
}

impl AppState {
    pub fn new() -> Self {
        let base_dir = dirs::home_dir()
            .map(|h| h.join(".vortexflow"))
            .unwrap_or_else(|| std::path::PathBuf::from(".vortexflow"));

        let db_path = base_dir.join("db").join("vortexflow.db");

        let collection_service = CollectionService::new(db_path)
            .expect("Failed to initialize SQLite persistent collection database");

        let manifest_loader = Arc::new(vortexflow_workflow::ManifestLoader::new());
        let install_log_mgr = Arc::new(vortexflow_engine::InstallLogManager::new());

        // On startup: Cleanly mark any orphaned "downloading" tasks as "paused" across app restart
        if let Ok(tasks) = collection_service.get_download_tasks() {
            for task in tasks {
                if task.download_status.to_lowercase() == "downloading" {
                    let _ = collection_service.update_file_download_progress(
                        &task.file_id,
                        "paused",
                        Some(task.downloaded_bytes),
                        Some(task.file_size_bytes),
                        task.local_path.as_deref(),
                    );
                }
            }
        }

        let download_manager = Arc::new(DownloadManager::new());
        let collection_service_arc = Arc::new(collection_service);

        // Spawn supervisor task to persist all background download events directly into SQLite DB
        let mut rx = download_manager.subscribe_events();
        let service_for_events = collection_service_arc.clone();

        tokio::spawn(async move {
            while let Ok(event) = rx.recv().await {
                match event {
                    DownloadEvent::TaskSubmitted(id) => {
                        let _ = service_for_events
                            .update_file_download_progress(&id, "queued", None, None, None);
                    }
                    DownloadEvent::StatusChanged { task_id, status } => {
                        let status_str = status.to_string();
                        let _ = service_for_events.update_file_download_progress(
                            &task_id,
                            &status_str,
                            None,
                            None,
                            None,
                        );
                    }
                    DownloadEvent::TaskFinished {
                        task_id,
                        destination,
                    } => {
                        let dest_str = destination.to_str();
                        let _ = service_for_events.mark_task_completed(&task_id, dest_str);

                        // If the completed file is an NCBI assembly genome package (.zip), automatically extract it
                        if destination.extension().and_then(|e| e.to_str()) == Some("zip") {
                            let genomes_dir = base_dir.join("genomes");
                            let dest_clone = destination.clone();
                            let service_clone = service_for_events.clone();

                            tokio::task::spawn_blocking(move || {
                                match vortexflow_storage::extract_genome_package(
                                    &dest_clone,
                                    &genomes_dir,
                                ) {
                                    Ok(extracted_genomes) => {
                                        for genome in extracted_genomes {
                                            tracing::info!(
                                              accession = %genome.accession,
                                              dir = %genome.directory.display(),
                                              files = genome.files.len(),
                                              "NCBI Genome package extracted and organized"
                                            );
                                            let _ = service_clone
                                                .mark_item_downloaded(&genome.accession);
                                        }
                                        // Clean up temporary package zip after successful extraction
                                        let _ = std::fs::remove_file(&dest_clone);
                                    }
                                    Err(err) => {
                                        tracing::error!(
                                          zip = %dest_clone.display(),
                                          error = %err,
                                          "Failed to extract genome package zip"
                                        );
                                    }
                                }
                            });
                        }
                    }
                    DownloadEvent::TaskFailed { task_id, error } => {
                        tracing::error!(task_id, error, "Download task failed");
                        let _ = service_for_events.mark_download_failed(&task_id, &error);
                    }
                    DownloadEvent::ProgressUpdated(p) => {
                        // Hot progress is held in memory and sidecar .vfdownload.meta files;
                        // SQLite is synced on lifecycle state changes.
                        if p.downloaded_bytes > 0
                            && p.total_bytes > 0
                            && p.downloaded_bytes == p.total_bytes
                        {
                            let _ = service_for_events.update_file_download_progress(
                                &p.task_id,
                                "completed",
                                Some(p.downloaded_bytes),
                                Some(p.total_bytes),
                                None,
                            );
                        }
                    }
                }
            }
        });

        Self {
            api_token: std::env::var("VORTEXFLOW_API_TOKEN")
                .ok()
                .filter(|token| !token.is_empty())
                .map(Arc::<str>::from),
            allow_insecure_dev_auth: matches!(
                std::env::var("VORTEXFLOW_ALLOW_INSECURE_DEV_AUTH").as_deref(),
                Ok("1") | Ok("true") | Ok("TRUE")
            ),
            ncbi_client: Arc::new(NcbiClient::default_client()),
            collection_service: collection_service_arc,
            url_resolver: Arc::new(SequenceUrlResolver::default_resolver()),
            download_manager,
            manifest_loader,
            install_log_mgr,
        }
    }
}
