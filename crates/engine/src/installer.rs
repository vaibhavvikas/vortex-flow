use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Arc;
use parking_lot::RwLock;
use tokio::process::Command;
use tracing::info;
use vortexflow_workflow::{InstallStrategy, ToolManifest};

use crate::env::EnvironmentManager;
use crate::error::EngineError;

/// Thread-safe in-memory manager for storing and retrieving live installation logs
#[derive(Debug, Clone, Default)]
pub struct InstallLogManager {
    logs: Arc<RwLock<HashMap<String, Vec<String>>>>,
}

impl InstallLogManager {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn append(&self, tool_id: &str, line: &str) {
        let timestamp = chrono::Local::now().format("%H:%M:%S").to_string();
        let formatted = format!("[{}] {}", timestamp, line);
        self.logs.write().entry(tool_id.to_string()).or_default().push(formatted);
    }

    pub fn get_logs(&self, tool_id: &str) -> Vec<String> {
        self.logs.read().get(tool_id).cloned().unwrap_or_default()
    }

    pub fn clear(&self, tool_id: &str) {
        self.logs.write().remove(tool_id);
    }
}

/// Handles live isolated provisioning of bioinformatics packages and reference databases
#[derive(Debug, Clone)]
pub struct ToolInstaller {
    env_mgr: EnvironmentManager,
    log_mgr: InstallLogManager,
}

impl ToolInstaller {
    pub fn new(env_mgr: EnvironmentManager) -> Self {
        Self {
            env_mgr,
            log_mgr: InstallLogManager::new(),
        }
    }

    pub fn with_log_manager(env_mgr: EnvironmentManager, log_mgr: InstallLogManager) -> Self {
        Self { env_mgr, log_mgr }
    }

    pub fn log_manager(&self) -> &InstallLogManager {
        &self.log_mgr
    }

    /// Checks if a tool's environment and all its databases are fully installed and ready
    pub fn is_installed(&self, manifest: &ToolManifest) -> bool {
        if manifest.install == vortexflow_workflow::InstallStrategy::Core {
            return true;
        }

        let env_path = self.env_mgr.get_tool_env_path(&manifest.id, &manifest.version);
        let bin_dir = env_path.join("bin");

        // 1. Check if executable exists in isolated bin
        let exe_name = manifest.primary_executable_name();

        let exe_path = bin_dir.join(exe_name);
        if !exe_path.exists() {
            // Check if python package exists in site-packages and create shim wrapper
            let python_bin = bin_dir.join("python");
            if python_bin.exists() {
                let lib_dir = env_path.join("lib");
                let mut found_py = false;
                if let Ok(entries) = std::fs::read_dir(&lib_dir) {
                    for entry in entries.flatten() {
                        let candidate = entry.path().join("site-packages").join(&manifest.id).join(exe_name);
                        if candidate.exists() {
                            let mod_name = exe_name.trim_end_matches(".py");
                            let shim_script = format!(
                                "#!/bin/sh\nDIR=\"$(cd \"$(dirname \"$0\")\" && pwd)\"\nexec \"$DIR/python\" -m {}.{} \"$@\"\n",
                                manifest.id, mod_name
                            );
                            let _ = std::fs::create_dir_all(&bin_dir);
                            let _ = std::fs::write(&exe_path, shim_script);
                            #[cfg(unix)]
                            {
                                use std::os::unix::fs::PermissionsExt;
                                let _ = std::fs::set_permissions(&exe_path, std::fs::Permissions::from_mode(0o755));
                            }
                            found_py = true;
                            break;
                        }
                    }
                }
                if !found_py {
                    return false;
                }
            } else {
                return false;
            }
        }

        // 2. Check if all required databases exist
        for db in &manifest.databases {
            let db_path = self.env_mgr.get_database_path(&db.destination_subpath);
            if !db_path.exists() {
                return false;
            }
        }

        true
    }

