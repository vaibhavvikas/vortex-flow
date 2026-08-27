use crate::state::AppState;
use axum::{
    extract::{Path, State},
    http::StatusCode,
    response::IntoResponse,
    routing::{delete, get, post},
    Json, Router,
};
use serde::Deserialize;
use std::path::{Component, Path as FsPath, PathBuf};
use vortexflow_downloader::DownloadTaskDescriptor;

#[derive(Deserialize)]
pub struct StartDownloadRequest {
    pub file_ids: Option<Vec<String>>,
    pub format: Option<String>,
}

use axum::response::sse::{Event, KeepAlive, Sse};
use tokio_stream::wrappers::BroadcastStream;
use tokio_stream::StreamExt;

pub fn download_routes() -> Router<AppState> {
    Router::new()
        .route("/api/downloads", get(get_downloads_handler))
        .route("/api/downloads/events", get(sse_events_handler))
        .route("/api/downloads/start", post(start_download_handler))
        .route("/api/downloads/genomes", post(queue_genomes_download_handler))
        .route("/api/downloads/{id}/pause", post(pause_download_handler))
        .route("/api/downloads/{id}/resume", post(resume_download_handler))
        .route("/api/downloads/{id}/cancel", post(cancel_download_handler))
        .route("/api/downloads/{id}/retry", post(retry_download_handler))
        .route("/api/downloads/{id}", delete(delete_download_handler))
}

fn download_destination(base_dir: &FsPath, format: &str, file_name: &str) -> Result<PathBuf, &'static str> {
    if !matches!(format, "sra" | "fastq" | "fasta" | "genome_package") {
        return Err("Unsupported download format");
    }

    let path = FsPath::new(file_name);
    if file_name.is_empty()
        || path.components().count() != 1
        || !matches!(path.components().next(), Some(Component::Normal(_)))
    {
        return Err("Download filename must be a single safe filename");
    }

    Ok(base_dir.join("downloads").join(format).join(path))
}

async fn sse_events_handler(
    State(state): State<AppState>,
) -> Sse<impl futures_util::Stream<Item = Result<Event, std::convert::Infallible>>> {
    let rx = state.download_manager.subscribe_events();
    let stream = BroadcastStream::new(rx).filter_map(|msg| match msg {
        Ok(event) => {
            let json = serde_json::to_string(&event).unwrap_or_default();
            Some(Ok(Event::default().data(json)))
        }
        Err(_) => None,
    });

    Sse::new(stream).keep_alive(KeepAlive::default())
}

async fn get_downloads_handler(State(state): State<AppState>) -> impl IntoResponse {
    match state.collection_service.get_download_tasks() {
        Ok(mut tasks) => {
            let mut response_items = Vec::new();
            for task in &mut tasks {
                let mut speed = 0;
                let mut eta = None;
                if let Some(progress) = state.download_manager.get_progress(&task.file_id).await {
                    task.downloaded_bytes = progress.downloaded_bytes;
                    if progress.total_bytes > 0 {
                        task.file_size_bytes = progress.total_bytes;
                    }
                    task.download_status = progress.status.to_string();
                    speed = progress.speed_bytes_per_sec;
                    eta = progress.eta_seconds;
                }

                let mut val = serde_json::to_value(&task).unwrap_or_default();
                if let Some(obj) = val.as_object_mut() {
                    obj.insert("speed_bytes_per_sec".to_string(), serde_json::json!(speed));
                    obj.insert("eta_seconds".to_string(), serde_json::json!(eta));
                }
                response_items.push(val);
            }
            (StatusCode::OK, Json(serde_json::Value::Array(response_items))).into_response()
        }
        Err(err) => (StatusCode::INTERNAL_SERVER_ERROR, err.to_string()).into_response(),
    }
}

