use serde::{Deserialize, Serialize};

/// Structural kind for workflow sockets
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SocketKind {
    Folder,
    File,
}

/// Output data socket type produced by a workflow node
#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum SocketType {
    Folder {
        #[serde(default, skip_serializing_if = "Option::is_none")]
        schema: Option<String>,
    },
    File {
        format: String,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        schema: Option<String>,
    },
}

impl SocketType {
    pub fn kind(&self) -> SocketKind {
        match self {
            SocketType::Folder { .. } => SocketKind::Folder,
            SocketType::File { .. } => SocketKind::File,
        }
    }

    pub fn schema(&self) -> Option<&str> {
        match self {
            SocketType::Folder { schema } => schema.as_deref(),
            SocketType::File { schema, .. } => schema.as_deref(),
        }
    }

    pub fn format(&self) -> Option<&str> {
        match self {
            SocketType::Folder { .. } => None,
            SocketType::File { format, .. } => Some(format.as_str()),
        }
    }
}

/// Consumer-side matcher on input ports with optional wildcard fields
#[derive(Debug, Clone, PartialEq, Eq, Hash, Default, Serialize, Deserialize)]
pub struct SocketMatcher {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub kind: Option<SocketKind>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub format: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub schema: Option<String>,
}

impl SocketMatcher {
    /// Creates a wildcard matcher that accepts any file or folder
    pub fn any() -> Self {
        Self::default()
    }

    /// Creates a matcher for any file regardless of format
    pub fn any_file() -> Self {
        Self {
            kind: Some(SocketKind::File),
            format: None,
            schema: None,
        }
    }

    /// Creates a matcher for any folder regardless of schema
    pub fn any_folder() -> Self {
        Self {
            kind: Some(SocketKind::Folder),
            format: None,
            schema: None,
        }
    }

    /// Checks if this matcher accepts a given producer's SocketType
    /// 1. If kind is Some, it must equal producer kind exactly.
    /// 2. If format is Some, producer must be File and format must equal matcher format.
    /// 3. If schema is Some(x), producer schema must equal Some(x) exactly.
    pub fn matches(&self, producer: &SocketType) -> bool {
        // 1. Kind check
        if let Some(expected_kind) = self.kind
            && producer.kind() != expected_kind {
                return false;
            }

        // 2. Format check (only meaningful when producer is File)
        if let Some(ref expected_format) = self.format {
            match producer {
                SocketType::File { format, .. } => {
                    if format != expected_format {
                        return false;
                    }
                }
                SocketType::Folder { .. } => {
                    return false;
                }
            }
        }

        // 3. Schema check
        if let Some(ref expected_schema) = self.schema
            && producer.schema() != Some(expected_schema.as_str()) {
                return false;
            }

        true
    }
}

/// An input port on a workflow node declaring accepted socket matchers
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct InputPort {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub accepted_types: Vec<SocketMatcher>,
}

impl InputPort {
    pub fn new(id: impl Into<String>, name: impl Into<String>, accepted_types: Vec<SocketMatcher>) -> Self {
        Self {
            id: id.into(),
            name: name.into(),
            accepted_types,
        }
    }

    pub fn accepts(&self, producer: &SocketType) -> bool {
        if self.accepted_types.is_empty() {
            // Wildcard fallback if empty
            return true;
        }
        self.accepted_types.iter().any(|matcher| matcher.matches(producer))
    }
}

/// An output port on a workflow node declaring a single concrete SocketType
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct OutputPort {
    pub id: String,
    pub name: String,
    pub socket_type: SocketType,
}

impl OutputPort {
    pub fn new(id: impl Into<String>, name: impl Into<String>, socket_type: SocketType) -> Self {
        Self {
            id: id.into(),
            name: name.into(),
            socket_type,
        }
    }
}

/// The architectural kind of workflow node
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "type", content = "tool_id", rename_all = "snake_case")]
pub enum NodeKind {
    /// Ingestion node: selects a local folder of sequence files
    FolderInput,
    /// Processing node: runs an isolated bioinformatics tool
    Tool(String),
    /// Sink node: saves or exports outputs
    OutputSave,
}

