use thiserror::Error;
use crate::types::SocketType;

#[derive(Debug, Error, PartialEq, Eq)]
pub enum WorkflowError {
    #[error("Cycle detected in workflow involving nodes: {cycle_nodes:?}")]
    CycleDetected { cycle_nodes: Vec<String> },

    #[error("Incompatible socket connection from {source_node}.{source_port} ({source_type:?}) to {target_node}.{target_port} ({target_type:?})")]
    IncompatibleSocketTypes {
        source_node: String,
        source_port: String,
        source_type: SocketType,
        target_node: String,
        target_port: String,
        target_type: SocketType,
    },

    #[error("Node '{node_id}' referenced in edge not found in graph")]
    MissingNode { node_id: String },

    #[error("Port '{port_id}' not found on node '{node_id}'")]
    MissingPort { node_id: String, port_id: String },

    #[error("Duplicate node ID detected: '{node_id}'")]
    DuplicateNodeId { node_id: String },

    #[error("Invalid node direction: source port must be Output, target port must be Input")]
    InvalidPortDirection,

    #[error("Validation failed for node '{node_id}': {message}")]
    ValidationError {
        node_id: String,
        message: String,
    },

    #[error("Node '{node_id}' is missing required input for port '{port_id}'")]
    MissingRequiredInput {
        node_id: String,
        port_id: String,
    },
}
