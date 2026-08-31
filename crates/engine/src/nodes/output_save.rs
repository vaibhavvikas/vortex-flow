use std::collections::HashMap;
use std::path::{Path, PathBuf};
use tokio::sync::mpsc;

use crate::error::EngineError;
use crate::types::WorkflowStreamEvent;

/// Handler for Output Directory Save sink nodes
pub async fn execute_output_save(
    node: &vortexflow_workflow::WorkflowNode,
    inputs: &HashMap<String, serde_json::Value>,
    _work_dir: &Path,
    logs: &mut Vec<String>,
    event_tx: &mpsc::Sender<WorkflowStreamEvent>,
) -> Result<HashMap<String, serde_json::Value>, EngineError> {
    let dest_str = node
        .params
        .get("destination_dir")
        .and_then(|v| v.as_str())
        .unwrap_or("");

    let dest_dir = if dest_str.trim().is_empty() {
        let default_out = dirs::home_dir()
            .unwrap_or_else(|| PathBuf::from("."))
            .join(".vortexflow")
            .join("outputs");
        let _ = tokio::fs::create_dir_all(&default_out).await;
        default_out
    } else {
        PathBuf::from(dest_str)
    };

    tokio::fs::create_dir_all(&dest_dir).await?;

    let save_msg = format!("Saving pipeline outputs to {:?}", dest_dir);
    logs.push(save_msg.clone());
    let _ = event_tx
        .send(WorkflowStreamEvent::Log {
            node_id: node.id.clone(),
            line: save_msg,
        })
        .await;

    let mut saved_files = Vec::new();
    for (port_id, val) in inputs {
        if let Some(src_str) = val.as_str() {
            let src_path = PathBuf::from(src_str);
            if src_path.exists() {
                if src_path.is_file() {
                    let filename = src_path.file_name().unwrap_or_default();
                    let target_path = dest_dir.join(filename);
                    if tokio::fs::copy(&src_path, &target_path).await.is_ok() {
                        let c_msg = format!("Exported artifact {:?} -> {:?}", filename, target_path);
                        logs.push(c_msg.clone());
                        let _ = event_tx
                            .send(WorkflowStreamEvent::Log {
                                node_id: node.id.clone(),
                                line: c_msg,
                            })
                            .await;
                        saved_files.push(target_path.to_string_lossy().to_string());
                    }
                } else if src_path.is_dir()
                    && let Ok(entries) = std::fs::read_dir(&src_path) {
                        for entry in entries.flatten() {
                            let item_path = entry.path();
                            if item_path.is_file() {
                                let filename = item_path.file_name().unwrap_or_default();
                                let target_path = dest_dir.join(filename);
                                if tokio::fs::copy(&item_path, &target_path).await.is_ok() {
                                    let c_msg = format!("Exported folder item {:?} -> {:?}", filename, target_path);
                                    logs.push(c_msg.clone());
                                    let _ = event_tx
                                        .send(WorkflowStreamEvent::Log {
                                            node_id: node.id.clone(),
                                            line: c_msg,
                                        })
                                        .await;
                                    saved_files.push(target_path.to_string_lossy().to_string());
                                }
                            }
                        }
                    }
            }
        } else if let Some(arr) = val.as_array() {
            let json_filename = format!("{}.json", port_id);
            let target_path = dest_dir.join(&json_filename);
            if let Ok(json_str) = serde_json::to_string_pretty(arr)
                && tokio::fs::write(&target_path, json_str).await.is_ok() {
                    let c_msg = format!("Exported dataset [{}] -> {:?}", port_id, target_path);
                    logs.push(c_msg.clone());
                    let _ = event_tx
                        .send(WorkflowStreamEvent::Log {
                            node_id: node.id.clone(),
                            line: c_msg,
                        })
                        .await;
                    saved_files.push(target_path.to_string_lossy().to_string());
                }
        } else if let Some(map) = val.as_object() {
            for (k, v) in map {
                if let Some(src_str) = v.as_str() {
                    let src_path = PathBuf::from(src_str);
                    if src_path.exists() && src_path.is_file() {
                        let filename = src_path.file_name().unwrap_or_default();
                        let target_path = dest_dir.join(filename);
                        if tokio::fs::copy(&src_path, &target_path).await.is_ok() {
                            let c_msg = format!("Exported [{}] {:?} -> {:?}", k, filename, target_path);
                            logs.push(c_msg.clone());
                            let _ = event_tx
                                .send(WorkflowStreamEvent::Log {
                                    node_id: node.id.clone(),
                                    line: c_msg,
                                })
                                .await;
                            saved_files.push(target_path.to_string_lossy().to_string());
                        }
                    }
                }
            }
        }
    }

    let mut outputs = HashMap::new();
    outputs.insert(
        "saved_destination".to_string(),
        serde_json::json!({
            "destination_dir": dest_dir.to_string_lossy(),
            "saved_files": saved_files,
            "count": saved_files.len()
        }),
    );

    let open_folder = node
        .params
        .get("open_folder")
        .and_then(|v| v.as_bool())
        .unwrap_or(false);

    if open_folder && dest_dir.exists() {
        let folder_to_open = dest_dir.clone();
        tokio::task::spawn_blocking(move || {
            #[cfg(target_os = "macos")]
            {
                let _ = std::process::Command::new("open").arg(&folder_to_open).spawn();
            }
            #[cfg(target_os = "windows")]
            {
                let _ = std::process::Command::new("explorer").arg(&folder_to_open).spawn();
            }
            #[cfg(target_os = "linux")]
            {
                let _ = std::process::Command::new("xdg-open").arg(&folder_to_open).spawn();
            }
        });
    }

    Ok(outputs)
}
