use std::collections::HashMap;
use std::path::Path;
use std::process::Stdio;
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::sync::mpsc;
use vortexflow_workflow::{
    ExecutionStrategy, NodeDefinition, OutputArtifactSpec, ParameterDef, Port, ToolManifest,
};

use crate::env::EnvironmentManager;
use crate::error::EngineError;
use crate::types::WorkflowStreamEvent;

/// Handles subprocess execution, template interpolation, and live streaming for bioinformatics tools
pub struct ToolRunner<'a> {
    env_mgr: &'a EnvironmentManager,
}

impl<'a> ToolRunner<'a> {
    pub fn new(env_mgr: &'a EnvironmentManager) -> Self {
        Self { env_mgr }
    }

    pub async fn execute_tool(
        &self,
        node: &vortexflow_workflow::WorkflowNode,
        manifest: &ToolManifest,
        node_def: Option<&NodeDefinition>,
        inputs: &HashMap<String, serde_json::Value>,
        work_dir: &Path,
        logs: &mut Vec<String>,
        event_tx: &mpsc::Sender<WorkflowStreamEvent>,
    ) -> Result<HashMap<String, serde_json::Value>, EngineError> {
        let env_path = self.env_mgr.get_tool_env_path(&manifest.id, &manifest.version);
        let _databases = self.env_mgr.ensure_databases(&manifest.databases, logs).await?;

        // 1. Resolve input files
        let input_val = inputs
            .get("input_files")
            .or_else(|| inputs.get("sequence_files"))
            .or_else(|| inputs.values().next())
            .ok_or_else(|| EngineError::MissingInput {
                node_id: node.id.clone(),
                port_id: "input_files".to_string(),
            })?;

        let input_files = if let Some(arr) = input_val.get("files").and_then(|f| f.as_array()) {
            arr.iter()
                .filter_map(|v| v.as_str().map(String::from))
                .collect::<Vec<String>>()
        } else if let Some(arr) = input_val.as_array() {
            arr.iter()
                .filter_map(|v| v.as_str().map(String::from))
                .collect::<Vec<String>>()
        } else if let Some(s) = input_val.as_str() {
            vec![s.to_string()]
        } else {
            Vec::new()
        };

        let input_files_str = input_files.join(" ");

        // 2. Build argument list from manifest execution template
        let execution_strategy = manifest
            .get_execution_for_node(&node.id, &node.title)
            .cloned()
            .unwrap_or_else(|| ExecutionStrategy::Binary {
                executable_name: manifest.primary_executable_name().to_string(),
                args_template: vec![
                    "-ifa".to_string(),
                    "{input_files}".to_string(),
                    "-o".to_string(),
                    "{work_dir}".to_string(),
                ],
            });

        let (executable_name, args_template) = match &execution_strategy {
            ExecutionStrategy::Binary {
                executable_name,
                args_template,
            } => (executable_name.clone(), args_template.clone()),
            ExecutionStrategy::PythonModule {
                module_name,
                args_template,
            } => {
                let mut full_args = vec!["-m".to_string(), module_name.clone()];
                full_args.extend(args_template.clone());
                ("python3".to_string(), full_args)
            }
        };

        let node_params_defs: Vec<&ParameterDef> = if let Some(n_def) = node_def {
            n_def.params.iter().chain(manifest.params.iter()).collect()
        } else {
            manifest.params.iter().collect()
        };

        // Interpolate template arguments
        let mut final_args = Vec::new();
        for arg in args_template {
            if arg == "{input_files}" {
                if !input_files.is_empty() {
                    final_args.push(input_files[0].clone());
                } else {
                    final_args.push(input_files_str.clone());
                }
            } else if arg == "{work_dir}" {
                final_args.push(work_dir.to_string_lossy().to_string());
            } else if arg.starts_with('{') && arg.ends_with('}') {
                let param_key = &arg[1..arg.len() - 1];
                let param_def = node_params_defs.iter().find(|p| p.id == param_key);
                let param_val = node.params.get(param_key).or_else(|| param_def.map(|p| &p.default));

                let mut has_value = false;

                if let Some(val) = param_val {
                    if !val.is_null() {
                        if let Some(num) = val.as_f64() {
                            final_args.push(num.to_string());
                            has_value = true;
                        } else if let Some(s) = val.as_str() {
                            let trimmed = s.trim();
                            if !trimmed.is_empty() {
                                final_args.push(trimmed.to_string());
                                has_value = true;
                            }
                        } else if let Some(b) = val.as_bool() {
                            if b {
                                let flag = param_def
                                    .and_then(|p| p.cli_flag.clone())
                                    .unwrap_or_else(|| format!("--{}", param_key));
                                final_args.push(flag);
                                has_value = true;
                            }
                        }
                    }
                }

                // If parameter is omitted/empty, safely drop any preceding CLI flag in paired templates (e.g. ["-s", "{species}"])
                if !has_value {
                    if let Some(last) = final_args.last() {
                        if last.starts_with('-') {
                            final_args.pop();
                        }
                    }
                }
            } else {
                final_args.push(arg);
            }
        }

        // Add any active boolean flags defined in params that weren't in args_template
        for param in &node_params_defs {
            if param.param_type == "boolean" || param.param_type == "bool" {
                let is_active = node
                    .params
                    .get(&param.id)
                    .and_then(|v| {
                        if let Some(b) = v.as_bool() {
                            Some(b)
                        } else if let Some(s) = v.as_str() {
                            Some(s.eq_ignore_ascii_case("true") || s == "1")
                        } else if let Some(n) = v.as_i64() {
                            Some(n == 1)
                        } else {
                            None
                        }
                    })
                    .unwrap_or_else(|| {
                        param.default.as_bool().unwrap_or(false)
                    });

                if is_active {
                    if let Some(ref flag) = param.cli_flag {
                        if !final_args.contains(flag) {
                            final_args.push(flag.clone());
                        }
                    } else {
                        let flag = format!("--{}", param.id);
                        if !final_args.contains(&flag) {
                            final_args.push(flag);
                        }
                    }
                }
            }
        }

        // Add database flag arguments if declared in manifest
        for db in &manifest.databases {
            if let Some(ref flag) = db.cli_flag {
                let db_path = self.env_mgr.get_database_path(&db.destination_subpath);
                if db_path.exists() {
                    final_args.push(flag.clone());
                    final_args.push(db_path.to_string_lossy().to_string());
                }
            }
        }

        let cmd_msg = format!("Invoking: {} {}", executable_name, final_args.join(" "));
        logs.push(cmd_msg.clone());
        let _ = event_tx
            .send(WorkflowStreamEvent::Log {
                node_id: node.id.clone(),
                line: cmd_msg,
            })
            .await;

        // 3. Spawn subprocess command with piped stdout/stderr for live streaming
        let mut cmd = self.env_mgr.prepare_command(&env_path, manifest, &executable_name);
        cmd.args(&final_args);
        cmd.current_dir(work_dir);
        cmd.stdout(Stdio::piped());
        cmd.stderr(Stdio::piped());
        cmd.kill_on_drop(true);

        let mut child = match cmd.spawn() {
            Ok(c) => c,
            Err(e) => {
                return Err(EngineError::NodeExecutionFailed {
                    node_id: node.id.clone(),
                    message: format!(
                        "Could not spawn binary '{}' from {:?}: {}. Please verify the extension is installed.",
                        executable_name, env_path, e
                    ),
                });
            }
        };

        let stdout = child.stdout.take();
        let stderr = child.stderr.take();

        let tx_out = event_tx.clone();
        let node_id_out = node.id.clone();
        let stdout_handle = tokio::spawn(async move {
            let mut captured = Vec::new();
            if let Some(pipe) = stdout {
                let mut reader = BufReader::new(pipe).lines();
                while let Ok(Some(line)) = reader.next_line().await {
                    let formatted = format!("[stdout] {}", line);
                    let _ = tx_out
                        .send(WorkflowStreamEvent::Log {
                            node_id: node_id_out.clone(),
                            line: formatted.clone(),
                        })
                        .await;
                    captured.push(formatted);
                }
            }
            captured
        });

        let tx_err = event_tx.clone();
        let node_id_err = node.id.clone();
        let stderr_handle = tokio::spawn(async move {
            let mut captured = Vec::new();
            if let Some(pipe) = stderr {
                let mut reader = BufReader::new(pipe).lines();
                while let Ok(Some(line)) = reader.next_line().await {
                    let formatted = format!("[stderr] {}", line);
                    let _ = tx_err
                        .send(WorkflowStreamEvent::Log {
                            node_id: node_id_err.clone(),
                            line: formatted.clone(),
                        })
                        .await;
                    captured.push(formatted);
                }
            }
            captured
        });

        let status = child.wait().await?;
        let (out_lines, err_lines) = tokio::join!(stdout_handle, stderr_handle);

        if let Ok(lines) = out_lines {
            logs.extend(lines);
        }
        if let Ok(lines) = err_lines {
            logs.extend(lines);
        }

        if !status.success() {
            return Err(EngineError::NodeExecutionFailed {
                node_id: node.id.clone(),
                message: format!("Process '{}' exited with code: {:?}", executable_name, status.code()),
            });
        }

        // 4. Collect output artifacts defined in manifest and child node
        let mut collected_artifacts: HashMap<String, serde_json::Value> = HashMap::new();
        collected_artifacts.insert(
            "work_dir".to_string(),
            serde_json::json!(work_dir.to_string_lossy()),
        );
        collected_artifacts.insert(
            "resfinder_dir".to_string(),
            serde_json::json!(work_dir.to_string_lossy()),
        );
        collected_artifacts.insert(
            "output_dir".to_string(),
            serde_json::json!(work_dir.to_string_lossy()),
        );

        let output_artifacts_defs: Vec<&OutputArtifactSpec> = if let Some(n_def) = node_def {
            n_def.output_artifacts.iter().chain(manifest.output_artifacts.iter()).collect()
        } else {
            manifest.output_artifacts.iter().collect()
        };

        for artifact in output_artifacts_defs {
            let artifact_path = work_dir.join(&artifact.file_pattern);
            if artifact_path.exists() {
                collected_artifacts.insert(
                    artifact.id.clone(),
                    serde_json::json!(artifact_path.to_string_lossy()),
                );
            }
        }

        let output_ports_defs: Vec<&Port> = if let Some(n_def) = node_def {
            n_def.outputs.iter().chain(manifest.outputs.iter()).collect()
        } else {
            manifest.outputs.iter().collect()
        };

        let mut outputs = HashMap::new();
        for out_port in output_ports_defs {
            if let Some(val) = collected_artifacts.get(&out_port.id) {
                outputs.insert(out_port.id.clone(), val.clone());
            } else if out_port.id == "resfinder_dir" || out_port.id == "output_dir" {
                outputs.insert(out_port.id.clone(), serde_json::json!(work_dir.to_string_lossy()));
            } else {
                outputs.insert(out_port.id.clone(), serde_json::json!(collected_artifacts));
            }
        }
        outputs.insert("work_dir".to_string(), serde_json::json!(work_dir.to_string_lossy()));

        Ok(outputs)
    }
}
