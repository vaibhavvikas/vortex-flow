use std::collections::{HashMap, HashSet};
use std::path::Path;
use std::sync::Arc;
use parking_lot::RwLock;
use serde::{Deserialize, Serialize};

use crate::types::{InputPort, OutputPort, SocketMatcher, SocketType};

pub const RESERVED_PLACEHOLDERS: &[&str] = &[
    "work_dir",
    "input_files",
    "output_dir",
    "databases",
    "env_path",
];

pub const RESERVED_PLUGIN_IDS: &[&str] = &["core"];

/// Installation specification for a tool
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum InstallStrategy {
    #[serde(rename = "rattler", alias = "conda")]
    Rattler {
        packages: Vec<String>,
        #[serde(default)]
        channels: Vec<String>,
        #[serde(default)]
        pip_packages: Vec<String>,
    },
    Pip {
        packages: Vec<String>,
        #[serde(default)]
        python_version: Option<String>,
    },
    BinaryArchive {
        #[serde(default)]
        url_macos_arm64: Option<String>,
        #[serde(default)]
        url_linux_x86_64: Option<String>,
        binary_subpath: String,
    },
    /// Built-in system or core node that requires no external installer
    Core,
}

/// Reference database requirements for a tool (e.g. resfinder_db, pointfinder_db)
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct DatabaseRequirement {
    pub name: String,
    pub download_url: String,
    #[serde(default)]
    pub is_git: bool,
    pub destination_subpath: String,
    #[serde(default)]
    pub cli_flag: Option<String>,
    #[serde(default)]
    pub env_var_name: Option<String>,
    #[serde(default)]
    pub post_install_command: Option<Vec<String>>,
}

/// An element in args_template that can be either a literal string or a conditional flag.
///
/// In manifest JSON:
///   - A plain string `"-o"` → `ArgElement::Literal("-o")`
///   - An object `{ "single": "-ifa", "multiple": "-ifq", "placeholder": "input_files" }`
///     → `ArgElement::Conditional { ... }` which picks the flag based on input cardinality.
///
/// This keeps the engine 100% generic — no tool-specific knowledge needed.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(untagged)]
pub enum ArgElement {
    /// A conditional flag that changes based on how many values the placeholder resolves to.
    /// The engine uses `single` flag when 1 value, `multiple` flag when >1.
    Conditional {
        single: String,
        multiple: String,
        placeholder: String,
    },
    /// A plain string argument (literal flag or `{placeholder}`)
    Literal(String),
}

/// Execution specification for an executable tool or parser node
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum ExecutionStrategy {
    Binary {
        executable_name: String,
        args_template: Vec<ArgElement>,
        #[serde(default)]
        requires_databases: Vec<String>,
    },
    PythonModule {
        module_name: String,
        args_template: Vec<ArgElement>,
        #[serde(default)]
        requires_databases: Vec<String>,
    },
}

impl ExecutionStrategy {
    pub fn args_template(&self) -> &[ArgElement] {
        match self {
            ExecutionStrategy::Binary { args_template, .. } => args_template,
            ExecutionStrategy::PythonModule { args_template, .. } => args_template,
        }
    }

    pub fn requires_databases(&self) -> &[String] {
        match self {
            ExecutionStrategy::Binary { requires_databases, .. } => requires_databases,
            ExecutionStrategy::PythonModule { requires_databases, .. } => requires_databases,
        }
    }

    pub fn executable_name(&self) -> &str {
        match self {
            ExecutionStrategy::Binary { executable_name, .. } => executable_name,
            ExecutionStrategy::PythonModule { .. } => "python",
        }
    }
}

/// Declarative parameter definition
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ParameterDef {
    pub id: String,
    pub name: String,
    #[serde(rename = "type")]
    pub param_type: String, // "number", "string", "select", "boolean", "column_select"
    #[serde(default)]
    pub default: serde_json::Value,
    #[serde(default)]
    pub min: Option<f64>,
    #[serde(default)]
    pub max: Option<f64>,
    #[serde(default)]
    pub step: Option<f64>,
    #[serde(default)]
    pub options: Vec<String>,
    #[serde(default)]
    pub cli_flag: Option<String>,
    #[serde(default)]
    pub required: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub show: Option<bool>,
    #[serde(default)]
    pub description: String,
    /// For dynamic `column_select` widgets: references the connected input port id
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub input_id: Option<String>,
    /// For dynamic `column_select` widgets: whether multiple columns can be picked
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub multiple: Option<bool>,
}