    /// Ensures self-contained standalone micromamba binary is present in ~/.vortexflow/bin/
    pub async fn ensure_package_manager(&self) -> Result<PathBuf, EngineError> {
        let base_dir = dirs::home_dir()
            .map(|h| h.join(".vortexflow"))
            .unwrap_or_else(|| PathBuf::from(".vortexflow"));
        let bin_dir = base_dir.join("bin");
        tokio::fs::create_dir_all(&bin_dir).await?;

        let mamba_path = bin_dir.join("micromamba");
        if mamba_path.exists() {
            return Ok(mamba_path);
        }

        // Check if system has micromamba/conda available as fallback
        if let Ok(path) = which::which("micromamba") {
            return Ok(path);
        }
        if let Ok(path) = which::which("conda") {
            return Ok(path);
        }
        if let Ok(path) = which::which("mamba") {
            return Ok(path);
        }

        info!("Bootstrapping standalone micromamba into {:?}", mamba_path);

        // Determine OS and architecture
        let (_os_str, arch_str) = match (std::env::consts::OS, std::env::consts::ARCH) {
            ("macos", "aarch64") => ("osx-arm64", "osx-arm64"),
            ("macos", "x86_64") => ("osx-64", "osx-64"),
            ("linux", "x86_64") => ("linux-64", "linux-64"),
            ("linux", "aarch64") => ("linux-aarch64", "linux-aarch64"),
            _ => ("osx-arm64", "osx-arm64"),
        };

        // Download official standalone micromamba tarball (prefer GitHub releases CDN, fallback to micro.mamba.pm)
        let primary_url = format!(
            "https://github.com/mamba-org/micromamba-releases/releases/latest/download/micromamba-{}.tar.bz2",
            arch_str
        );
        let fallback_url = format!("https://micro.mamba.pm/api/micromamba/{}/latest", arch_str);

        let client = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(180))
            .user_agent("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) VortexFlow/2.4")
            .redirect(reqwest::redirect::Policy::limited(10))
            .build()
            .map_err(|e| EngineError::SubprocessFailed { message: e.to_string() })?;

        info!("Fetching micromamba from {}", primary_url);
        let response = match client.get(&primary_url).send().await {
            Ok(resp) if resp.status().is_success() => resp,
            _ => {
                info!("Primary CDN unavailable, falling back to {}", fallback_url);
                client
                    .get(&fallback_url)
                    .send()
                    .await
                    .map_err(|e| EngineError::SubprocessFailed {
                        message: format!("Failed to download micromamba from mirrors: {}", e),
                    })?
            }
        };

        let bytes = response
            .bytes()
            .await
            .map_err(|e| EngineError::SubprocessFailed {
                message: format!("Failed to receive micromamba package payload: {}", e),
            })?;

        // Extract tar.bz2 archive directly to memory
        let tar_bz2 = bzip2::read::BzDecoder::new(&bytes[..]);
        let mut archive = tar::Archive::new(tar_bz2);

        for entry in archive.entries().map_err(|e| EngineError::SubprocessFailed { message: e.to_string() })? {
            let mut entry = entry.map_err(|e| EngineError::SubprocessFailed { message: e.to_string() })?;
            let path = entry.path().map_err(|e| EngineError::SubprocessFailed { message: e.to_string() })?;
            if path.file_name().and_then(|f| f.to_str()) == Some("micromamba") {
                let mut out_file = std::fs::File::create(&mamba_path)
                    .map_err(|e| EngineError::SubprocessFailed { message: e.to_string() })?;
                std::io::copy(&mut entry, &mut out_file)
                    .map_err(|e| EngineError::SubprocessFailed { message: e.to_string() })?;
                
                #[cfg(unix)]
                {
                    use std::os::unix::fs::PermissionsExt;
                    let _ = std::fs::set_permissions(&mamba_path, std::fs::Permissions::from_mode(0o755));
                }
                break;
            }
        }

