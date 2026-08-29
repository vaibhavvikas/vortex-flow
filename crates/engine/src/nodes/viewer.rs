use std::collections::HashMap;
use std::path::Path;
use tokio::sync::mpsc;
use vortexflow_workflow::{NodeDefinition, ToolManifest};

use crate::error::EngineError;
use crate::types::WorkflowStreamEvent;

/// Handler for Viewer / Visualizer Dashboard cards: passes through datasets to GUI widgets
pub async fn execute_viewer_tool(
    node: &vortexflow_workflow::WorkflowNode,
    _manifest: &ToolManifest,
    _node_def: Option<&NodeDefinition>,
    inputs: &HashMap<String, serde_json::Value>,
    _work_dir: &Path,
    logs: &mut Vec<String>,
    event_tx: &mpsc::Sender<WorkflowStreamEvent>,
) -> Result<HashMap<String, serde_json::Value>, EngineError> {
    let msg = format!(
        "Dashboard Card '{}' received {} input dataset(s)",
        node.title,
        inputs.len()
    );
    logs.push(msg.clone());
    let _ = event_tx
        .send(WorkflowStreamEvent::Log {
            node_id: node.id.clone(),
            line: msg,
        })
        .await;

    Ok(inputs.clone())
}
