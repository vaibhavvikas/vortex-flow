pub mod env;
pub mod error;
pub mod executor;
pub mod installer;
pub mod nodes;
pub mod runner;
pub mod types;

pub use env::EnvironmentManager;
pub use error::EngineError;
pub use executor::WorkflowExecutor;
pub use installer::{InstallLogManager, ToolInstaller};
pub use runner::ToolRunner;
pub use types::{
    NodeExecutionReport, NodeStatus, WorkflowExecutionReport, WorkflowStreamEvent,
};

#[cfg(test)]
mod tests {
    use super::*;
    use vortexflow_workflow::WorkflowGraph;

    #[tokio::test]
    async fn test_execute_resfinder_workflow() {
        let temp_dir = std::env::temp_dir().join(format!("vortexflow_test_{}", uuid::Uuid::new_v4()));
        let fasta_dir = temp_dir.join("fastas");
        tokio::fs::create_dir_all(&fasta_dir).await.unwrap();
        tokio::fs::write(fasta_dir.join("sample1.fasta"), ">contig1\nATGCGATCGATC\n").await.unwrap();

        let env_mgr = EnvironmentManager::new(temp_dir.join("envs"));
        let env_path = env_mgr.get_tool_env_path("resfinder", "4.4.2");
        tokio::fs::create_dir_all(env_path.join("bin")).await.unwrap();
        let test_exe = env_path.join("bin").join("run_resfinder.py");
        tokio::fs::write(&test_exe, "#!/bin/sh\nexit 0\n").await.unwrap();
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let _ = std::fs::set_permissions(&test_exe, std::fs::Permissions::from_mode(0o755));
        }

        // Pre-create test databases so unit tests don't do network cloning
        tokio::fs::create_dir_all(env_mgr.get_database_path("db/resfinder_db")).await.unwrap();
        tokio::fs::create_dir_all(env_mgr.get_database_path("db/pointfinder_db")).await.unwrap();

        let loader = std::sync::Arc::new(vortexflow_workflow::ManifestLoader::new());
        let executor = WorkflowExecutor::new(env_mgr, loader);

        let mut graph = WorkflowGraph::template_resfinder();
        graph.nodes[0].params = serde_json::json!({
            "directory_path": fasta_dir.to_string_lossy(),
            "file_pattern": "*.fasta",
        });
        graph.nodes[2].params = serde_json::json!({
            "destination_dir": temp_dir.join("output").to_string_lossy(),
        });

        let report = executor
            .execute(&graph, &temp_dir.join("run"))
            .await
            .expect("execution should succeed");

        assert!(report.is_success);
        assert_eq!(report.node_reports.len(), 3);
        assert_eq!(report.node_reports[0].node_id, "node_input");
        assert_eq!(report.node_reports[1].node_id, "node_resfinder");
        assert_eq!(report.node_reports[2].node_id, "node_output");

        // Clean up
        let _ = tokio::fs::remove_dir_all(&temp_dir).await;
    }
}
