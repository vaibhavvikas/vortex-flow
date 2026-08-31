use std::collections::HashMap;
use std::path::{Path, PathBuf};
use tokio::sync::mpsc;
use vortexflow_workflow::WorkflowNode;

use crate::error::EngineError;
use crate::types::WorkflowStreamEvent;

/// Lightweight read of tabular header columns for dynamic UI widgets before full workflow execution.
///
/// # Performance
/// Uses `BufReader` to read **only the first non-empty line**, keeping memory usage O(1)
/// regardless of file size. A 10 GB TSV reads the same number of bytes as a 1 KB one.
pub fn peek_columns(file_path: &Path, format_hint: Option<&str>) -> Result<Vec<String>, String> {
    use std::io::{BufRead, BufReader};

    if !file_path.exists() {
        return Err(format!("File {:?} does not exist", file_path));
    }

    let ext = file_path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase();

    let is_csv = format_hint == Some("csv") || ext == "csv";

    // Open and read only the first non-empty line
    let file = std::fs::File::open(file_path)
        .map_err(|e| format!("Failed to open file {:?}: {}", file_path, e))?;
    let mut reader = BufReader::new(file);

    let mut header_line = String::new();
    loop {
        header_line.clear();
        let n = reader
            .read_line(&mut header_line)
            .map_err(|e| format!("Failed to read file {:?}: {}", file_path, e))?;
        if n == 0 {
            return Err("File is empty or has no header row".to_string());
        }
        if !header_line.trim().is_empty() {
            break;
        }
    }

    let delimiter = if is_csv {
        ','
    } else if header_line.contains('\t') {
        '\t'
    } else if header_line.contains(',') {
        ','
    } else {
        '\t'
    };

    let columns: Vec<String> = header_line
        .split(delimiter)
        .map(|h| h.trim().trim_matches('"').to_string())
        .filter(|h| !h.is_empty())
        .collect();

    Ok(columns)
}