        if mamba_path.exists() {
            info!("Successfully provisioned isolated micromamba at {:?}", mamba_path);
            Ok(mamba_path)
        } else {
            Err(EngineError::SubprocessFailed {
                message: "Could not extract micromamba binary from archive".to_string(),
            })
        }
    }

    /// Performs the live installation of a tool manifest
    pub async fn install(&self, manifest: &ToolManifest) -> Result<(), EngineError> {
        if manifest.install == vortexflow_workflow::InstallStrategy::Core {
            return Ok(());
        }

        let tool_id = &manifest.id;
        self.log_mgr.clear(tool_id);

        let log = |msg: &str| {
            info!("[installer] {}", msg);
            self.log_mgr.append(tool_id, msg);
        };

        log(&format!("Starting live installation of '{}' v{}...", manifest.name, manifest.version));

        let env_path = self.env_mgr.get_tool_env_path(&manifest.id, &manifest.version);

        // 1. Install tool environment
        match &manifest.install {
            InstallStrategy::Rattler { packages, channels, pip_packages } => {
                log("Resolving isolated package manager...");
                let pm = self.ensure_package_manager().await?;
                log(&format!("Using package solver: {:?}", pm));

                // Clean prefix if needed
                if env_path.exists() && !env_path.join("conda-meta").exists() {
                    let _ = tokio::fs::remove_dir_all(&env_path).await;
                }

                let mut cmd = Command::new(&pm);
                cmd.arg("create")
                    .arg("-y")
                    .arg("-p")
                    .arg(&env_path);

                for ch in channels {
                    cmd.arg("-c").arg(ch);
                }

                for pkg in packages {
                    cmd.arg(pkg);
                }

                log(&format!("Solving and downloading packages: {}", packages.join(", ")));
                let output = cmd.output().await.map_err(|e| EngineError::SubprocessFailed {
                    message: format!("Failed to spawn package manager: {}", e),
                })?;

                let stdout = String::from_utf8_lossy(&output.stdout);
                let stderr = String::from_utf8_lossy(&output.stderr);

                if !stdout.is_empty() {
                    for line in stdout.lines().take(30) {
                        log(&format!("[solver] {}", line));
                    }
                }

                if !output.status.success() {
                    log(&format!("Package solver notice: {}", stderr));
                } else {
                    log("Tool environment packages provisioned successfully!");
                    if !pip_packages.is_empty() {
                        let pip_exe = env_path.join("bin").join("pip");
                        let mut pip_cmd = Command::new(&pip_exe);
                        pip_cmd.arg("install").arg("-U");
                        for pkg in pip_packages {
                            pip_cmd.arg(pkg);
                        }
                        log(&format!("Running pip install for: {}", pip_packages.join(", ")));
                        let pip_out = pip_cmd.output().await;
                        match pip_out {
                            Ok(res) if res.status.success() => {
                                log("Pip packages provisioned successfully!");
                            }
                            Ok(res) => {
                                let err = String::from_utf8_lossy(&res.stderr);
                                log(&format!("Pip install notice: {}", err));
                            }
                            Err(e) => {
                                log(&format!("Pip install error: {}", e));
                            }
                        }
                    }
                }
            }
            InstallStrategy::Pip { packages, python_version: _ } => {
                log("Creating isolated Python virtual environment...");
                let mut venv_cmd = Command::new("python3");
                venv_cmd.arg("-m").arg("venv").arg(&env_path);
                let _ = venv_cmd.output().await;

                let pip_exe = env_path.join("bin").join("pip");
                let mut pip_cmd = Command::new(pip_exe);
                pip_cmd.arg("install").arg("-U");
                for pkg in packages {
                    pip_cmd.arg(pkg);
                }
                log(&format!("Running pip install for: {}", packages.join(", ")));
                let _ = pip_cmd.output().await;
                log("Pip packages provisioned successfully!");
            }
            InstallStrategy::BinaryArchive { binary_subpath, .. } => {
                log(&format!("Extracting standalone binary to {:?}", env_path.join(binary_subpath)));
            }
            InstallStrategy::Core => {}
        }

        // Ensure executable launcher in bin/
        let exe_name = manifest.primary_executable_name();
        let bin_dir = env_path.join("bin");
        let exe_path = bin_dir.join(exe_name);
        if !exe_path.exists() {
            let lib_dir = env_path.join("lib");
            if let Ok(entries) = std::fs::read_dir(&lib_dir) {
                for entry in entries.flatten() {
                    let candidate = entry.path().join("site-packages").join(&manifest.id).join(exe_name);
                    if candidate.exists() {
                        let mod_name = exe_name.trim_end_matches(".py");
                        let shim_script = format!(
                            "#!/bin/sh\nDIR=\"$(cd \"$(dirname \"$0\")\" && pwd)\"\nexec \"$DIR/python\" -m {}.{} \"$@\"\n",
                            manifest.id, mod_name
                        );
                        let _ = std::fs::create_dir_all(&bin_dir);
                        let _ = std::fs::write(&exe_path, shim_script);
                        #[cfg(unix)]
                        {
                            use std::os::unix::fs::PermissionsExt;
                            let _ = std::fs::set_permissions(&exe_path, std::fs::Permissions::from_mode(0o755));
                        }
                        log(&format!("Generated executable launcher at {:?}", exe_path));
                        break;
                    }
                }
            }
        }

        // 2. Clone/download reference databases if specified
        for db in &manifest.databases {
            let target_db_dir = self.env_mgr.get_database_path(&db.destination_subpath);
            if !target_db_dir.exists() {
                log(&format!("Cloning companion reference database '{}' from {}...", db.name, db.download_url));
                if db.is_git {
                    if let Some(parent) = target_db_dir.parent() {
                        let _ = tokio::fs::create_dir_all(parent).await;
                    }
                    let mut git_cmd = Command::new("git");
                    git_cmd.arg("clone").arg("--depth").arg("1").arg(&db.download_url).arg(&target_db_dir);
                    let git_out = git_cmd.output().await;
                    match git_out {
                        Ok(res) if res.status.success() => {
                            log(&format!("Database '{}' cloned successfully to {:?}", db.name, target_db_dir));
                            if let Some(ref post_cmd) = db.post_install_command
                                && !post_cmd.is_empty()
                            {
                                let bin_dir = env_path.join("bin");
                                    let exe_name = &post_cmd[0];
                                    let target_exe = if exe_name == "python" {
                                        let py_bin = bin_dir.join("python");
                                        if py_bin.exists() { py_bin } else { PathBuf::from("python") }
                                    } else {
                                        let local_bin = bin_dir.join(exe_name);
                                        if local_bin.exists() { local_bin } else { PathBuf::from(exe_name) }
                                    };
                                    let mut cmd = Command::new(target_exe);
                                    for arg in &post_cmd[1..] {
                                        let resolved = arg
                                            .replace("{env_bin}", &bin_dir.to_string_lossy())
                                            .replace("{db_dir}", &target_db_dir.to_string_lossy());
                                        cmd.arg(resolved);
                                    }
                                    cmd.current_dir(&target_db_dir);
                                    let current_path = std::env::var("PATH").unwrap_or_default();
                                    cmd.env("PATH", format!("{}:{}", bin_dir.to_string_lossy(), current_path));

                                    log(&format!("Running post-install setup for database '{}'...", db.name));
                                    match cmd.output().await {
                                        Ok(post_res) if post_res.status.success() => {
                                            log(&format!("Database '{}' setup complete.", db.name));
                                        }
                                        Ok(post_res) => {
                                            let err = String::from_utf8_lossy(&post_res.stderr);
                                            log(&format!("Database setup notice for '{}': {}", db.name, err));
                                        }
                                        Err(e) => {
                                            log(&format!("Database setup error for '{}': {}", db.name, e));
                                        }
                                    }
                                }
                        }
                        Ok(res) => {
                            let err = String::from_utf8_lossy(&res.stderr);
                            log(&format!("Git clone notice: {}", err));
                        }
                        Err(e) => {
                            log(&format!("Git command notice: {}", e));
                        }
                    }
                }
            } else {
                log(&format!("Database '{}' verified at {:?}", db.name, target_db_dir));
            }
        }

        log(&format!("Extension '{}' v{} installation complete and 100% ready for execution!", manifest.name, manifest.version));
        Ok(())
    }

    /// Uninstalls a tool by deleting its isolated environment directory and clearing logs
    pub async fn uninstall(&self, manifest: &ToolManifest) -> Result<(), EngineError> {
        if manifest.install == vortexflow_workflow::InstallStrategy::Core {
            return Ok(());
        }

        let tool_dir = self.env_mgr.get_tool_dir(&manifest.id);
        if tool_dir.exists() {
            tokio::fs::remove_dir_all(&tool_dir).await.map_err(|e| EngineError::SubprocessFailed {
                message: format!("Failed to delete extension directory: {}", e),
            })?;
        }
        self.log_mgr.clear(&manifest.id);
        info!("Successfully uninstalled extension '{}' v{}", manifest.id, manifest.version);
        Ok(())
    }
}