/// Output artifact specification
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct OutputArtifactSpec {
    pub id: String,
    pub file_pattern: String,
    pub label: String,
    pub format: String, // "tsv", "json", "html", "fasta", "csv"
}

/// Classification of a specialized node in a tool extension suite
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum NodeType {
    /// CLI binary or subprocess execution node
    Executor,
    /// Output file parser / tabular extractor node
    Parser,
    /// Data filter / column transformer node
    Transformer,
    /// Visualizer / interactive report card node (No subprocess execution)
    Viewer,
}

fn default_node_type() -> NodeType {
    NodeType::Executor
}

/// Declarative validation rules for a node
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "rule", rename_all = "snake_case")]
pub enum ValidationRule {
    RequireAtLeastOne {
        params: Vec<String>,
        error_message: String,
    },
}

/// A specialized node definition exported by a tool manifest (ComfyUI multi-node pattern)
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct NodeDefinition {
    pub id: String,
    pub name: String,
    #[serde(default = "default_node_type")]
    pub node_type: NodeType,
    #[serde(default)]
    pub description: String,
    #[serde(default)]
    pub icon: Option<String>,
    #[serde(default)]
    pub execution: Option<ExecutionStrategy>,
    #[serde(default)]
    pub inputs: Vec<InputPort>,
    #[serde(default)]
    pub outputs: Vec<OutputPort>,
    #[serde(default)]
    pub params: Vec<ParameterDef>,
    #[serde(default)]
    pub output_artifacts: Vec<OutputArtifactSpec>,
    #[serde(default)]
    pub validation: Vec<ValidationRule>,
}

/// Complete declarative Tool Manifest (Extension Suite)
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ToolManifest {
    pub id: String,
    pub name: String,
    pub version: String,
    pub category: String,
    pub description: String,
    pub install: InstallStrategy,
    #[serde(default)]
    pub databases: Vec<DatabaseRequirement>,
    /// Multiple specialized nodes exported by this package
    #[serde(default)]
    pub nodes: Vec<NodeDefinition>,
    /// Optional legacy fallback execution strategy
    #[serde(default)]
    pub execution: Option<ExecutionStrategy>,
    #[serde(default)]
    pub inputs: Vec<InputPort>,
    #[serde(default)]
    pub outputs: Vec<OutputPort>,
    #[serde(default)]
    pub params: Vec<ParameterDef>,
    #[serde(default)]
    pub output_artifacts: Vec<OutputArtifactSpec>,
    #[serde(default)]
    pub validation: Vec<ValidationRule>,
}

impl ToolManifest {
    /// Resolves the specialized NodeDefinition by node ID, matching substring, or title
    pub fn get_node_def(&self, node_id: &str, node_title: &str) -> Option<&NodeDefinition> {
        if !node_id.is_empty()
            && let Some(node) = self.nodes.iter().find(|n| {
                n.id == node_id
                    || node_id.ends_with(&format!(".{}", n.id))
                    || n.id.ends_with(&format!(".{}", node_id))
                    || node_id.contains(&n.id)
                    || n.id.contains(node_id)
            }) {
                return Some(node);
            }
        if !node_title.is_empty()
            && let Some(node) = self.nodes.iter().find(|n| {
                n.name.eq_ignore_ascii_case(node_title)
                    || node_title.to_lowercase().contains(&n.name.to_lowercase())
                    || n.name.to_lowercase().contains(&node_title.to_lowercase())
            }) {
                return Some(node);
            }
        self.nodes
            .iter()
            .find(|n| n.node_type == NodeType::Executor)
            .or_else(|| self.nodes.first())
    }

