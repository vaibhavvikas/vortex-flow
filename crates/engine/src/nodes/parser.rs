use std::collections::HashMap;
use std::path::{Path, PathBuf};
use tokio::sync::mpsc;
use vortexflow_workflow::{NodeDefinition, ToolManifest};

use crate::error::EngineError;
use crate::types::WorkflowStreamEvent;

/// Universal Parser Node Handler: Scans output folders and parses tabular artifacts into structured JSON
pub async fn execute_parser_tool(
    node: &vortexflow_workflow::WorkflowNode,
    _manifest: &ToolManifest,
    _node_def: Option<&NodeDefinition>,
    inputs: &HashMap<String, serde_json::Value>,
    work_dir: &Path,
    logs: &mut Vec<String>,
    event_tx: &mpsc::Sender<WorkflowStreamEvent>,
) -> Result<HashMap<String, serde_json::Value>, EngineError> {
    let msg = format!("Parsing analytical outputs for '{}'...", node.title);
    logs.push(msg.clone());
    let _ = event_tx
        .send(WorkflowStreamEvent::Log {
            node_id: node.id.clone(),
            line: msg,
        })
        .await;

    // 1. Locate the source folder from inputs
    let source_dir: PathBuf = if let Some(val) = inputs
        .get("resfinder_dir")
        .or_else(|| inputs.get("output_dir"))
        .or_else(|| inputs.get("work_dir"))
        .or_else(|| inputs.values().next())
    {
        if let Some(s) = val.as_str() {
            PathBuf::from(s)
        } else if let Some(obj) = val.as_object() {
            obj.get("work_dir")
                .or_else(|| obj.get("resfinder_dir"))
                .or_else(|| obj.get("output_dir"))
                .and_then(|v| v.as_str())
                .map(PathBuf::from)
                .unwrap_or_else(|| work_dir.to_path_buf())
        } else {
            work_dir.to_path_buf()
        }
    } else {
        work_dir.to_path_buf()
    };

    let mut outputs: HashMap<String, serde_json::Value> = HashMap::new();

    // 2. Universal Parsing: Scan all tabular and JSON files in source_dir
    if let Ok(entries) = std::fs::read_dir(&source_dir) {
        for entry in entries.flatten() {
            let file_path = entry.path();
            if file_path.is_file() {
                let file_name = file_path.file_name().and_then(|f| f.to_str()).unwrap_or("");
                let ext = file_path.extension().and_then(|e| e.to_str()).unwrap_or("");

                if ext == "tsv" || ext == "csv" || ext == "txt" {
                    if let Ok(content) = std::fs::read_to_string(&file_path) {
                        let parsed_rows = parse_tabular_content(&content);
                        if !parsed_rows.is_empty() {
                            let key = file_name
                                .trim_end_matches(".tsv")
                                .trim_end_matches(".csv")
                                .trim_end_matches(".txt")
                                .to_lowercase()
                                .replace([' ', '-'], "_");
                            outputs.insert(key, serde_json::json!(parsed_rows));
                        }
                    }
                } else if ext == "json"
                    && let Ok(content) = std::fs::read_to_string(&file_path)
                        && let Ok(val) = serde_json::from_str::<serde_json::Value>(&content) {
                            let key = file_name.trim_end_matches(".json").to_lowercase();
                            outputs.insert(key, val);
                        }
            }
        }
    }

    // 3. Domain Normalizations (e.g. ResFinder/PointFinder AMR profiles)
    let resfinder_tab = source_dir.join("ResFinder_results_tab.txt");
    if resfinder_tab.exists()
        && let Ok(content) = tokio::fs::read_to_string(&resfinder_tab).await {
            let mut amr_genes = Vec::new();
            for line in content.lines().skip(1) {
                let parts: Vec<&str> = line.split('\t').collect();
                if parts.len() >= 4 {
                    amr_genes.push(serde_json::json!({
                        "gene": parts[0],
                        "identity": parts[1].parse::<f64>().unwrap_or(100.0),
                        "alignment": parts[2],
                        "coverage": parts[3].parse::<f64>().unwrap_or(100.0),
                        "phenotype": parts.get(7).unwrap_or(&"Resistant").to_string(),
                    }));
                }
            }
            outputs.insert("amr_genes".to_string(), serde_json::json!(amr_genes));
        }

    let pheno_tab = source_dir.join("pheno_table.txt");
    if pheno_tab.exists()
        && let Ok(content) = tokio::fs::read_to_string(&pheno_tab).await {
            let mut phenotypes = Vec::new();
            for line in content.lines().skip(1) {
                let parts: Vec<&str> = line.split('\t').collect();
                if parts.len() >= 3 {
                    let pheno_str = parts.get(2).unwrap_or(&"Resistant").to_string();
                    let is_resistant = pheno_str.to_lowercase().contains("resis")
                        || pheno_str.to_lowercase().contains("resistant");
                    phenotypes.push(serde_json::json!({
                        "antimicrobial": parts[0],
                        "class": parts.get(1).unwrap_or(&"").to_string(),
                        "phenotype": pheno_str,
                        "resistant": is_resistant,
                        "genetic_background": parts.get(3).unwrap_or(&"").to_string(),
                    }));
                }
            }
            outputs.insert("phenotype_profile".to_string(), serde_json::json!(phenotypes));
        }

    let point_tab = source_dir.join("PointFinder_results.txt");
    if point_tab.exists()
        && let Ok(content) = tokio::fs::read_to_string(&point_tab).await {
            let mut point_mutations = Vec::new();
            for line in content.lines().skip(1) {
                let parts: Vec<&str> = line.split('\t').collect();
                if parts.len() >= 3 {
                    point_mutations.push(serde_json::json!({
                        "mutation": parts[0],
                        "nucleotide_change": parts.get(1).unwrap_or(&"").to_string(),
                        "amino_acid_change": parts.get(2).unwrap_or(&"").to_string(),
                        "phenotype": parts.get(3).unwrap_or(&"Resistant").to_string(),
                    }));
                }
            }
            outputs.insert("point_mutations".to_string(), serde_json::json!(point_mutations));
        }

    let summary_log = format!(
        "Universal Parser extracted {} analytical output dataset(s) from {:?}",
        outputs.len(),
        source_dir
    );
    logs.push(summary_log.clone());
    let _ = event_tx
        .send(WorkflowStreamEvent::Log {
            node_id: node.id.clone(),
            line: summary_log,
        })
        .await;

    outputs.insert(
        "work_dir".to_string(),
        serde_json::json!(source_dir.to_string_lossy()),
    );

    Ok(outputs)
}

