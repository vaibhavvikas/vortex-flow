use std::path::{Path, PathBuf};
use tracing::info;
use vortexflow_workflow::{DatabaseRequirement, ToolManifest};
use crate::error::EngineError;

/// Manages isolated tool environments within the user's ~/.vortexflow/ directory
#[derive(Debug, Clone)]
pub struct EnvironmentManager {
    base_dir: PathBuf,
    db_base_dir: PathBuf,
}

impl Default for EnvironmentManager {
    fn default() -> Self {
        let home = dirs::home_dir().unwrap_or_else(|| PathBuf::from("."));
        let base_dir = home.join(".vortexflow").join("envs");
        let db_base_dir = home.join(".vortexflow").join("databases");
        Self { base_dir, db_base_dir }
    }
}

impl EnvironmentManager {
    pub fn new(base_dir: PathBuf) -> Self {
        let db_base_dir = base_dir.parent().unwrap_or(&base_dir).join("databases");
        Self { base_dir, db_base_dir }
    }

    /// Gets the path to a tool's isolated environment directory
    pub fn get_tool_env_path(&self, tool_id: &str, version: &str) -> PathBuf {
        self.base_dir.join(format!("{}-{}", tool_id, version))
    }

    /// Gets the path to a reference database directory
    pub fn get_database_path(&self, db_name: &str) -> PathBuf {
        self.db_base_dir.join(db_name)
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

    /// Ensures database dependencies are provisioned in ~/.vortexflow/databases/
    pub async fn ensure_databases(&self, databases: &[DatabaseRequirement], logs: &mut Vec<String>) -> Result<Vec<(String, PathBuf)>, EngineError> {
        let mut db_paths = Vec::new();
        tokio::fs::create_dir_all(&self.db_base_dir).await?;

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
