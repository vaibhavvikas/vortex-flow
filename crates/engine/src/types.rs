use std::collections::HashMap;
use serde::{Deserialize, Serialize};

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
    pub created_at: chrono::DateTime<chrono::Utc>,
}

/// Real-time Server-Sent Events (SSE) for streaming workflow execution progress to GUI
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum WorkflowStreamEvent {
    WorkflowStart {
        run_id: String,
        total_nodes: usize,
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