/// Helper for universally parsing CSV/TSV table formats
pub fn parse_tabular_content(content: &str) -> Vec<serde_json::Value> {
    let mut lines = content.lines().filter(|l| !l.trim().is_empty());
    let header_line = match lines.next() {
        Some(h) => h,
        None => return Vec::new(),
    };

    let delimiter = if header_line.contains('\t') {
        '\t'
    } else if header_line.contains(',') {
        ','
    } else {
        '\t'
    };

    let headers: Vec<String> = header_line
        .split(delimiter)
        .map(|h| {
            h.trim()
                .trim_matches('"')
                .to_lowercase()
                .replace([' ', '-', '%', '#'], "_")
        })
        .collect();

    let mut rows = Vec::new();
    for line in lines {
        let values: Vec<&str> = line
            .split(delimiter)
            .map(|v| v.trim().trim_matches('"'))
            .collect();
        let mut row_map = serde_json::Map::new();
        for (i, header) in headers.iter().enumerate() {
            let val_str = values.get(i).copied().unwrap_or("");
            if let Ok(num) = val_str.parse::<f64>() {
                row_map.insert(header.clone(), serde_json::json!(num));
            } else if let Ok(b) = val_str.parse::<bool>() {
                row_map.insert(header.clone(), serde_json::json!(b));
            } else {
                row_map.insert(header.clone(), serde_json::json!(val_str));
            }
        }
        rows.push(serde_json::Value::Object(row_map));
    }
    rows
}
