use std::collections::{HashMap, HashSet};
use petgraph::algo::{is_cyclic_directed, toposort};
use petgraph::graphmap::DiGraphMap;

use crate::error::WorkflowError;
use crate::manifest::{ManifestLoader, ValidationRule};
use crate::types::{NodeKind, WorkflowGraph};

/// Result of validating a workflow graph
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ValidationReport {
    pub is_valid: bool,
    pub execution_order: Vec<String>,
    pub warnings: Vec<String>,
}

/// Validates a workflow graph:
/// 1. Node uniqueness
/// 2. Port existence and socket compatibility
/// 3. Strict cycle detection (rejects cycles)
/// 4. Node input completeness
/// 5. Parameter validation rules across all defined rules (collects all errors)
/// 6. Plugin version mismatch warnings
/// 7. Computes topological execution order
pub fn validate_workflow(graph: &WorkflowGraph) -> Result<ValidationReport, WorkflowError> {
    validate_workflow_with_manifests(graph, None)
}

pub fn validate_workflow_with_manifests(
    graph: &WorkflowGraph,
    manifest_loader: Option<&ManifestLoader>,
) -> Result<ValidationReport, WorkflowError> {
    let mut node_map = HashMap::new();
    let mut warnings = Vec::new();

    // 1. Verify unique node IDs
    for node in &graph.nodes {
        if node_map.contains_key(node.id.as_str()) {
            return Err(WorkflowError::DuplicateNodeId {
                node_id: node.id.clone(),
            });
        }
        node_map.insert(node.id.as_str(), node);
    }

    // 2. Validate edges and socket compatibility
    for edge in &graph.edges {
        let source_node = node_map.get(edge.source_node.as_str()).ok_or_else(|| {
            WorkflowError::MissingNode {
                node_id: edge.source_node.clone(),
            }
        })?;

        let target_node = node_map.get(edge.target_node.as_str()).ok_or_else(|| {
            WorkflowError::MissingNode {
                node_id: edge.target_node.clone(),
            }
        })?;

        let source_port = source_node
            .outputs
            .iter()
            .find(|p| p.id == edge.source_port)
            .ok_or_else(|| WorkflowError::MissingPort {
                node_id: edge.source_node.clone(),
                port_id: edge.source_port.clone(),
            })?;

        let target_port = target_node
            .inputs
            .iter()
            .find(|p| p.id == edge.target_port)
            .ok_or_else(|| WorkflowError::MissingPort {
                node_id: edge.target_node.clone(),
                port_id: edge.target_port.clone(),
            })?;

        if !target_port.accepts(&source_port.socket_type) {
            return Err(WorkflowError::IncompatibleSocketTypes {
                source_node: edge.source_node.clone(),
                source_port: edge.source_port.clone(),
                source_type: Box::new(source_port.socket_type.clone()),
                target_node: edge.target_node.clone(),
                target_port: edge.target_port.clone(),
                target_accepted: target_port.accepted_types.clone().into_boxed_slice(),
            });
        }
    }

    // 3. Build petgraph and check for cycles
    let mut dag: DiGraphMap<&str, ()> = DiGraphMap::new();

    for node in &graph.nodes {
        dag.add_node(node.id.as_str());
    }

    for edge in &graph.edges {
        dag.add_edge(edge.source_node.as_str(), edge.target_node.as_str(), ());
    }

    if is_cyclic_directed(&dag) {
        let mut cycle_nodes = HashSet::new();
        for edge in &graph.edges {
            cycle_nodes.insert(edge.source_node.clone());
            cycle_nodes.insert(edge.target_node.clone());
        }
        return Err(WorkflowError::CycleDetected {
            cycle_nodes: cycle_nodes.into_iter().collect(),
        });
    }

    // 4. Compute topological execution order
    let sorted_indices = toposort(&dag, None).map_err(|_| WorkflowError::CycleDetected {
        cycle_nodes: vec![],
    })?;

    let execution_order: Vec<String> = sorted_indices
        .into_iter()
        .map(|node_id| node_id.to_string())
        .collect();

    // 5. Validate Node Parameters and Required Inputs
    for node in &graph.nodes {
        match &node.kind {
            NodeKind::FolderInput => {
                let dir = node
                    .params
                    .get("directory_path")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .trim();
                if dir.is_empty() {
                    return Err(WorkflowError::ValidationError {
                        node_id: node.id.clone(),
                        message: "Directory path is required for Folder Input node".to_string(),
                    });
                }
            }
            NodeKind::OutputSave => {
                let dest = node
                    .params
                    .get("destination_dir")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .trim();
                if dest.is_empty() {
                    return Err(WorkflowError::ValidationError {
                        node_id: node.id.clone(),
                        message: "Export destination directory is required for Output Save node".to_string(),
                    });
                }

                // Check that OutputSave has at least one incoming edge
                let has_incoming = graph.edges.iter().any(|e| e.target_node == node.id);
                if !has_incoming {
                    return Err(WorkflowError::ValidationError {
                        node_id: node.id.clone(),
                        message: "Output Save node must be connected to an upstream data node".to_string(),
                    });
                }
            }
            NodeKind::Tool(tool_id) => {
                if let Some(loader) = manifest_loader
                    && let Some(manifest) = loader.get(tool_id) {
                        // Check version mismatch warning (Fix #8)
                        if let Some(ref saved_ver) = node.plugin_version
                            && saved_ver != &manifest.version {
                                warnings.push(format!(
                                    "Node '{}' was saved with plugin '{}' version {}, but version {} is currently installed.",
                                    node.title, tool_id, saved_ver, manifest.version
                                ));
                            }

                        let node_def = manifest.get_node_def(&node.id, &node.title);
                        let mut validation_rules: Vec<&ValidationRule> = Vec::new();

                        if let Some(nd) = node_def {
                            validation_rules.extend(nd.validation.iter());
                        }
                        validation_rules.extend(manifest.validation.iter());

                        let mut failed_messages = Vec::new();

                        for rule in validation_rules {
                            match rule {
                                ValidationRule::RequireAtLeastOne {
                                    params,
                                    error_message,
                                } => {
                                    let any_active = params.iter().any(|k| {
                                        node.params
                                            .get(k)
                                            .and_then(|v| {
                                                if let Some(b) = v.as_bool() {
                                                    Some(b)
                                                } else { v.as_str().map(|s| s.eq_ignore_ascii_case("true") || s == "1") }
                                            })
                                            .unwrap_or_else(|| {
                                                node_def
                                                    .and_then(|nd| nd.params.iter().find(|p| p.id == *k))
                                                    .and_then(|p| p.default.as_bool())
                                                    .unwrap_or(false)
                                            })
                                    });

                                    if !any_active {
                                        failed_messages.push(error_message.clone());
                                    }
                                }
                            }
                        }

                        if !failed_messages.is_empty() {
                            return Err(WorkflowError::ValidationError {
                                node_id: node.id.clone(),
                                message: failed_messages.join(" | "),
                            });
                        }
                    }
            }
        }
    }

    Ok(ValidationReport {
        is_valid: true,
        execution_order,
        warnings,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::manifest::*;
    use crate::types::*;

    #[test]
    fn test_valid_resfinder_template() {
        let graph = WorkflowGraph::template_resfinder();
        let report = validate_workflow(&graph).expect("template should be valid");
        assert!(report.is_valid);
        assert_eq!(
            report.execution_order,
            vec!["node_input", "node_resfinder", "node_output"]
        );
    }

    #[test]
    fn test_socket_matching_rules() {
        // Generic TSV consumer
        let tsv_input = InputPort::new(
            "in_tsv",
            "Input TSV",
            vec![SocketMatcher {
                kind: Some(SocketKind::File),
                format: Some("tsv".to_string()),
                schema: None,
            }],
        );

        // Specific TSV producer with schema
        let amr_output = OutputPort::new(
            "out_amr",
            "AMR Table",
            SocketType::File {
                format: "tsv".to_string(),
                schema: Some("resfinder.amr_gene_table".to_string()),
            },
        );

        // CSV producer
        let csv_output = OutputPort::new(
            "out_csv",
            "CSV Table",
            SocketType::File {
                format: "csv".to_string(),
                schema: None,
            },
        );

        assert!(tsv_input.accepts(&amr_output.socket_type));
        assert!(!tsv_input.accepts(&csv_output.socket_type));

        // Universal consumer
        let universal_input = InputPort::new("in_any", "Universal", vec![SocketMatcher::any()]);
        assert!(universal_input.accepts(&amr_output.socket_type));
        assert!(universal_input.accepts(&csv_output.socket_type));
        assert!(universal_input.accepts(&SocketType::Folder {
            schema: Some("resfinder.output_folder".to_string())
        }));
    }

    #[test]
    fn test_cycle_detection() {
        let mut graph = WorkflowGraph::template_resfinder();
        graph.nodes[2].outputs.push(OutputPort {
            id: "out_loop".to_string(),
            name: "Loop".to_string(),
            socket_type: SocketType::File {
                format: "tsv".to_string(),
                schema: None,
            },
        });
        graph.nodes[0].inputs.push(InputPort {
            id: "in_loop".to_string(),
            name: "Loop".to_string(),
            accepted_types: vec![SocketMatcher::any()],
        });
        graph.edges.push(WorkflowEdge {
            id: "e_cycle".to_string(),
            source_node: "node_output".to_string(),
            source_port: "out_loop".to_string(),
            target_node: "node_input".to_string(),
            target_port: "in_loop".to_string(),
        });

        let result = validate_workflow(&graph);
        assert!(matches!(result, Err(WorkflowError::CycleDetected { .. })));
    }

    #[test]
    fn test_manifest_namespacing_and_collision_prevention() {
        let json_a = r#"{
            "id": "plugin_a",
            "name": "Plugin A",
            "version": "1.0.0",
            "category": "Testing",
            "description": "A",
            "install": { "type": "conda", "packages": ["pkg_a"] },
            "nodes": [
                {
                    "id": "runner",
                    "name": "Runner",
                    "node_type": "executor",
                    "execution": {
                        "type": "binary",
                        "executable_name": "tool_a",
                        "args_template": ["-o", "{work_dir}"]
                    },
                    "outputs": [
                        {
                            "id": "out",
                            "name": "Output",
                            "socket_type": { "kind": "folder", "schema": "output_folder" }
                        }
                    ]
                }
            ]
        }"#;

        let json_b = r#"{
            "id": "plugin_b",
            "name": "Plugin B",
            "version": "1.0.0",
            "category": "Testing",
            "description": "B",
            "install": { "type": "conda", "packages": ["pkg_b"] },
            "nodes": [
                {
                    "id": "runner",
                    "name": "Runner",
                    "node_type": "executor",
                    "execution": {
                        "type": "binary",
                        "executable_name": "tool_b",
                        "args_template": ["-o", "{work_dir}"]
                    },
                    "outputs": [
                        {
                            "id": "out",
                            "name": "Output",
                            "socket_type": { "kind": "folder", "schema": "output_folder" }
                        }
                    ]
                }
            ]
        }"#;

        let loader = ManifestLoader::new();
        let manifest_a = loader.load_from_str(json_a).expect("Plugin A must load");
        let manifest_b = loader.load_from_str(json_b).expect("Plugin B must load");

        // Nodes must be auto-namespaced to prevent collisions
        assert_eq!(manifest_a.nodes[0].id, "plugin_a.runner");
        assert_eq!(manifest_b.nodes[0].id, "plugin_b.runner");

        // Schemas must also be auto-namespaced
        assert_eq!(
            manifest_a.nodes[0].outputs[0].socket_type.schema(),
            Some("plugin_a.output_folder")
        );
        assert_eq!(
            manifest_b.nodes[0].outputs[0].socket_type.schema(),
            Some("plugin_b.output_folder")
        );
    }

    #[test]
    fn test_reserved_keyword_rejection() {
        let loader = ManifestLoader::new();

        // 1. Rejection of 'core' plugin id
        let json_core = r#"{
            "id": "core",
            "name": "Fake Core",
            "version": "1.0.0",
            "category": "Testing",
            "description": "Test",
            "install": { "type": "conda", "packages": [] }
        }"#;
        assert!(loader.load_from_str(json_core).is_err());

        // 2. Rejection of reserved param placeholder name
        let json_reserved_param = r#"{
            "id": "my_tool",
            "name": "My Tool",
            "version": "1.0.0",
            "category": "Testing",
            "description": "Test",
            "install": { "type": "conda", "packages": [] },
            "nodes": [
                {
                    "id": "my_node",
                    "name": "My Node",
                    "node_type": "executor",
                    "execution": {
                        "type": "binary",
                        "executable_name": "tool",
                        "args_template": []
                    },
                    "params": [
                        { "id": "work_dir", "name": "Work Dir", "type": "string", "default": "" }
                    ]
                }
            ]
        }"#;
        let err = loader.load_from_str(json_reserved_param).unwrap_err();
        assert!(err.contains("shadows engine-reserved placeholder"));
    }

    #[test]
    fn test_execution_contract_enforcement() {
        let loader = ManifestLoader::new();

        // Viewer node with execution block must fail
        let json_viewer_with_exec = r#"{
            "id": "test_viz",
            "name": "Viz Tool",
            "version": "1.0.0",
            "category": "Testing",
            "description": "Test",
            "install": { "type": "conda", "packages": [] },
            "nodes": [
                {
                    "id": "viz_card",
                    "name": "Viz Card",
                    "node_type": "viewer",
                    "execution": {
                        "type": "binary",
                        "executable_name": "bad",
                        "args_template": []
                    }
                }
            ]
        }"#;
        assert!(loader.load_from_str(json_viewer_with_exec).is_err());

        // Parser node without execution block must fail
        let json_parser_no_exec = r#"{
            "id": "test_parser",
            "name": "Parser Tool",
            "version": "1.0.0",
            "category": "Testing",
            "description": "Test",
            "install": { "type": "conda", "packages": [] },
            "nodes": [
                {
                    "id": "parse_node",
                    "name": "Parser Node",
                    "node_type": "parser"
                }
            ]
        }"#;
        assert!(loader.load_from_str(json_parser_no_exec).is_err());
    }

    #[test]
    fn test_plugin_version_mismatch_warning() {
        let loader = ManifestLoader::new();
        let json = r#"{
            "id": "versioned_tool",
            "name": "Versioned Tool",
            "version": "2.0.0",
            "category": "Testing",
            "description": "Test",
            "install": { "type": "conda", "packages": [] },
            "nodes": [
                {
                    "id": "runner",
                    "name": "Runner",
                    "node_type": "executor",
                    "execution": {
                        "type": "binary",
                        "executable_name": "run",
                        "args_template": []
                    }
                }
            ]
        }"#;
        loader.load_from_str(json).unwrap();

        let graph = WorkflowGraph {
            nodes: vec![WorkflowNode {
                id: "node_1".to_string(),
                kind: NodeKind::Tool("versioned_tool".to_string()),
                title: "Runner Node".to_string(),
                inputs: vec![],
                outputs: vec![],
                params: serde_json::json!({}),
                position: (0.0, 0.0),
                plugin_version: Some("1.0.0".to_string()),
            }],
            edges: vec![],
        };

        let report = validate_workflow_with_manifests(&graph, Some(&loader)).unwrap();
        assert_eq!(report.warnings.len(), 1);
        assert!(report.warnings[0].contains("version 1.0.0, but version 2.0.0 is currently installed"));
    }
}