    /// Resolves the execution strategy for a specific node ID or falls back to the manifest default
    pub fn get_execution_for_node(&self, node_id: &str, node_title: &str) -> Option<&ExecutionStrategy> {
        if let Some(node) = self.get_node_def(node_id, node_title)
            && let Some(exec) = &node.execution {
                return Some(exec);
            }
        if let Some(exec) = &self.execution {
            return Some(exec);
        }
        self.nodes.iter().find_map(|n| n.execution.as_ref())
    }

    /// Resolves the primary binary name for tool health checks
    pub fn primary_executable_name(&self) -> &str {
        if let Some(exec) = self.get_execution_for_node("", "") {
            exec.executable_name()
        } else {
            self.id.as_str()
        }
    }

    /// Validates manifest schema consistency (reserved keywords, execution contract)
    pub fn validate_schema(&self) -> Result<(), String> {
        let reserved_set: HashSet<&str> = RESERVED_PLACEHOLDERS.iter().copied().collect();

        // 1. Validate Plugin ID
        if self.id.to_lowercase() == "core" {
            return Err("Plugin ID 'core' is reserved for built-in system nodes".to_string());
        }

        // 2. Validate top-level params against reserved placeholders
        for p in &self.params {
            if reserved_set.contains(p.id.as_str()) {
                return Err(format!(
                    "Parameter ID '{}' in manifest '{}' shadows engine-reserved placeholder",
                    p.id, self.id
                ));
            }
        }

        // 3. Validate each node
        for node in &self.nodes {
            for p in &node.params {
                if reserved_set.contains(p.id.as_str()) {
                    return Err(format!(
                        "Parameter ID '{}' in node '{}.{}' shadows engine-reserved placeholder",
                        p.id, self.id, node.id
                    ));
                }
            }

            // Enforce Execution Contract
            if node.node_type == NodeType::Viewer {
                if node.execution.is_some() {
                    return Err(format!(
                        "Viewer node '{}.{}' cannot declare an execution block",
                        self.id, node.id
                    ));
                }
            } else if node.execution.is_none() && self.execution.is_none() {
                return Err(format!(
                    "Node '{}.{}' of type {:?} must declare an execution block",
                    self.id, node.id, node.node_type
                ));
            }
        }

        Ok(())
    }

    /// Applies automatic plugin-id namespacing to all node IDs and schema strings
    pub fn apply_namespacing(&mut self) {
        let plugin_id = self.id.clone();

        let prefix_schema = |schema: Option<String>| -> Option<String> {
            match schema {
                Some(s) => {
                    if s.starts_with(&format!("{}.", plugin_id)) || s.starts_with("core.") {
                        Some(s)
                    } else {
                        Some(format!("{}.{}", plugin_id, s))
                    }
                }
                None => None,
            }
        };

        // Namespace top-level ports
        for in_port in &mut self.inputs {
            for matcher in &mut in_port.accepted_types {
                matcher.schema = prefix_schema(matcher.schema.take());
            }
        }

        for out_port in &mut self.outputs {
            match &mut out_port.socket_type {
                SocketType::Folder { schema } => {
                    *schema = prefix_schema(schema.take());
                }
                SocketType::File { schema, .. } => {
                    *schema = prefix_schema(schema.take());
                }
            }
        }

        // Namespace node IDs and schemas
        for node in &mut self.nodes {
            if !node.id.starts_with(&format!("{}.", plugin_id)) && !node.id.starts_with("core.") {
                node.id = format!("{}.{}", plugin_id, node.id);
            }

            for in_port in &mut node.inputs {
                for matcher in &mut in_port.accepted_types {
                    matcher.schema = prefix_schema(matcher.schema.take());
                }
            }

            for out_port in &mut node.outputs {
                match &mut out_port.socket_type {
                    SocketType::Folder { schema } => {
                        *schema = prefix_schema(schema.take());
                    }
                    SocketType::File { schema, .. } => {
                        *schema = prefix_schema(schema.take());
                    }
                }
            }
        }
    }
}