async fn start_download_handler(
    State(state): State<AppState>,
    Json(body): Json<StartDownloadRequest>,
) -> impl IntoResponse {
    let base_dir = dirs::home_dir()
        .map(|h| h.join(".vortexflow"))
        .unwrap_or_else(|| PathBuf::from(".vortexflow"));

    let temp_dir = base_dir.join("temp").join("chunks");

    let all_tasks = match state.collection_service.get_download_tasks() {
        Ok(tasks) => tasks,
        Err(err) => return (StatusCode::INTERNAL_SERVER_ERROR, err.to_string()).into_response(),
    };

    let target_tasks: Vec<_> = all_tasks
        .into_iter()
        .filter(|t| {
            if let Some(ref fmt) = body.format {
                if t.format.to_lowercase() != fmt.to_lowercase() {
                    return false;
                }
            }
            if let Some(ref ids) = body.file_ids {
                if !ids.is_empty() {
                    let matches = ids.iter().any(|id| {
                        t.file_id == *id || t.item_id == *id || t.accession == *id || t.file_id.contains(id)
                    });
                    if !matches {
                        return false;
                    }
                }
            } else if t.download_status.to_lowercase() == "completed" {
                // If "Start All" (no specific file IDs specified), skip already completed downloads
                return false;
            }
            true
        })
        .collect();

    let mut enqueued = 0;
    for task in target_tasks {
        if let Some(url) = task.download_url {
            let destination_path = match download_destination(&base_dir, &task.format, &task.file_name) {
                Ok(path) => path,
                Err(message) => {
                    tracing::warn!(task_id = %task.file_id, file_name = %task.file_name, "{message}");
                    let _ = state.collection_service.mark_download_failed(&task.file_id, message);
                    continue;
                }
            };

            let descriptor = DownloadTaskDescriptor {
                id: task.file_id.clone(),
                group_id: Some(task.accession.clone()),
                url,
                destination_path,
                temp_dir: temp_dir.clone(),
                expected_size_bytes: task.file_size_bytes,
                priority: 10,
            };

            let _ = state.collection_service.update_file_download_progress(
                &task.file_id,
                "queued",
                None,
                None,
                None,
            );

            if state.download_manager.submit_task(descriptor).await.is_ok() {
                enqueued += 1;
            }
        }
    }

    (
        StatusCode::OK,
        Json(serde_json::json!({ "success": true, "enqueued_count": enqueued })),
    )
        .into_response()
}

async fn pause_download_handler(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    let mut downloaded = None;
    let mut total = None;
    if let Some(prog) = state.download_manager.get_progress(&id).await {
        downloaded = Some(prog.downloaded_bytes);
        if prog.total_bytes > 0 {
            total = Some(prog.total_bytes);
        }
    }
    let _ = state.download_manager.pause_task(&id).await;
    let _ = state.collection_service.update_file_download_progress(&id, "paused", downloaded, total, None);
    (StatusCode::OK, Json(serde_json::json!({ "success": true }))).into_response()
}

async fn resume_download_handler(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    let base_dir = dirs::home_dir()
        .map(|h| h.join(".vortexflow"))
        .unwrap_or_else(|| PathBuf::from(".vortexflow"));
    let temp_dir = base_dir.join("temp").join("chunks");

    let _ = state.collection_service.update_file_download_progress(&id, "downloading", None, None, None);

    if state.download_manager.resume_task(&id).await.is_err() {
        if let Ok(tasks) = state.collection_service.get_download_tasks() {
            if let Some(task) = tasks.into_iter().find(|t| t.file_id == id || t.accession == id) {
                if let Some(url) = task.download_url {
                    let Ok(destination_path) = download_destination(&base_dir, &task.format, &task.file_name) else {
                        return (StatusCode::BAD_REQUEST, "Unsafe download destination").into_response();
                    };

                    let descriptor = DownloadTaskDescriptor {
                        id: task.file_id.clone(),
                        group_id: Some(task.accession.clone()),
                        url,
                        destination_path,
                        temp_dir: temp_dir.clone(),
                        expected_size_bytes: task.file_size_bytes,
                        priority: 10,
                    };
                    let _ = state.download_manager.submit_task(descriptor).await;
                }
            }
        }
    }

    (StatusCode::OK, Json(serde_json::json!({ "success": true }))).into_response()
}

async fn cancel_download_handler(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    let mut downloaded = None;
    let mut total = None;
    if let Some(prog) = state.download_manager.get_progress(&id).await {
        downloaded = Some(prog.downloaded_bytes);
        if prog.total_bytes > 0 {
            total = Some(prog.total_bytes);
        }
    }
    let _ = state.download_manager.cancel_task(&id).await;
    let _ = state.collection_service.update_file_download_progress(&id, "cancelled", downloaded, total, None);
    (StatusCode::OK, Json(serde_json::json!({ "success": true }))).into_response()
}

