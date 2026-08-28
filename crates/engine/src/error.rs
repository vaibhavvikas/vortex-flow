use thiserror::Error;
use vortexflow_workflow::WorkflowError;

#[derive(Debug, Error)]
pub enum EngineError {
    #[error("Workflow validation failed: {0}")]
    Validation(#[from] WorkflowError),

    #[error("Environment error: {0}")]
    Environment(String),

    #[error("Execution failed for node '{node_id}': {message}")]
    NodeExecutionFailed { node_id: String, message: String },

    #[error("Missing input data for port '{port_id}' on node '{node_id}'")]
    MissingInput { node_id: String, port_id: String },

    #[error("Directory not found: '{0}'")]
    DirectoryNotFound(String),

    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),

    #[error("Subprocess execution failed: {message}")]
    SubprocessFailed { message: String },

    #[error("JSON serialization error: {0}")]
    Json(#[from] serde_json::Error),
}
