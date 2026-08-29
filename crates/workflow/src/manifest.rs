use std::collections::HashMap;
use std::path::Path;
use std::sync::Arc;
use parking_lot::RwLock;
use serde::{Deserialize, Serialize};

use crate::types::Port;

/// Installation specification for a tool
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum InstallStrategy {
    #[serde(rename = "rattler", alias = "conda")]
    Rattler {
        packages: Vec<String>,
        #[serde(default)]
        channels: Vec<String>,
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
}

/// Execution specification for a tool
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum ExecutionStrategy {
    Binary {
        executable_name: String,
        args_template: Vec<String>,
    },
    PythonModule {
        module_name: String,
        args_template: Vec<String>,
    },
}

/// Declarative parameter definition
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ParameterDef {
    pub id: String,
    pub name: String,
    #[serde(rename = "type")]
    pub param_type: String, // "number", "string", "select", "boolean"
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
    #[serde(default)]
    pub description: String,
}

/// Output artifact specification
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct OutputArtifactSpec {
    pub id: String,
    pub file_pattern: String,
    pub label: String,
    pub format: String, // "tsv", "json", "html", "fasta"
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
    /// Visualizer / interactive report card node
    Viewer,
}

fn default_node_type() -> NodeType {
    NodeType::Executor
}

/// Declarative validation rules for a node
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct NodeValidation {
    #[serde(default)]
    pub require_at_least_one: Vec<String>,
    #[serde(default)]
    pub error_message: Option<String>,
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
    pub inputs: Vec<Port>,
    #[serde(default)]
    pub outputs: Vec<Port>,
    #[serde(default)]
    pub params: Vec<ParameterDef>,
    #[serde(default)]
    pub output_artifacts: Vec<OutputArtifactSpec>,
    #[serde(default)]
    pub validation: Option<NodeValidation>,
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
    /// Legacy fallback execution strategy for single-node manifests
    #[serde(default)]
    pub execution: Option<ExecutionStrategy>,
    #[serde(default)]
    pub inputs: Vec<Port>,
    #[serde(default)]
    pub outputs: Vec<Port>,
    #[serde(default)]
    pub params: Vec<ParameterDef>,
    #[serde(default)]
    pub output_artifacts: Vec<OutputArtifactSpec>,
    #[serde(default)]
    pub validation: Option<NodeValidation>,
}

impl ToolManifest {
    /// Resolves the specialized NodeDefinition by node ID, matching substring, or title
    pub fn get_node_def(&self, node_id: &str, node_title: &str) -> Option<&NodeDefinition> {
        if !node_id.is_empty() {
            if let Some(node) = self.nodes.iter().find(|n| n.id == node_id || node_id.contains(&n.id)) {
                return Some(node);
            }
        }
        if !node_title.is_empty() {
            if let Some(node) = self.nodes.iter().find(|n| n.name.eq_ignore_ascii_case(node_title)) {
                return Some(node);
            }
        }
        self.nodes.first()
    }

    /// Resolves the execution strategy for a specific node ID or falls back to the manifest default
    pub fn get_execution_for_node(&self, node_id: &str, node_title: &str) -> Option<&ExecutionStrategy> {
        if let Some(node) = self.get_node_def(node_id, node_title) {
            if let Some(exec) = &node.execution {
                return Some(exec);
            }
        }
        if let Some(exec) = &self.execution {
            return Some(exec);
        }
        self.nodes.iter().find_map(|n| n.execution.as_ref())
    }

    /// Resolves the primary binary name for tool health checks
    pub fn primary_executable_name(&self) -> &str {
        if let Some(exec) = self.get_execution_for_node("", "") {
            match exec {
                ExecutionStrategy::Binary { executable_name, .. } => executable_name.as_str(),
                ExecutionStrategy::PythonModule { .. } => "python",
            }
        } else {
            self.id.as_str()
        }
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

        // 1. Embed built-in manifests as standard extensions
        if let Ok(rf) = serde_json::from_str::<ToolManifest>(include_str!("../../../manifests/resfinder.json")) {
            loader.register(rf);
        }
        if let Ok(fqc) = serde_json::from_str::<ToolManifest>(include_str!("../../../manifests/fastqc.json")) {
            loader.register(fqc);
        }

        // 2. Discover from workspace & user home
        loader.auto_discover();

        loader
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

    /// Loads a single manifest from a JSON file
    pub fn load_from_file<P: AsRef<Path>>(&self, path: P) -> Result<ToolManifest, String> {
        let content = std::fs::read_to_string(path.as_ref())
            .map_err(|e| format!("Failed to read manifest file {:?}: {}", path.as_ref(), e))?;
        let manifest: ToolManifest = serde_json::from_str(&content)
            .map_err(|e| format!("Failed to parse manifest {:?}: {}", path.as_ref(), e))?;
        self.register(manifest.clone());
        Ok(manifest)
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
                if entry_path.is_file() {
                    if let Some(ext) = entry_path.extension().and_then(|e| e.to_str()) {
                        if ext == "json" {
                            if let Ok(manifest) = self.load_from_file(&entry_path) {
                                loaded.push(manifest);
                            }
                        }
                    }
                }
            }
        }
        loaded
    }

    /// Registers a manifest in-memory
    pub fn register(&self, manifest: ToolManifest) {
        self.manifests.write().insert(manifest.id.clone(), manifest);
    }

    /// Retrieves a manifest by tool ID
    pub fn get(&self, tool_id: &str) -> Option<ToolManifest> {
        self.manifests.read().get(tool_id).cloned()
    }

    /// Lists all registered manifests
    pub fn list(&self) -> Vec<ToolManifest> {
        self.manifests.read().values().cloned().collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_load_manifests_from_workspace() {
        let loader = ManifestLoader::new();
        let manifests_dir = Path::new(env!("CARGO_MANIFEST_DIR"))
            .parent()
            .unwrap()
            .parent()
            .unwrap()
            .join("manifests");

        let loaded = loader.load_from_dir(&manifests_dir);
        assert!(!loaded.is_empty(), "Should load manifests from ./manifests");

        let rf = loader.get("resfinder").expect("ResFinder manifest must be present");
        assert_eq!(rf.name, "ResFinder");
        assert_eq!(rf.version, "4.4.2");
        assert_eq!(rf.category, "AMR & Resistance");
        assert_eq!(rf.databases.len(), 2);

        let fastqc = loader.get("fastqc").expect("FastQC manifest must be present");
        assert_eq!(fastqc.name, "FastQC");
        assert_eq!(fastqc.version, "0.12.1");
    }
}