/// Creates the built-in Core extension suite
pub fn create_core_manifest() -> ToolManifest {
    ToolManifest {
        id: "core".to_string(),
        name: "Core Workflow Nodes".to_string(),
        version: "1.0.0".to_string(),
        category: "Core".to_string(),
        description: "Built-in standard ingestion, sink, column mapping, and visualization nodes".to_string(),
        install: InstallStrategy::Core,
        databases: vec![],
        nodes: vec![
            NodeDefinition {
                id: "core.folder_input".to_string(),
                name: "Folder Input".to_string(),
                node_type: NodeType::Executor,
                description: "Ingests raw sequencing files (.fasta, .fastq, .fna) from a local directory".to_string(),
                icon: Some("FolderInput".to_string()),
                execution: Some(ExecutionStrategy::Binary {
                    executable_name: "builtin".to_string(),
                    args_template: vec![],
                    requires_databases: vec![],
                }),
                inputs: vec![],
                outputs: vec![OutputPort {
                    id: "sequence_files".to_string(),
                    name: "Sequence Files".to_string(),
                    socket_type: SocketType::Folder {
                        schema: Some("core.sequence_folder".to_string()),
                    },
                }],
                params: vec![
                    ParameterDef {
                        id: "directory_path".to_string(),
                        name: "Directory Path".to_string(),
                        param_type: "string".to_string(),
                        default: serde_json::json!(""),
                        min: None,
                        max: None,
                        step: None,
                        options: vec![],
                        cli_flag: None,
                        required: Some(true),
                        show: None,
                        description: "Local directory path containing raw sequence reads".to_string(),
                        input_id: None,
                        multiple: None,
                    },
                    ParameterDef {
                        id: "file_pattern".to_string(),
                        name: "File Match Filter".to_string(),
                        param_type: "string".to_string(),
                        default: serde_json::json!("*.fasta,*.fna,*.fa,*.fastq"),
                        min: None,
                        max: None,
                        step: None,
                        options: vec![],
                        cli_flag: None,
                        required: Some(true),
                        show: Some(true),
                        description: "Glob filter pattern for matching files".to_string(),
                        input_id: None,
                        multiple: None,
                    },
                ],
                output_artifacts: vec![],
                validation: vec![],
            },
            NodeDefinition {
                id: "core.output_save".to_string(),
                name: "Output Save".to_string(),
                node_type: NodeType::Executor,
                description: "Saves analysis output files or directories to a designated destination folder".to_string(),
                icon: Some("HardDriveDownload".to_string()),
                execution: Some(ExecutionStrategy::Binary {
                    executable_name: "builtin".to_string(),
                    args_template: vec![],
                    requires_databases: vec![],
                }),
                inputs: vec![InputPort {
                    id: "results".to_string(),
                    name: "Output Data".to_string(),
                    accepted_types: vec![SocketMatcher::any()],
                }],
                outputs: vec![],
                params: vec![
                    ParameterDef {
                        id: "destination_dir".to_string(),
                        name: "Destination Folder".to_string(),
                        param_type: "string".to_string(),
                        default: serde_json::json!(""),
                        min: None,
                        max: None,
                        step: None,
                        options: vec![],
                        cli_flag: None,
                        required: Some(true),
                        show: Some(true),
                        description: "Local directory path to export results".to_string(),
                        input_id: None,
                        multiple: None,
                    },
                    ParameterDef {
                        id: "open_folder".to_string(),
                        name: "Open Folder On Complete".to_string(),
                        param_type: "boolean".to_string(),
                        default: serde_json::json!(true),
                        min: None,
                        max: None,
                        step: None,
                        options: vec![],
                        cli_flag: None,
                        required: Some(true),
                        show: Some(true),
                        description: "Open directory in system file manager after execution".to_string(),
                        input_id: None,
                        multiple: None,
                    },
                ],
                output_artifacts: vec![],
                validation: vec![],
            },
        ],
        execution: None,
        inputs: vec![],
        outputs: vec![],
        params: vec![],
        output_artifacts: vec![],
        validation: vec![],
    }
}

/// Thread-safe loader and registry for tool manifests
#[derive(Debug, Clone, Default)]
pub struct ManifestLoader {
    manifests: Arc<RwLock<HashMap<String, ToolManifest>>>,
}

