use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::sync::Arc;
use std::time::Instant;
use serde::{Deserialize, Serialize};
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::sync::mpsc;
use walkdir::WalkDir;

use vortexflow_workflow::{
    validate_workflow, ExecutionStrategy, ManifestLoader, NodeKind, ToolManifest, WorkflowGraph,
};
use crate::env::EnvironmentManager;
use crate::error::EngineError;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum NodeStatus {
    Idle,
    InstallingEnv,
    Running,
    Completed,
    Failed(String),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NodeExecutionReport {
    pub node_id: String,
    pub status: NodeStatus,
    pub duration_ms: u64,
    pub outputs: HashMap<String, serde_json::Value>,
    pub logs: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkflowExecutionReport {
    pub run_id: String,
    pub is_success: bool,
    pub node_reports: Vec<NodeExecutionReport>,
    pub total_duration_ms: u64,
}

/// Real-time event emitted during workflow execution stream
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum WorkflowStreamEvent {
    WorkflowStart {
        run_id: String,
    },
    NodeStart {
        node_id: String,
        title: String,
    },
    Log {
        node_id: String,
        line: String,
    },
    NodeComplete {
        node_id: String,
        duration_ms: u64,
        outputs: HashMap<String, serde_json::Value>,
    },
    NodeError {
        node_id: String,
        error: String,
    },
    WorkflowComplete {
        run_id: String,
        is_success: bool,
        total_duration_ms: u64,
        report: WorkflowExecutionReport,
    },
    WorkflowError {
        error: String,
    },
}

pub struct WorkflowExecutor {
    env_mgr: EnvironmentManager,
    manifest_loader: Arc<ManifestLoader>,
}

impl WorkflowExecutor {
    pub fn new(env_mgr: EnvironmentManager, manifest_loader: Arc<ManifestLoader>) -> Self {
        Self {
            env_mgr,
            manifest_loader,
        }
    }

    /// Executes a workflow DAG and streams live events over an mpsc channel
    pub async fn execute_stream(
        &self,
        graph: &WorkflowGraph,
        run_dir: &Path,
        event_tx: mpsc::Sender<WorkflowStreamEvent>,
    ) -> Result<WorkflowExecutionReport, EngineError> {
        let start_time = Instant::now();
        let run_id = uuid::Uuid::new_v4().to_string();

        let _ = event_tx
            .send(WorkflowStreamEvent::WorkflowStart {
                run_id: run_id.clone(),
            })
            .await;

        // 1. Validate DAG and get execution order
        let validation = match validate_workflow(graph) {
            Ok(v) => v,
            Err(e) => {
                let err_msg = e.to_string();
                let _ = event_tx
                    .send(WorkflowStreamEvent::WorkflowError {
                        error: err_msg.clone(),
                    })
                    .await;
                return Err(EngineError::from(e));
            }
        };

        if let Err(e) = tokio::fs::create_dir_all(run_dir).await {
            let err_msg = format!("Failed to create run directory: {}", e);
            let _ = event_tx
                .send(WorkflowStreamEvent::WorkflowError {
                    error: err_msg.clone(),
                })
                .await;
            return Err(EngineError::Io(e));
        }

        let mut node_outputs: HashMap<String, HashMap<String, serde_json::Value>> = HashMap::new();
        let mut node_reports: Vec<NodeExecutionReport> = Vec::new();

        // 2. Execute nodes sequentially in DAG order
        for node_id in &validation.execution_order {
            let node = match graph.nodes.iter().find(|n| n.id == *node_id) {
                Some(n) => n,
                None => {
                    let err_msg = format!("Node '{}' not found in graph", node_id);
                    let _ = event_tx
                        .send(WorkflowStreamEvent::NodeError {
                            node_id: node_id.clone(),
                            error: err_msg.clone(),
                        })
                        .await;
                    return Err(EngineError::NodeExecutionFailed {
                        node_id: node_id.clone(),
                        message: err_msg,
                    });
                }
            };

            let _ = event_tx
                .send(WorkflowStreamEvent::NodeStart {
                    node_id: node.id.clone(),
                    title: node.title.clone(),
                })
                .await;

            let node_start = Instant::now();
            let mut logs = Vec::new();
            let start_log = format!("Starting execution of node '{}' ({})", node.title, node.id);
            logs.push(start_log.clone());
            let _ = event_tx
                .send(WorkflowStreamEvent::Log {
                    node_id: node.id.clone(),
                    line: start_log,
                })
                .await;

            // Gather inputs for this node from incoming edges
            let mut resolved_inputs: HashMap<String, serde_json::Value> = HashMap::new();
            for edge in graph.edges.iter().filter(|e| e.target_node == node.id) {
                if let Some(src_outputs) = node_outputs.get(&edge.source_node) {
                    if let Some(val) = src_outputs.get(&edge.source_port) {
                        resolved_inputs.insert(edge.target_port.clone(), val.clone());
                    }
                }
            }

            let node_run_dir = run_dir.join(&node.id);
            tokio::fs::create_dir_all(&node_run_dir).await?;

            let exec_res = match &node.kind {
                NodeKind::FolderInput => {
                    self.execute_folder_input(
                        node,
                        &resolved_inputs,
                        &node_run_dir,
                        &mut logs,
                        &event_tx,
                    )
                    .await
                }
                NodeKind::Tool(tool_id) => {
                    if let Some(manifest) = self.manifest_loader.get(tool_id) {
                        self.execute_manifest_tool(
                            node,
                            &manifest,
                            &resolved_inputs,
                            &node_run_dir,
                            &mut logs,
                            &event_tx,
                        )
                        .await
                    } else if tool_id == "resfinder" {
                        let default_manifest = self.create_default_resfinder_manifest();
                        self.execute_manifest_tool(
                            node,
                            &default_manifest,
                            &resolved_inputs,
                            &node_run_dir,
                            &mut logs,
                            &event_tx,
                        )
                        .await
                    } else {
                        Err(EngineError::NodeExecutionFailed {
                            node_id: node.id.clone(),
                            message: format!("Extension manifest for tool '{}' not found. Please install it from the Extensions tab.", tool_id),
                        })
                    }
                }
                NodeKind::OutputSave => {
                    self.execute_output_save(
                        node,
                        &resolved_inputs,
                        &node_run_dir,
                        &mut logs,
                        &event_tx,
                    )
                    .await
                }
            };

            let node_duration = node_start.elapsed().as_millis() as u64;

            match exec_res {
                Ok(outputs) => {
                    let comp_log = format!(
                        "Node '{}' completed successfully in {}ms",
                        node.title, node_duration
                    );
                    logs.push(comp_log.clone());
                    let _ = event_tx
                        .send(WorkflowStreamEvent::Log {
                            node_id: node.id.clone(),
                            line: comp_log,
                        })
                        .await;

                    let _ = event_tx
                        .send(WorkflowStreamEvent::NodeComplete {
                            node_id: node.id.clone(),
                            duration_ms: node_duration,
                            outputs: outputs.clone(),
                        })
                        .await;

                    node_outputs.insert(node.id.clone(), outputs.clone());
                    node_reports.push(NodeExecutionReport {
                        node_id: node.id.clone(),
                        status: NodeStatus::Completed,
                        duration_ms: node_duration,
                        outputs,
                        logs,
                    });
                }
                Err(err) => {
                    let err_msg = err.to_string();
                    let fail_log = format!("Node '{}' failed: {}", node.title, err_msg);
                    logs.push(fail_log.clone());
                    let _ = event_tx
                        .send(WorkflowStreamEvent::Log {
                            node_id: node.id.clone(),
                            line: fail_log,
                        })
                        .await;

                    let _ = event_tx
                        .send(WorkflowStreamEvent::NodeError {
                            node_id: node.id.clone(),
                            error: err_msg.clone(),
                        })
                        .await;

                    node_reports.push(NodeExecutionReport {
                        node_id: node.id.clone(),
                        status: NodeStatus::Failed(err_msg.clone()),
                        duration_ms: node_duration,
                        outputs: HashMap::new(),
                        logs,
                    });

                    let report = WorkflowExecutionReport {
                        run_id: run_id.clone(),
                        is_success: false,
                        node_reports,
                        total_duration_ms: start_time.elapsed().as_millis() as u64,
                    };

                    let _ = event_tx
                        .send(WorkflowStreamEvent::WorkflowComplete {
                            run_id,
                            is_success: false,
                            total_duration_ms: report.total_duration_ms,
                            report: report.clone(),
                        })
                        .await;

                    return Ok(report);
                }
            }
        }

        let total_duration = start_time.elapsed().as_millis() as u64;
        let report = WorkflowExecutionReport {
            run_id: run_id.clone(),
            is_success: true,
            node_reports,
            total_duration_ms: total_duration,
        };

        let _ = event_tx
            .send(WorkflowStreamEvent::WorkflowComplete {
                run_id,
                is_success: true,
                total_duration_ms: total_duration,
                report: report.clone(),
            })
            .await;

        Ok(report)
    }

    /// Backwards compatible execute method
    pub async fn execute(
        &self,
        graph: &WorkflowGraph,
        run_dir: &Path,
    ) -> Result<WorkflowExecutionReport, EngineError> {
        let (tx, mut rx) = mpsc::channel(100);
        tokio::spawn(async move {
            while rx.recv().await.is_some() {}
        });
        self.execute_stream(graph, run_dir, tx).await
    }

    /// Node 1: Ingests sequencing files from directory
    async fn execute_folder_input(
        &self,
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

        for f in &matched_files {
            let f_msg = format!("  -> {}", f);
            logs.push(f_msg.clone());
            let _ = event_tx
                .send(WorkflowStreamEvent::Log {
                    node_id: node.id.clone(),
                    line: f_msg,
                })
                .await;
        }

        if matched_files.is_empty() {
            return Err(EngineError::NodeExecutionFailed {
                node_id: node.id.clone(),
                message: format!(
                    "No sequence files matching [{}] found in {:?}",
                    pattern, dir_path
                ),
            });
        }

        let mut outputs = HashMap::new();
        outputs.insert(
            "sequence_files".to_string(),
            serde_json::json!({
                "directory": dir_str,
                "files": matched_files,
                "count": matched_files.len(),
            }),
        );

        Ok(outputs)
    }

    /// Node 2: Executes a bioinformatics tool from manifest with live subprocess streaming
    async fn execute_manifest_tool(
        &self,
        node: &vortexflow_workflow::WorkflowNode,
        manifest: &ToolManifest,
        inputs: &HashMap<String, serde_json::Value>,
        work_dir: &Path,
        logs: &mut Vec<String>,
        event_tx: &mpsc::Sender<WorkflowStreamEvent>,
    ) -> Result<HashMap<String, serde_json::Value>, EngineError> {
        let env_path = self.env_mgr.get_tool_env_path(&manifest.id, &manifest.version);
        let _databases = self.env_mgr.ensure_databases(&manifest.databases, logs).await?;

        // 3. Resolve input files
        let input_val = inputs
            .get("input_files")
            .or_else(|| inputs.get("sequence_files"))
            .or_else(|| inputs.values().next())
            .ok_or_else(|| EngineError::MissingInput {
                node_id: node.id.clone(),
                port_id: "input_files".to_string(),
            })?;

        let input_files = input_val
            .get("files")
            .and_then(|f| f.as_array())
            .map(|arr| {
                arr.iter()
                    .filter_map(|v| v.as_str().map(String::from))
                    .collect::<Vec<String>>()
            })
            .unwrap_or_default();

        let input_files_str = input_files.join(" ");

        // 4. Build argument list from manifest execution template
        let (executable_name, args_template) = match &manifest.execution {
            ExecutionStrategy::Binary { executable_name, args_template } => {
                (executable_name.clone(), args_template.clone())
            }
            ExecutionStrategy::PythonModule { module_name, args_template } => {
                let mut full_args = vec!["-m".to_string(), module_name.clone()];
                full_args.extend(args_template.clone());
                ("python3".to_string(), full_args)
            }
        };

        // Interpolate template arguments
        let mut final_args = Vec::new();
        for arg in args_template {
            if arg == "{input_files}" {
                if !input_files.is_empty() {
                    final_args.push(input_files[0].clone());
                } else {
                    final_args.push(input_files_str.clone());
                }
            } else if arg == "{work_dir}" {
                final_args.push(work_dir.to_string_lossy().to_string());
            } else if arg.starts_with('{') && arg.ends_with('}') {
                let param_key = &arg[1..arg.len() - 1];
                if let Some(param_val) = node.params.get(param_key) {
                    if let Some(num) = param_val.as_f64() {
                        final_args.push(num.to_string());
                    } else if let Some(s) = param_val.as_str() {
                        final_args.push(s.to_string());
                    } else if let Some(b) = param_val.as_bool() {
                        if b {
                            let flag = manifest
                                .params
                                .iter()
                                .find(|p| p.id == param_key)
                                .and_then(|p| p.cli_flag.clone())
                                .unwrap_or_else(|| format!("--{}", param_key));
                            final_args.push(flag);
                        }
                    }
                }
            } else {
                final_args.push(arg);
            }
        }

        // Add any active boolean flags defined in params that weren't in args_template
        for param in &manifest.params {
            if param.param_type == "boolean" {
                if let Some(b) = node.params.get(&param.id).and_then(|v| v.as_bool()) {
                    if b {
                        let flag = param.cli_flag.clone().unwrap_or_else(|| format!("--{}", param.id));
                        if !final_args.contains(&flag) {
                            final_args.push(flag);
                        }
                    }
                }
            }
        }

        // Add database flag arguments if declared in manifest
        for db in &manifest.databases {
            if let Some(ref flag) = db.cli_flag {
                let db_path = self.env_mgr.get_database_path(&db.destination_subpath);
                if db_path.exists() {
                    final_args.push(flag.clone());
                    final_args.push(db_path.to_string_lossy().to_string());
                }
            }
        }

        let cmd_msg = format!("Invoking: {} {}", executable_name, final_args.join(" "));
        logs.push(cmd_msg.clone());
        let _ = event_tx
            .send(WorkflowStreamEvent::Log {
                node_id: node.id.clone(),
                line: cmd_msg,
            })
            .await;

        // 5. Spawn subprocess command with piped stdout/stderr for live streaming
        let mut cmd = self.env_mgr.prepare_command(&env_path, manifest, &executable_name);
        cmd.args(&final_args);
        cmd.current_dir(work_dir);
        cmd.stdout(Stdio::piped());
        cmd.stderr(Stdio::piped());
        cmd.kill_on_drop(true); // Automatically terminates on drop (prevents zombie processes)

        let mut child = match cmd.spawn() {
            Ok(c) => c,
            Err(e) => {
                return Err(EngineError::NodeExecutionFailed {
                    node_id: node.id.clone(),
                    message: format!(
                        "Could not spawn binary '{}' from {:?}: {}. Please verify the extension is installed.",
                        executable_name, env_path, e
                    ),
                });
            }
        };

        // Stream stdout lines in real-time
        let stdout = child.stdout.take();
        let stderr = child.stderr.take();

        let tx_out = event_tx.clone();
        let node_id_out = node.id.clone();
        let stdout_handle = tokio::spawn(async move {
            let mut captured = Vec::new();
            if let Some(pipe) = stdout {
                let mut reader = BufReader::new(pipe).lines();
                while let Ok(Some(line)) = reader.next_line().await {
                    let formatted = format!("[stdout] {}", line);
                    let _ = tx_out
                        .send(WorkflowStreamEvent::Log {
                            node_id: node_id_out.clone(),
                            line: formatted.clone(),
                        })
                        .await;
                    captured.push(formatted);
                }
            }
            captured
        });

        let tx_err = event_tx.clone();
        let node_id_err = node.id.clone();
        let stderr_handle = tokio::spawn(async move {
            let mut captured = Vec::new();
            if let Some(pipe) = stderr {
                let mut reader = BufReader::new(pipe).lines();
                while let Ok(Some(line)) = reader.next_line().await {
                    let formatted = format!("[stderr] {}", line);
                    let _ = tx_err
                        .send(WorkflowStreamEvent::Log {
                            node_id: node_id_err.clone(),
                            line: formatted.clone(),
                        })
                        .await;
                    captured.push(formatted);
                }
            }
            captured
        });

        let status = child.wait().await?;
        let (out_lines, err_lines) = tokio::join!(stdout_handle, stderr_handle);

        if let Ok(lines) = out_lines {
            logs.extend(lines);
        }
        if let Ok(lines) = err_lines {
            logs.extend(lines);
        }

        if !status.success() {
            return Err(EngineError::NodeExecutionFailed {
                node_id: node.id.clone(),
                message: format!("Process '{}' exited with code: {:?}", executable_name, status.code()),
            });
        }

        // 6. Collect output artifacts defined in manifest
        let mut collected_artifacts: HashMap<String, serde_json::Value> = HashMap::new();
        collected_artifacts.insert(
            "work_dir".to_string(),
            serde_json::json!(work_dir.to_string_lossy()),
        );

        for artifact in &manifest.output_artifacts {
            let artifact_path = work_dir.join(&artifact.file_pattern);
            if artifact_path.exists() {
                collected_artifacts.insert(
                    artifact.id.clone(),
                    serde_json::json!(artifact_path.to_string_lossy()),
                );
            }
        }

        let mut outputs = HashMap::new();
        for out_port in &manifest.outputs {
            if let Some(val) = collected_artifacts.get(&out_port.id) {
                outputs.insert(out_port.id.clone(), val.clone());
            } else {
                outputs.insert(out_port.id.clone(), serde_json::json!(collected_artifacts));
            }
        }

        Ok(outputs)
    }

    /// Node 3: Outputs and saves report to destination directory
    async fn execute_output_save(
        &self,
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
        for (_port_id, val) in inputs {
            if let Some(src_str) = val.as_str() {
                let src_path = PathBuf::from(src_str);
                if src_path.exists() && src_path.is_file() {
                    let filename = src_path.file_name().unwrap_or_default();
                    let target_path = dest_dir.join(filename);
                    if let Ok(_) = tokio::fs::copy(&src_path, &target_path).await {
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
                }
            } else if let Some(map) = val.as_object() {
                for (k, v) in map {
                    if let Some(src_str) = v.as_str() {
                        let src_path = PathBuf::from(src_str);
                        if src_path.exists() && src_path.is_file() {
                            let filename = src_path.file_name().unwrap_or_default();
                            let target_path = dest_dir.join(filename);
                            if let Ok(_) = tokio::fs::copy(&src_path, &target_path).await {
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
            }),
        );

        Ok(outputs)
    }

    fn create_default_resfinder_manifest(&self) -> ToolManifest {
        ToolManifest {
            id: "resfinder".to_string(),
            name: "ResFinder".to_string(),
            version: "4.4.2".to_string(),
            category: "AMR & Resistance".to_string(),
            description: "Identifies acquired antimicrobial resistance genes and chromosomal point mutations.".to_string(),
            install: vortexflow_workflow::InstallStrategy::Rattler {
                packages: vec!["python=3.10".to_string(), "bioconda::resfinder=4.4.2".to_string()],
                channels: vec!["bioconda".to_string(), "conda-forge".to_string()],
            },
            databases: vec![],
            execution: ExecutionStrategy::Binary {
                executable_name: "run_resfinder.py".to_string(),
                args_template: vec![
                    "-ifa".to_string(), "{input_files}".to_string(),
                    "-o".to_string(), "{work_dir}".to_string(),
                    "-t".to_string(), "{threshold}".to_string(),
                    "-l".to_string(), "{min_cov}".to_string(),
                    "-s".to_string(), "{species}".to_string(),
                ],
            },
            inputs: vec![],
            outputs: vec![],
            params: vec![],
            output_artifacts: vec![],
        }
    }
}