/// Executes the core.column_selector node, converting input TSV/CSV/XLSX into normalized `core.tabular_data`
pub async fn execute_column_selector(
    node: &WorkflowNode,
    inputs: &HashMap<String, serde_json::Value>,
    work_dir: &Path,
    logs: &mut Vec<String>,
    event_tx: &mpsc::Sender<WorkflowStreamEvent>,
) -> Result<HashMap<String, serde_json::Value>, EngineError> {
    let msg = format!("Transforming table columns for '{}'...", node.title);
    logs.push(msg.clone());
    let _ = event_tx
        .send(WorkflowStreamEvent::Log {
            node_id: node.id.clone(),
            line: msg,
        })
        .await;

    // 1. Resolve source tabular file
    let input_path: PathBuf = if let Some(val) = inputs.get("table_file").or_else(|| inputs.values().next()) {
        if let Some(s) = val.as_str() {
            PathBuf::from(s)
        } else {
            return Err(EngineError::MissingInput {
                node_id: node.id.clone(),
                port_id: "table_file".to_string(),
            });
        }
    } else {
        return Err(EngineError::MissingInput {
            node_id: node.id.clone(),
            port_id: "table_file".to_string(),
        });
    };

    if !input_path.exists() {
        return Err(EngineError::NodeExecutionFailed {
            node_id: node.id.clone(),
            message: format!("Source tabular file {:?} was not found", input_path),
        });
    }

    // --- Performance: stream line-by-line instead of loading the entire file ---
    // A genomics TSV can be gigabytes. tokio::fs::read_to_string would OOM.
    // Instead we open an async BufReader and process one line at a time.
    use tokio::io::{AsyncBufReadExt, BufReader as AsyncBufReader};
    let file = tokio::fs::File::open(&input_path).await.map_err(|e| {
        EngineError::NodeExecutionFailed {
            node_id: node.id.clone(),
            message: format!("Cannot open {:?}: {}", input_path, e),
        }
    })?;
    let mut reader = AsyncBufReader::new(file);

    // Read header
    let mut header_buf = String::new();
    loop {
        header_buf.clear();
        let n = reader.read_line(&mut header_buf).await.map_err(|e| {
            EngineError::NodeExecutionFailed {
                node_id: node.id.clone(),
                message: format!("Failed to read header of {:?}: {}", input_path, e),
            }
        })?;
        if n == 0 {
            return Err(EngineError::NodeExecutionFailed {
                node_id: node.id.clone(),
                message: "Tabular input file is empty".to_string(),
            });
        }
        if !header_buf.trim().is_empty() {
            break;
        }
    }

    let header_line = header_buf.trim_end_matches(['\n', '\r']);
    let delimiter = if header_line.contains('\t') { '\t' } else { ',' };

    let all_headers: Vec<String> = header_line
        .split(delimiter)
        .map(|h| h.trim().trim_matches('"').to_string())
        .collect();

    // 2. Determine target columns
    let selected_cols: Vec<String> = if let Some(arr) = node
        .params
        .get("selected_columns")
        .and_then(|v| v.as_array())
    {
        arr.iter()
            .filter_map(|v| v.as_str().map(String::from))
            .collect()
    } else {
        all_headers.clone()
    };

    let active_cols = if selected_cols.is_empty() {
        all_headers.clone()
    } else {
        selected_cols
    };

    // Find indices for active columns
    let mut col_indices: Vec<(String, usize)> = Vec::new();
    for col_name in &active_cols {
        if let Some(idx) = all_headers.iter().position(|h| h.eq_ignore_ascii_case(col_name)) {
            col_indices.push((col_name.clone(), idx));
        }
    }

    // 3. Build column-oriented `core.tabular_data`
    let mut columns_data: HashMap<String, Vec<serde_json::Value>> = HashMap::new();
    for (name, _) in &col_indices {
        columns_data.insert(name.clone(), Vec::new());
    }

    let mut row_count = 0;
    let mut line_buf = String::new();
    loop {
        line_buf.clear();
        let n = reader.read_line(&mut line_buf).await.map_err(|e| {
            EngineError::NodeExecutionFailed {
                node_id: node.id.clone(),
                message: format!("Error reading row from {:?}: {}", input_path, e),
            }
        })?;
        if n == 0 { break; } // EOF
        let line = line_buf.trim();
        if line.is_empty() { continue; }

        row_count += 1;
        let parts: Vec<&str> = line.split(delimiter).map(|v| v.trim().trim_matches('"')).collect();

        for (col_name, idx) in &col_indices {
            let raw_val = parts.get(*idx).copied().unwrap_or("");
            let val = if let Ok(num) = raw_val.parse::<f64>() {
                serde_json::json!(num)
            } else if let Ok(b) = raw_val.parse::<bool>() {
                serde_json::json!(b)
            } else {
                serde_json::json!(raw_val)
            };
            if let Some(vec) = columns_data.get_mut(col_name) {
                vec.push(val);
            }
        }
    }

    let columns_array: Vec<serde_json::Value> = col_indices
        .iter()
        .map(|(name, _)| {
            serde_json::json!({
                "name": name,
                "values": columns_data.get(name).cloned().unwrap_or_default()
            })
        })
        .collect();

    let normalized_json = serde_json::json!({
        "schema": "core.tabular_data",
        "row_count": row_count,
        "columns": columns_array,
    });

    let output_file_path = work_dir.join("tabular_data.json");
    tokio::fs::write(&output_file_path, serde_json::to_string_pretty(&normalized_json)?).await?;

    let log_complete = format!(
        "Normalized {} rows and {} columns into {:?}",
        row_count,
        col_indices.len(),
        output_file_path
    );
    logs.push(log_complete.clone());
    let _ = event_tx
        .send(WorkflowStreamEvent::Log {
            node_id: node.id.clone(),
            line: log_complete,
        })
        .await;

    let mut outputs = HashMap::new();
    outputs.insert(
        "tabular_data".to_string(),
        serde_json::json!(output_file_path.to_string_lossy()),
    );
    outputs.insert(
        "work_dir".to_string(),
        serde_json::json!(work_dir.to_string_lossy()),
    );

    Ok(outputs)
}