async fn retry_download_handler(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    let base_dir = dirs::home_dir()
        .map(|h| h.join(".vortexflow"))
        .unwrap_or_else(|| PathBuf::from(".vortexflow"));
    let temp_dir = base_dir.join("temp").join("chunks");

    let _ = state.collection_service.update_file_download_progress(&id, "queued", Some(0), None, None);

    if state.download_manager.retry_task(&id).await.is_err() {
        if let Ok(tasks) = state.collection_service.get_download_tasks() {
            if let Some(task) = tasks.into_iter().find(|t| t.file_id == id || t.accession == id) {
                if let Some(url) = task.download_url {
                    let Ok(destination_path) = download_destination(&base_dir, &task.format, &task.file_name) else {
                        return (StatusCode::BAD_REQUEST, "Unsafe download destination").into_response();
                    };

                    if destination_path.exists() {
                        let _ = tokio::fs::remove_file(&destination_path).await;
                    }

                    let descriptor = DownloadTaskDescriptor {
                        id: task.file_id.clone(),
                        group_id: Some(task.accession.clone()),
                        url,
                        destination_path,
                        temp_dir: temp_dir.clone(),
                        expected_size_bytes: task.file_size_bytes,
                        priority: 10,
                    };
                    let _ = state.download_manager.submit_task(descriptor).await;
                }
            }
        }
    }

    (StatusCode::OK, Json(serde_json::json!({ "success": true }))).into_response()
}

async fn delete_download_handler(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    let _ = state.download_manager.remove_task(&id).await;
    match state.collection_service.delete_download_file(&id) {
        Ok(()) => (StatusCode::OK, Json(serde_json::json!({ "success": true }))).into_response(),
        Err(err) => (StatusCode::INTERNAL_SERVER_ERROR, err.to_string()).into_response(),
    }
}

#[derive(Deserialize)]
pub struct QueueGenomesRequest {
    pub accessions: Vec<String>,
    pub layers: Option<vortexflow_providers::GenomeAnnotationLayers>,
}

async fn queue_genomes_download_handler(
    State(state): State<AppState>,
    Json(body): Json<QueueGenomesRequest>,
) -> impl IntoResponse {
    if body.accessions.is_empty() {
        return (StatusCode::OK, Json(serde_json::json!({ "success": true, "enqueued_count": 0 }))).into_response();
    }

    let base_dir = dirs::home_dir()
        .map(|h| h.join(".vortexflow"))
        .unwrap_or_else(|| PathBuf::from(".vortexflow"));

    let temp_dir = base_dir.join("temp").join("chunks");
    let layers = body.layers.unwrap_or_default();
    let count = body.accessions.len();

    let (task_id, accession_label, file_name, download_url) = if count == 1 {
        let acc = &body.accessions[0];
        (
            format!("{}_assembly_1", acc),
            acc.clone(),
            format!("{}_package.zip", acc),
            layers.build_download_url(acc),
        )
    } else {
        let now_ts = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis();
        (
            format!("pkg_genomes_{}_assemblies_{}", count, now_ts),
            format!("{} Assemblies", count),
            format!("genomes_package_{}_assemblies.zip", count),
            layers.build_download_url_batch(&body.accessions),
        )
    };

    if let Err(err) = state.collection_service.create_batch_download_task(
        &task_id,
        &file_name,
        &accession_label,
        "assembly",
        &download_url,
        &body.accessions,
    ) {
        return (StatusCode::INTERNAL_SERVER_ERROR, err.to_string()).into_response();
    }

    let dest_dir = base_dir.join("downloads").join("assembly");
    let destination_path = dest_dir.join(&file_name);

    let descriptor = DownloadTaskDescriptor {
        id: task_id.clone(),
        group_id: Some(accession_label),
        url: download_url,
        destination_path,
        temp_dir: temp_dir.clone(),
        expected_size_bytes: 0,
        priority: 10,
    };

    let mut enqueued = 0;
    if state.download_manager.submit_task(descriptor).await.is_ok() {
        enqueued = count;
    }

    (
        StatusCode::OK,
        Json(serde_json::json!({ "success": true, "enqueued_count": enqueued })),
    )
        .into_response()
}
