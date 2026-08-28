use std::path::PathBuf;
use axum::{
    extract::State,
    http::StatusCode,
    response::{
        sse::{Event, KeepAlive, Sse},
        IntoResponse,
    },
    routing::{get, post},
    Json, Router,
};
use futures_util::stream::Stream;
use serde::{Deserialize, Serialize};
use tokio_stream::wrappers::ReceiverStream;
use tokio_stream::StreamExt;
use vortexflow_engine::{EnvironmentManager, WorkflowExecutionReport, WorkflowExecutor, WorkflowStreamEvent};
use vortexflow_workflow::{validate_workflow, WorkflowError, WorkflowGraph};

use crate::state::AppState;

pub fn workflow_routes() -> Router<AppState> {
    Router::new()
        .route("/api/workflow/templates/resfinder", get(get_resfinder_template))
        .route("/api/workflow/validate", post(validate_graph_handler))
        .route("/api/workflow/run", post(run_workflow_handler))
        .route("/api/workflow/stream", post(stream_workflow_handler))
        .route("/api/workflow/pick-folder", post(pick_folder_handler))
}

#[derive(Debug, Serialize, Deserialize)]
pub struct PickFolderResponse {
    pub selected: bool,
    pub path: Option<String>,
    pub error: Option<String>,
}

/// POST /api/workflow/pick-folder
async fn pick_folder_handler() -> Json<PickFolderResponse> {
    #[cfg(target_os = "macos")]
    {
        let output = tokio::task::spawn_blocking(|| {
            std::process::Command::new("osascript")
                .arg("-e")
                .arg("POSIX path of (choose folder with prompt \"Select Directory\")")
                .output()
        })
        .await;

        if let Ok(Ok(out)) = output {
            if out.status.success() {
                let path_str = String::from_utf8_lossy(&out.stdout)
                    .trim()
                    .trim_end_matches('/')
                    .to_string();
                if !path_str.is_empty() {
                    return Json(PickFolderResponse {
                        selected: true,
                        path: Some(path_str),
                        error: None,
                    });
                }
            }
        }
    }

    #[cfg(target_os = "linux")]
    {
        let output = tokio::task::spawn_blocking(|| {
            std::process::Command::new("zenity")
                .args(&["--file-selection", "--directory", "--title=Select Directory"])
                .output()
        })
        .await;

        if let Ok(Ok(out)) = output {
            if out.status.success() {
                let path_str = String::from_utf8_lossy(&out.stdout).trim().to_string();
                if !path_str.is_empty() {
                    return Json(PickFolderResponse {
                        selected: true,
                        path: Some(path_str),
                        error: None,
                    });
                }
            }
        }
    }

    Json(PickFolderResponse {
        selected: false,
        path: None,
        error: None,
    })
}

/// GET /api/workflow/templates/resfinder
async fn get_resfinder_template() -> Json<WorkflowGraph> {
    Json(WorkflowGraph::template_resfinder())
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ValidateResponse {
    pub is_valid: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub execution_order: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error_type: Option<String>,
}

/// POST /api/workflow/validate
async fn validate_graph_handler(Json(graph): Json<WorkflowGraph>) -> impl IntoResponse {
    match validate_workflow(&graph) {
        Ok(report) => (
            StatusCode::OK,
            Json(ValidateResponse {
                is_valid: true,
                execution_order: Some(report.execution_order),
                error: None,
                error_type: None,
            }),
        ),
        Err(err) => {
            let error_type = match err {
                WorkflowError::CycleDetected { .. } => "cycle",
                WorkflowError::IncompatibleSocketTypes { .. } => "socket_mismatch",
                _ => "validation_error",
            };
            (
                StatusCode::BAD_REQUEST,
                Json(ValidateResponse {
                    is_valid: false,
                    execution_order: None,
                    error: Some(err.to_string()),
                    error_type: Some(error_type.to_string()),
                }),
            )
        }
    }
}

#[derive(Debug, Serialize, Deserialize)]
pub struct RunWorkflowResponse {
    pub success: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub report: Option<WorkflowExecutionReport>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error_type: Option<String>,
}

/// POST /api/workflow/run
async fn run_workflow_handler(
    State(state): State<AppState>,
    Json(graph): Json<WorkflowGraph>,
) -> impl IntoResponse {
    // 1. Validate graph first
    if let Err(err) = validate_workflow(&graph) {
        let error_type = match err {
            WorkflowError::CycleDetected { .. } => "cycle",
            WorkflowError::IncompatibleSocketTypes { .. } => "socket_mismatch",
            _ => "validation_error",
        };
        return (
            StatusCode::BAD_REQUEST,
            Json(RunWorkflowResponse {
                success: false,
                report: None,
                error: Some(err.to_string()),
                error_type: Some(error_type.to_string()),
            }),
        );
    }

    // 2. Prepare run directory inside ~/.vortexflow/runs/<run_id>
    let home = dirs::home_dir().unwrap_or_else(|| PathBuf::from("."));
    let run_id = uuid::Uuid::new_v4().to_string();
    let run_dir = home.join(".vortexflow").join("runs").join(&run_id);
    let env_dir = home.join(".vortexflow").join("envs");

    let env_mgr = EnvironmentManager::new(env_dir);
    let executor = WorkflowExecutor::new(env_mgr, state.manifest_loader.clone());

    match executor.execute(&graph, &run_dir).await {
        Ok(report) => {
            let is_success = report.is_success;
            let error_msg = if !is_success {
                report
                    .node_reports
                    .iter()
                    .find_map(|r| match &r.status {
                        vortexflow_engine::NodeStatus::Failed(err) => Some(err.clone()),
                        _ => None,
                    })
            } else {
                None
            };

            (
                StatusCode::OK,
                Json(RunWorkflowResponse {
                    success: is_success,
                    report: Some(report),
                    error: error_msg,
                    error_type: if !is_success {
                        Some("node_execution_failed".to_string())
                    } else {
                        None
                    },
                }),
            )
        }
        Err(err) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(RunWorkflowResponse {
                success: false,
                report: None,
                error: Some(err.to_string()),
                error_type: Some("execution_error".to_string()),
            }),
        ),
    }
}

/// POST /api/workflow/stream
/// Server-Sent Events (SSE) streaming live logs and node statuses during execution
async fn stream_workflow_handler(
    State(state): State<AppState>,
    Json(graph): Json<WorkflowGraph>,
) -> Sse<impl Stream<Item = Result<Event, std::convert::Infallible>>> {
    let (tx, rx) = tokio::sync::mpsc::channel::<WorkflowStreamEvent>(100);

    let home = dirs::home_dir().unwrap_or_else(|| PathBuf::from("."));
    let run_id = uuid::Uuid::new_v4().to_string();
    let run_dir = home.join(".vortexflow").join("runs").join(&run_id);
    let env_dir = home.join(".vortexflow").join("envs");

    let env_mgr = EnvironmentManager::new(env_dir);
    let executor = WorkflowExecutor::new(env_mgr, state.manifest_loader.clone());

    tokio::spawn(async move {
        let _ = executor.execute_stream(&graph, &run_dir, tx).await;
    });

    let stream = ReceiverStream::new(rx).map(|event| {
        let json_str = serde_json::to_string(&event).unwrap_or_default();
        Ok::<_, std::convert::Infallible>(Event::default().data(json_str))
    });

    Sse::new(stream).keep_alive(KeepAlive::default())
}
