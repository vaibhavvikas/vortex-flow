use axum::{
    extract::{Path, State},
    http::StatusCode,
    response::IntoResponse,
    routing::{get, post},
    Json, Router,
};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use vortexflow_engine::{EnvironmentManager, ToolInstaller};
use vortexflow_workflow::ToolManifest;
use crate::state::AppState;

#[derive(Debug, Serialize, Deserialize)]
pub struct ExtensionStatusDto {
    pub manifest: ToolManifest,
    pub is_installed: bool,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct InstallResponse {
    pub success: bool,
    pub message: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct InstallLogsResponse {
    pub tool_id: String,
    pub is_installed: bool,
    pub logs: Vec<String>,
}

pub fn manifest_routes() -> Router<AppState> {
    Router::new()
        .route("/api/manifests", get(list_manifests_handler))
        .route("/api/manifests/{id}", get(get_manifest_handler))
        .route("/api/manifests/{id}/status", get(get_manifest_status_handler))
        .route("/api/manifests/{id}/logs", get(get_manifest_logs_handler))
        .route("/api/manifests/{id}/install", post(install_manifest_handler))
        .route("/api/manifests/{id}/uninstall", post(uninstall_manifest_handler))
}

/// GET /api/manifests - Lists all discovered extension tool manifests with install status
async fn list_manifests_handler(State(state): State<AppState>) -> Json<Vec<ExtensionStatusDto>> {
    let home = dirs::home_dir().unwrap_or_else(|| PathBuf::from("."));
    let env_mgr = EnvironmentManager::new(home.join(".vortexflow").join("envs"));
    let installer = ToolInstaller::with_log_manager(env_mgr, state.install_log_mgr.as_ref().clone());

    let list = state.manifest_loader.list();
    let result = list
        .into_iter()
        .map(|m| {
            let is_installed = installer.is_installed(&m);
            ExtensionStatusDto {
                manifest: m,
                is_installed,
            }
        })
        .collect();

    Json(result)
}

/// GET /api/manifests/:id - Gets a single tool manifest by ID
async fn get_manifest_handler(
    State(state): State<AppState>,
    Path(tool_id): Path<String>,
) -> impl IntoResponse {
    if let Some(manifest) = state.manifest_loader.get(&tool_id) {
        (StatusCode::OK, Json(Some(manifest)))
    } else {
        (StatusCode::NOT_FOUND, Json(None))
    }
}

/// GET /api/manifests/:id/status - Checks install status
async fn get_manifest_status_handler(
    State(state): State<AppState>,
    Path(tool_id): Path<String>,
) -> impl IntoResponse {
    if let Some(manifest) = state.manifest_loader.get(&tool_id) {
        let home = dirs::home_dir().unwrap_or_else(|| PathBuf::from("."));
        let env_mgr = EnvironmentManager::new(home.join(".vortexflow").join("envs"));
        let installer = ToolInstaller::with_log_manager(env_mgr, state.install_log_mgr.as_ref().clone());
        let is_installed = installer.is_installed(&manifest);

        (StatusCode::OK, Json(Some(ExtensionStatusDto { manifest, is_installed })))
    } else {
        (StatusCode::NOT_FOUND, Json(None))
    }
}

/// GET /api/manifests/:id/logs - Fetches live installation logs for a tool
async fn get_manifest_logs_handler(
    State(state): State<AppState>,
    Path(tool_id): Path<String>,
) -> impl IntoResponse {
    let home = dirs::home_dir().unwrap_or_else(|| PathBuf::from("."));
    let env_mgr = EnvironmentManager::new(home.join(".vortexflow").join("envs"));
    let installer = ToolInstaller::with_log_manager(env_mgr, state.install_log_mgr.as_ref().clone());

    let is_installed = if let Some(manifest) = state.manifest_loader.get(&tool_id) {
        installer.is_installed(&manifest)
    } else {
        false
    };

    let logs = state.install_log_mgr.get_logs(&tool_id);

    (
        StatusCode::OK,
        Json(InstallLogsResponse {
            tool_id,
            is_installed,
            logs,
        }),
    )
}

/// POST /api/manifests/:id/install - Triggers live installation of packages and databases
async fn install_manifest_handler(
    State(state): State<AppState>,
    Path(tool_id): Path<String>,
) -> impl IntoResponse {
    if let Some(manifest) = state.manifest_loader.get(&tool_id) {
        let home = dirs::home_dir().unwrap_or_else(|| PathBuf::from("."));
        let env_mgr = EnvironmentManager::new(home.join(".vortexflow").join("envs"));
        let installer = ToolInstaller::with_log_manager(env_mgr, state.install_log_mgr.as_ref().clone());

        tokio::spawn(async move {
            if let Err(e) = installer.install(&manifest).await {
                tracing::error!("Failed to install tool {}: {}", manifest.id, e);
            }
        });

        (
            StatusCode::ACCEPTED,
            Json(InstallResponse {
                success: true,
                message: format!("Started live installation for tool '{}'", tool_id),
            }),
        )
    } else {
        (
            StatusCode::NOT_FOUND,
            Json(InstallResponse {
                success: false,
                message: format!("Manifest '{}' not found", tool_id),
            }),
        )
    }
}

/// POST /api/manifests/:id/uninstall - Uninstalls the tool and removes isolated environment
async fn uninstall_manifest_handler(
    State(state): State<AppState>,
    Path(tool_id): Path<String>,
) -> impl IntoResponse {
    if let Some(manifest) = state.manifest_loader.get(&tool_id) {
        let home = dirs::home_dir().unwrap_or_else(|| PathBuf::from("."));
        let env_mgr = EnvironmentManager::new(home.join(".vortexflow").join("envs"));
        let installer = ToolInstaller::with_log_manager(env_mgr, state.install_log_mgr.as_ref().clone());

        match installer.uninstall(&manifest).await {
            Ok(_) => (
                StatusCode::OK,
                Json(InstallResponse {
                    success: true,
                    message: format!("Successfully uninstalled tool '{}'", tool_id),
                }),
            ),
            Err(e) => (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(InstallResponse {
                    success: false,
                    message: format!("Failed to uninstall tool '{}': {}", tool_id, e),
                }),
            ),
        }
    } else {
        (
            StatusCode::NOT_FOUND,
            Json(InstallResponse {
                success: false,
                message: format!("Manifest '{}' not found", tool_id),
            }),
        )
    }
}
