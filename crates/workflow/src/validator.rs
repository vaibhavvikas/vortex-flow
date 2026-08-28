use std::collections::{HashMap, HashSet};
use petgraph::algo::{is_cyclic_directed, toposort};
use petgraph::graphmap::DiGraphMap;

use crate::error::WorkflowError;
use crate::types::{PortDirection, WorkflowGraph};

/// Result of validating a workflow graph
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ValidationReport {
    pub is_valid: bool,
    pub execution_order: Vec<String>,
}

/// Validates a workflow graph:
/// 1. Node uniqueness
/// 2. Port existence and directions
/// 3. Socket type compatibility
/// 4. Strict cycle detection (rejects cycles)
/// 5. Computes topological execution order
pub fn validate_workflow(graph: &WorkflowGraph) -> Result<ValidationReport, WorkflowError> {
    let mut node_map = HashMap::new();

    // 1. Verify unique node IDs
    for node in &graph.nodes {
        if node_map.contains_key(node.id.as_str()) {
            return Err(WorkflowError::DuplicateNodeId {
                node_id: node.id.clone(),
            });
        }
        node_map.insert(node.id.as_str(), node);
    }

    // 2. Validate edges and port compatibility
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

        if source_port.direction != PortDirection::Output || target_port.direction != PortDirection::Input {
            return Err(WorkflowError::InvalidPortDirection);
        }

        if !source_port.socket_type.can_connect_to(&target_port.socket_type) {
            return Err(WorkflowError::IncompatibleSocketTypes {
                source_node: edge.source_node.clone(),
                source_port: edge.source_port.clone(),
                source_type: source_port.socket_type.clone(),
                target_node: edge.target_node.clone(),
                target_port: edge.target_port.clone(),
                target_type: target_port.socket_type.clone(),
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
        // Collect nodes involved in cycles
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

    let execution_order = sorted_indices
        .into_iter()
        .map(|node_id| node_id.to_string())
        .collect();

    Ok(ValidationReport {
        is_valid: true,
        execution_order,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
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
    fn test_cycle_detection() {
        let mut graph = WorkflowGraph::template_resfinder();
        // Add a back-edge creating a cycle: node_output -> node_input
        // Give node_output an output port and node_input an input port to test cycle logic
        graph.nodes[2].outputs.push(Port {
            id: "out_loop".to_string(),
            name: "Loop".to_string(),
            socket_type: SocketType::Any,
            direction: PortDirection::Output,
        });
        graph.nodes[0].inputs.push(Port {
            id: "in_loop".to_string(),
            name: "Loop".to_string(),
            socket_type: SocketType::Any,
            direction: PortDirection::Input,
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
    fn test_json_payload_deserialization() {
        let json_str = r#"{
            "nodes": [
                {
                    "id": "node_input",
                    "kind": { "type": "folder_input" },
                    "title": "Folder Input",
                    "inputs": [],
                    "outputs": [{
                        "id": "sequence_files",
                        "name": "Sequence Files",
                        "socket_type": "sequence_folder",
                        "direction": "output"
                    }],
                    "params": { "directory_path": "/data", "file_pattern": "*.fasta" },
                    "position": [50.0, 140.0]
                },
                {
                    "id": "node_resfinder",
                    "kind": { "type": "tool", "tool_id": "resfinder" },
                    "title": "ResFinder 4.4.2",
                    "inputs": [{
                        "id": "input_files",
                        "name": "Sequence Files",
                        "socket_type": "sequence_folder",
                        "direction": "input"
                    }],
                    "outputs": [{
                        "id": "resfinder_report",
                        "name": "ResFinder Report",
                        "socket_type": "resfinder_report",
                        "direction": "output"
                    }],
                    "params": { "threshold": 0.9, "min_cov": 0.6, "species": "other" },
                    "position": [490.0, 140.0]
                },
                {
                    "id": "node_output",
                    "kind": { "type": "output_save" },
                    "title": "Output Save",
                    "inputs": [{
                        "id": "results",
                        "name": "ResFinder Report",
                        "socket_type": "resfinder_report",
                        "direction": "input"
                    }],
                    "outputs": [],
                    "params": { "destination_dir": "./results", "export_format": "tsv" },
                    "position": [930.0, 140.0]
                }
            ],
            "edges": [
                {
                    "id": "e_input_to_rf",
                    "source_node": "node_input",
                    "source_port": "sequence_files",
                    "target_node": "node_resfinder",
                    "target_port": "input_files"
                },
                {
                    "id": "e_rf_to_output",
                    "source_node": "node_resfinder",
                    "source_port": "resfinder_report",
                    "target_node": "node_output",
                    "target_port": "results"
                }
            ]
        }"#;

        let graph: WorkflowGraph = serde_json::from_str(json_str).expect("JSON must deserialize cleanly");
        let report = validate_workflow(&graph).expect("Workflow must be valid");
        assert!(report.is_valid);
    }
}