impl ManifestLoader {
    pub fn new() -> Self {
        let loader = Self {
            manifests: Arc::new(RwLock::new(HashMap::new())),
        };

        // 1. Register Core built-in suite
        loader.register_core(create_core_manifest());

        // 2. Discover from workspace & user home
        loader.auto_discover();

        loader
    }

    /// Registers the core pseudo-plugin without checking the 'core' reserved id check
    pub fn register_core(&self, manifest: ToolManifest) {
        self.manifests.write().insert("core".to_string(), manifest);
    }

    /// Automatically searches candidate directories for manifest files
    pub fn auto_discover(&self) {
        let mut candidates = Vec::new();

        if let Ok(cwd) = std::env::current_dir() {
            candidates.push(cwd.join("manifests"));
            if let Some(parent) = cwd.parent() {
                candidates.push(parent.join("manifests"));
                if let Some(grandparent) = parent.parent() {
                    candidates.push(grandparent.join("manifests"));
                }
            }
        }

        if let Some(home) = dirs::home_dir() {
            candidates.push(home.join(".vortexflow").join("manifests"));
        }

        for path in candidates {
            if path.exists() && path.is_dir() {
                self.load_from_dir(&path);
            }
        }
    }

    /// Loads a single manifest from a JSON string with validation and namespacing
    pub fn load_from_str(&self, content: &str) -> Result<ToolManifest, String> {
        let mut manifest: ToolManifest = serde_json::from_str(content)
            .map_err(|e| format!("Failed to deserialize manifest: {}", e))?;

        manifest.validate_schema()?;
        manifest.apply_namespacing();
        self.register(manifest.clone())?;

        Ok(manifest)
    }

    /// Loads a single manifest from a JSON file
    pub fn load_from_file<P: AsRef<Path>>(&self, path: P) -> Result<ToolManifest, String> {
        let content = std::fs::read_to_string(path.as_ref())
            .map_err(|e| format!("Failed to read manifest file {:?}: {}", path.as_ref(), e))?;
        self.load_from_str(&content)
    }

    /// Recursively scans a directory and loads all `.json` manifests
    pub fn load_from_dir<P: AsRef<Path>>(&self, dir: P) -> Vec<ToolManifest> {
        let mut loaded = Vec::new();
        let path = dir.as_ref();
        if !path.exists() || !path.is_dir() {
            return loaded;
        }

        if let Ok(entries) = std::fs::read_dir(path) {
            for entry in entries.flatten() {
                let entry_path = entry.path();
                if entry_path.is_file()
                    && let Some(ext) = entry_path.extension().and_then(|e| e.to_str())
                        && ext == "json"
                            && let Ok(manifest) = self.load_from_file(&entry_path) {
                                loaded.push(manifest);
                            }
            }
        }
        loaded
    }

    /// Registers a manifest with schema validation and namespacing
    pub fn register(&self, mut manifest: ToolManifest) -> Result<(), String> {
        if manifest.id != "core" {
            manifest.validate_schema()?;
            manifest.apply_namespacing();
        }
        self.manifests.write().insert(manifest.id.clone(), manifest);
        Ok(())
    }

    /// Retrieves a manifest by tool ID
    pub fn get(&self, tool_id: &str) -> Option<ToolManifest> {
        self.manifests.read().get(tool_id).cloned()
    }

    /// Finds a node definition across all registered manifests by exact or namespaced ID
    pub fn get_node_definition(&self, node_id: &str) -> Option<(ToolManifest, NodeDefinition)> {
        let manifests = self.manifests.read();
        for manifest in manifests.values() {
            if let Some(node_def) = manifest.nodes.iter().find(|n| {
                n.id == node_id
                    || node_id == format!("{}.{}", manifest.id, n.id)
                    || n.id == format!("{}.{}", manifest.id, node_id)
            }) {
                return Some((manifest.clone(), node_def.clone()));
            }
        }
        None
    }

    /// Lists all registered manifests
    pub fn list(&self) -> Vec<ToolManifest> {
        self.manifests.read().values().cloned().collect()
    }
}
