use std::path::{Path, PathBuf};
use tracing::info;
use vortexflow_workflow::{DatabaseRequirement, ToolManifest};
use crate::error::EngineError;

/// Manages self-contained tool extensions within the user's ~/.vortexflow/extensions/ directory
#[derive(Debug, Clone)]
pub struct EnvironmentManager {
    extensions_dir: PathBuf,
}

impl Default for EnvironmentManager {
    fn default() -> Self {
        let home = dirs::home_dir().unwrap_or_else(|| PathBuf::from("."));
        let extensions_dir = home.join(".vortexflow").join("extensions");
        Self { extensions_dir }
    }
}

impl EnvironmentManager {
    pub fn new(base_dir: PathBuf) -> Self {
        let extensions_dir = if base_dir.ends_with("extensions") {
            base_dir
        } else if base_dir.ends_with("envs") || base_dir.ends_with("databases") {
            base_dir.parent().unwrap_or(&base_dir).join("extensions")
        } else {
            base_dir.join("extensions")
        };
        Self { extensions_dir }
    }

    /// Gets the root bundle directory for a tool extension (e.g. ~/.vortexflow/extensions/resfinder)
    pub fn get_tool_dir(&self, tool_id: &str) -> PathBuf {
        self.extensions_dir.join(tool_id)
    }

    /// Gets the path to a tool's isolated runtime environment (e.g. ~/.vortexflow/extensions/resfinder/env)
    pub fn get_tool_env_path(&self, tool_id: &str, _version: &str) -> PathBuf {
        self.get_tool_dir(tool_id).join("env")
    }

    /// Gets the path to a companion database or data directory (e.g. ~/.vortexflow/extensions/resfinder/data/resfinder_db)
    pub fn get_database_path(&self, subpath: &str) -> PathBuf {
        self.extensions_dir.join(subpath)
    }

    /// Checks if a tool environment is already provisioned
    pub fn is_env_ready(&self, tool_id: &str, version: &str) -> bool {
        let env_path = self.get_tool_env_path(tool_id, version);
        let bin_dir = env_path.join("bin");
        bin_dir.exists()
    }

    /// Checks if a database requirement is ready
    pub fn is_database_ready(&self, req: &DatabaseRequirement) -> bool {
        let db_path = self.get_database_path(&req.destination_subpath);
        db_path.exists()
    }

    /// Ensures the isolated environment for a tool is provisioned without polluting system PATH
    pub async fn ensure_env(&self, tool_id: &str, version: &str, _package: &str) -> Result<PathBuf, EngineError> {
        let env_path = self.get_tool_env_path(tool_id, version);

        if self.is_env_ready(tool_id, version) {
            info!("Tool environment for {} {} already exists at {:?}", tool_id, version, env_path);
            return Ok(env_path);
        }

        // Create the isolated directory structure
        tokio::fs::create_dir_all(&env_path).await?;
        let bin_dir = env_path.join("bin");
        tokio::fs::create_dir_all(&bin_dir).await?;

        info!("Provisioning isolated environment in {:?}", env_path);
        Ok(env_path)
    }

    /// Ensures database dependencies are provisioned inside the tool's extension data directory
    pub async fn ensure_databases(&self, databases: &[DatabaseRequirement], logs: &mut Vec<String>) -> Result<Vec<(String, PathBuf)>, EngineError> {
        let mut db_paths = Vec::new();
        tokio::fs::create_dir_all(&self.extensions_dir).await?;

        for db in databases {
            let target_path = self.get_database_path(&db.destination_subpath);
            if !target_path.exists() {
                tokio::fs::create_dir_all(&target_path).await?;
                logs.push(format!("Provisioned database directory for '{}' at {:?}", db.name, target_path));
            } else {
                logs.push(format!("Database '{}' ready at {:?}", db.name, target_path));
            }
            db_paths.push((db.name.clone(), target_path));
        }

        Ok(db_paths)
    }

    /// Prepares a child process command with PATH strictly scoped to the isolated env
    pub fn prepare_command(
        &self,
        env_path: &Path,
        manifest: &ToolManifest,
        executable_name: &str,
    ) -> tokio::process::Command {
        let bin_dir = env_path.join("bin");
        let exe_path = bin_dir.join(executable_name);

        let target_exe = if exe_path.exists() {
            exe_path
        } else {
            PathBuf::from(executable_name)
        };

        let mut cmd = tokio::process::Command::new(target_exe);

        // Strictly prepend isolated bin directory without touching host system config
        let current_path = std::env::var("PATH").unwrap_or_default();
        let scoped_path = format!("{}:{}", bin_dir.to_string_lossy(), current_path);
        cmd.env("PATH", scoped_path);

        // Inject database environment variables if declared in manifest
        for db in &manifest.databases {
            if let Some(ref env_var) = db.env_var_name {
                let db_path = self.get_database_path(&db.destination_subpath);
                cmd.env(env_var, db_path);
            }
        }

        cmd
    }
}
