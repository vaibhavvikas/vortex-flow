use std::collections::HashMap;
use std::path::Path;
use std::sync::Arc;
use std::time::Instant;
use tokio::sync::mpsc;

use vortexflow_workflow::{
    ManifestLoader, NodeKind, NodeType, ToolManifest, WorkflowGraph,
};

use crate::env::EnvironmentManager;
use crate::error::EngineError;
use crate::nodes::{execute_folder_input, execute_output_save, execute_parser_tool, execute_viewer_tool};
use crate::runner::ToolRunner;
use crate::types::{NodeExecutionReport, NodeStatus, WorkflowExecutionReport, WorkflowStreamEvent};

/// Orchestrates DAG workflow validation, topological sequencing, and real-time event streaming
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

    /// Executes the entire workflow DAG, streaming real-time events via MPSC channel
    pub async fn execute_stream(
        &self,
        graph: &WorkflowGraph,
        run_dir: &Path,
        event_tx: mpsc::Sender<WorkflowStreamEvent>,
    ) -> Result<WorkflowExecutionReport, EngineError> {
        let workflow_start = Instant::now();
        let run_id = format!("run_{}", uuid::Uuid::new_v4().to_string().replace('-', "")[..12].to_string());

        // 1. Validate Workflow DAG topology (Acyclic, Port compatibility, Parameter constraints)
        let validation = vortexflow_workflow::validator::validate_workflow_with_manifests(graph, Some(&self.manifest_loader))?;
        if !validation.is_valid {
            let error_msg = "Workflow validation failed: cycle or invalid structure detected".to_string();
            let _ = event_tx
                .send(WorkflowStreamEvent::WorkflowError {
                    error: error_msg.clone(),
                })
                .await;
            return Err(EngineError::NodeExecutionFailed {
                node_id: "workflow".to_string(),
                message: error_msg,
            });
        }

        let sorted_node_ids = validation.execution_order;

        let _ = event_tx
            .send(WorkflowStreamEvent::WorkflowStart {
                run_id: run_id.clone(),
                total_nodes: sorted_node_ids.len(),
            })
            .await;

        tokio::fs::create_dir_all(run_dir).await?;

        // 2. Sequential execution according to topological order
        let mut node_outputs: HashMap<String, HashMap<String, serde_json::Value>> = HashMap::new();
        let mut node_reports: Vec<NodeExecutionReport> = Vec::new();
        let tool_runner = ToolRunner::new(&self.env_mgr);

        for node_id in &sorted_node_ids {
            let node = match graph.nodes.iter().find(|n| &n.id == node_id) {
                Some(n) => n,
                None => {
                    let err_msg = format!("Node '{}' in execution order not found in graph nodes", node_id);
                    let _ = event_tx.send(WorkflowStreamEvent::WorkflowError { error: err_msg.clone() }).await;
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

            // Dispatch node by kind / role
            let exec_res = match &node.kind {
                NodeKind::FolderInput => {
                    execute_folder_input(node, &resolved_inputs, &node_run_dir, &mut logs, &event_tx).await
                }
                NodeKind::Tool(tool_id) => {
                    if let Some(manifest) = self.manifest_loader.get(tool_id) {
                        self.dispatch_tool_node(
                            node,
                            &manifest,
                            &tool_runner,
                            &resolved_inputs,
                            &node_run_dir,
                            &mut logs,
                            &event_tx,
                        )
                        .await
                    } else {
                        Err(EngineError::NodeExecutionFailed {
                            node_id: node.id.clone(),
                            message: format!(
                                "Extension manifest for tool '{}' not found. Please install it from the Extensions tab.",
                                tool_id
                            ),
                        })
                    }
                }
                NodeKind::OutputSave => {
                    execute_output_save(node, &resolved_inputs, &node_run_dir, &mut logs, &event_tx).await
                }
            };

            let node_duration = node_start.elapsed().as_millis() as u64;

            match exec_res {
                Ok(outputs) => {
                    let comp_log = format!("Node '{}' completed successfully in {}ms", node.title, node_duration);
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
                        total_duration_ms: workflow_start.elapsed().as_millis() as u64,
                        created_at: chrono::Utc::now(),
                    };

                    let _ = event_tx
                        .send(WorkflowStreamEvent::WorkflowComplete {
                            run_id: run_id.clone(),
                            is_success: false,
                            total_duration_ms: report.total_duration_ms,
                            report: report.clone(),
                        })
                        .await;

                    return Ok(report);
                }
            }
        }

        let total_duration = workflow_start.elapsed().as_millis() as u64;
        let report = WorkflowExecutionReport {
            run_id: run_id.clone(),
            is_success: true,
            node_reports,
            total_duration_ms: total_duration,
            created_at: chrono::Utc::now(),
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

    /// Dispatches a tool node to its appropriate handler (Executor, Parser, or Viewer)
    async fn dispatch_tool_node(
        &self,
        node: &vortexflow_workflow::WorkflowNode,
        manifest: &ToolManifest,
        tool_runner: &ToolRunner<'_>,
        inputs: &HashMap<String, serde_json::Value>,
        work_dir: &Path,
        logs: &mut Vec<String>,
        event_tx: &mpsc::Sender<WorkflowStreamEvent>,
    ) -> Result<HashMap<String, serde_json::Value>, EngineError> {
        let node_def = manifest.get_node_def(&node.id, &node.title);
        let node_type = node_def.map(|n| n.node_type).unwrap_or(NodeType::Executor);

        match node_type {
            NodeType::Parser => {
                execute_parser_tool(node, manifest, node_def, inputs, work_dir, logs, event_tx).await
            }
            NodeType::Viewer => {
                execute_viewer_tool(node, manifest, node_def, inputs, work_dir, logs, event_tx).await
            }
            NodeType::Executor | NodeType::Transformer => {
                tool_runner
                    .execute_tool(node, manifest, node_def, inputs, work_dir, logs, event_tx)
                    .await
            }
        }
    }

    /// Convenience wrapper for non-streaming batch execution
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
}
