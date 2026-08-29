use std::collections::HashMap;
use std::path::{Path, PathBuf};
use tokio::sync::mpsc;
use walkdir::WalkDir;

use crate::error::EngineError;
use crate::types::WorkflowStreamEvent;

/// Handler for Folder Input ingestion nodes
pub async fn execute_folder_input(
    node: &vortexflow_workflow::WorkflowNode,
    _inputs: &HashMap<String, serde_json::Value>,
    _work_dir: &Path,
    logs: &mut Vec<String>,
    event_tx: &mpsc::Sender<WorkflowStreamEvent>,
) -> Result<HashMap<String, serde_json::Value>, EngineError> {
    let dir_str = node
        .params
        .get("directory_path")
        .and_then(|v| v.as_str())
        .unwrap_or("");

    if dir_str.trim().is_empty() {
        return Err(EngineError::NodeExecutionFailed {
            node_id: node.id.clone(),
            message: "No folder path provided for Folder Input node. Click Browse to select a directory.".to_string(),
        });
    }

    let dir_path = PathBuf::from(dir_str);
    if !dir_path.exists() || !dir_path.is_dir() {
        return Err(EngineError::NodeExecutionFailed {
            node_id: node.id.clone(),
            message: format!("Directory path does not exist: {:?}", dir_path),
        });
    }

    let pattern = node
        .params
        .get("file_pattern")
        .and_then(|v| v.as_str())
        .unwrap_or("*.fasta,*.fna,*.fa,*.fastq,*.fq");

    let msg = format!("Scanning directory {:?} with filter [{}]", dir_path, pattern);
    logs.push(msg.clone());
    let _ = event_tx
        .send(WorkflowStreamEvent::Log {
            node_id: node.id.clone(),
            line: msg,
        })
        .await;

    let extensions: Vec<&str> = pattern
        .split(',')
        .map(|s| s.trim().trim_start_matches('*').trim_start_matches('.'))
        .collect();

    let mut matched_files: Vec<String> = Vec::new();
    for entry in WalkDir::new(&dir_path).max_depth(2).into_iter().filter_map(|e| e.ok()) {
        if entry.file_type().is_file() {
            let path = entry.path();
            if let Some(ext) = path.extension().and_then(|e| e.to_str()) {
                if extensions.iter().any(|&target| target.eq_ignore_ascii_case(ext)) {
                    matched_files.push(path.to_string_lossy().to_string());
                }
            }
        }
    }

    matched_files.sort();

    let found_msg = format!("Found {} sequence file(s) in folder", matched_files.len());
    logs.push(found_msg.clone());
    let _ = event_tx
        .send(WorkflowStreamEvent::Log {
            node_id: node.id.clone(),
            line: found_msg,
        })
        .await;

    if matched_files.is_empty() {
        return Err(EngineError::NodeExecutionFailed {
            node_id: node.id.clone(),
            message: format!("No matching sequence files found in {:?} matching [{}]", dir_path, pattern),
        });
    }

    let mut outputs = HashMap::new();
    outputs.insert(
        "sequence_files".to_string(),
        serde_json::json!({
            "folder_path": dir_path.to_string_lossy(),
            "files": matched_files,
            "count": matched_files.len()
        }),
    );

    Ok(outputs)
}