/// A node instantiated on the workflow canvas
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct WorkflowNode {
    pub id: String,
    pub kind: NodeKind,
    pub title: String,
    #[serde(default)]
    pub inputs: Vec<InputPort>,
    #[serde(default)]
    pub outputs: Vec<OutputPort>,
    #[serde(default)]
    pub params: serde_json::Value,
    #[serde(default)]
    pub position: (f32, f32),
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub plugin_version: Option<String>,
}

/// A directed edge connecting an output port of a source node to an input port of a target node
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct WorkflowEdge {
    pub id: String,
    pub source_node: String,
    pub source_port: String,
    pub target_node: String,
    pub target_port: String,
}

/// Complete workflow graph
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct WorkflowGraph {
    pub nodes: Vec<WorkflowNode>,
    pub edges: Vec<WorkflowEdge>,
}

impl WorkflowGraph {
    pub fn new() -> Self {
        Self::default()
    }

    /// Creates the standard 3-node ResFinder workflow graph
    pub fn template_resfinder() -> Self {
        let node_input = WorkflowNode {
            id: "node_input".to_string(),
            kind: NodeKind::FolderInput,
            title: "Folder Input".to_string(),
            inputs: vec![],
            outputs: vec![OutputPort {
                id: "sequence_files".to_string(),
                name: "Sequence Files".to_string(),
                socket_type: SocketType::Folder {
                    schema: Some("core.sequence_folder".to_string()),
                },
            }],
            params: serde_json::json!({
                "directory_path": "/path/to/sequences",
                "file_pattern": "*.fasta,*.fna,*.fa,*.fastq",
            }),
            position: (50.0, 150.0),
            plugin_version: Some("1.0.0".to_string()),
        };

        let node_resfinder = WorkflowNode {
            id: "node_resfinder".to_string(),
            kind: NodeKind::Tool("resfinder".to_string()),
            title: "ResFinder (FASTA)".to_string(),
            inputs: vec![InputPort {
                id: "input_fasta".to_string(),
                name: "Assembly (FASTA)".to_string(),
                accepted_types: vec![SocketMatcher {
                    kind: Some(SocketKind::Folder),
                    format: None,
                    schema: Some("core.sequence_folder".to_string()),
                }],
            }],
            outputs: vec![OutputPort {
                id: "resfinder_dir".to_string(),
                name: "ResFinder Output Folder".to_string(),
                socket_type: SocketType::Folder {
                    schema: Some("resfinder.resfinder_output_folder".to_string()),
                },
            }],
            params: serde_json::json!({
                "threshold": 0.90,
                "min_cov": 0.60,
                "species": "other",
                "acquired": true,
                "point": false,
            }),
            position: (420.0, 150.0),
            plugin_version: Some("4.4.2".to_string()),
        };

        let node_output = WorkflowNode {
            id: "node_output".to_string(),
            kind: NodeKind::OutputSave,
            title: "Output Save".to_string(),
            inputs: vec![InputPort {
                id: "results".to_string(),
                name: "ResFinder Report".to_string(),
                accepted_types: vec![SocketMatcher::any()],
            }],
            outputs: vec![],
            params: serde_json::json!({
                "destination_dir": "/path/to/results",
                "export_format": "tsv",
                "auto_open": true,
            }),
            position: (790.0, 150.0),
            plugin_version: Some("1.0.0".to_string()),
        };

        let edges = vec![
            WorkflowEdge {
                id: "e_input_to_rf".to_string(),
                source_node: "node_input".to_string(),
                source_port: "sequence_files".to_string(),
                target_node: "node_resfinder".to_string(),
                target_port: "input_fasta".to_string(),
            },
            WorkflowEdge {
                id: "e_rf_to_output".to_string(),
                source_node: "node_resfinder".to_string(),
                source_port: "resfinder_dir".to_string(),
                target_node: "node_output".to_string(),
                target_port: "results".to_string(),
            },
        ];

        Self {
            nodes: vec![node_input, node_resfinder, node_output],
            edges,
        }
    }
}
