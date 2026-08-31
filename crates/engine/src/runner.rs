use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::process::Stdio;
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::sync::mpsc;
use vortexflow_workflow::{
    ArgElement, DatabaseRequirement, ExecutionStrategy, NodeDefinition, OutputArtifactSpec,
    ParameterDef, ToolManifest,
};

use crate::env::EnvironmentManager;
use crate::error::EngineError;
use crate::types::WorkflowStreamEvent;

/// Builds the final CLI arguments adhering strictly to the engine injection contract:
/// 1. Interpolates placeholders ({work_dir}, {input_files}, {param_id}) inside args_template.
/// 2. Auto-appends active boolean flags and non-boolean params with `cli_flag` if not referenced in template.
/// 3. Auto-appends database flags only for databases declared in `requires_databases` if not referenced in template.
/// 4. Avoids double-injection of explicitly templated parameters or databases.
/// 5. Handles conditional flags (ArgElement::Conditional) to pick single/multiple flag based on cardinality.
pub fn build_argv(
    args_template: &[ArgElement],
    params_defs: &[ParameterDef],
    param_values: &serde_json::Value,
    databases: &[DatabaseRequirement],
    requires_databases: &[String],
    get_db_path: impl Fn(&str) -> Option<PathBuf>,
    placeholders: &HashMap<String, String>,
) -> Result<Vec<String>, EngineError> {
    let mut final_args = Vec::new();
    let mut explicitly_referenced_params = HashSet::new();
    let mut explicitly_referenced_dbs = HashSet::new();

    // 1. Template Interpolation
    for arg_element in args_template {
        match arg_element {
            ArgElement::Conditional { single, multiple, placeholder } => {
                // Resolve the placeholder and pick the appropriate flag based on cardinality
                let key = placeholder.as_str();
                if let Some(val) = placeholders.get(key) {
                    let items: Vec<&str> = val
                        .split(['\t', '\n'])
                        .filter(|s| !s.trim().is_empty())
                        .collect();
                    if items.len() <= 1 {
                        final_args.push(single.clone());
                    } else {
                        final_args.push(multiple.clone());
                    }
                    for item in &items {
                        final_args.push(item.to_string());
                    }
                }
                // Conditional elements self-contain their placeholder, so mark it referenced
                explicitly_referenced_params.insert(key.to_string());
            }
            ArgElement::Literal(arg) => {
                if arg.starts_with('{') && arg.ends_with('}') {
            let key = &arg[1..arg.len() - 1];

            if let Some(val) = placeholders.get(key) {
                if !val.trim().is_empty() {
                    // Universal expansion: split multi-value/tab-delimited placeholders into discrete CLI arguments
                    for item in val.split(['\t', '\n']).filter(|s| !s.trim().is_empty()) {
                        final_args.push(item.to_string());
                    }
                }
            } else if let Some(db) = databases.iter().find(|d| d.name == key) {
                explicitly_referenced_dbs.insert(db.name.clone());
                if let Some(path) = get_db_path(&db.destination_subpath) {
                    final_args.push(path.to_string_lossy().to_string());
                }
            } else if let Some(param_def) = params_defs.iter().find(|p| p.id == key) {
                explicitly_referenced_params.insert(param_def.id.clone());
                let param_val = param_values.get(key).unwrap_or(&param_def.default);

                let mut has_val = false;
                if !param_val.is_null() {
                    if let Some(num) = param_val.as_f64() {
                        final_args.push(num.to_string());
                        has_val = true;
                    } else if let Some(s) = param_val.as_str() {
                        let trimmed = s.trim();
                        if !trimmed.is_empty() {
                            final_args.push(trimmed.to_string());
                            has_val = true;
                        }
                    } else if let Some(b) = param_val.as_bool()
                        && b {
                            let flag = param_def
                                .cli_flag
                                .clone()
                                .unwrap_or_else(|| format!("--{}", param_def.id));
                            final_args.push(flag);
                            has_val = true;
                        }
                }

                // If optional parameter is empty/omitted, safely drop any preceding CLI flag in paired templates (e.g. ["-s", "{species}"])
                if !has_val
                    && let Some(last) = final_args.last()
                        && last.starts_with('-') {
                            final_args.pop();
                        }
            } else {
                return Err(EngineError::InvalidArgumentTemplate {
                    placeholder: key.to_string(),
                });
            }
        } else {
            final_args.push(arg.clone());
        }
            }
        }
    }

    // 2. Auto-append active parameters not explicitly referenced in args_template
    for param in params_defs {
        if explicitly_referenced_params.contains(&param.id) {
            continue;
        }

        let is_bool = param.param_type == "boolean"
            || param.param_type == "bool"
            || param.default.is_boolean();

        let val = param_values.get(&param.id).unwrap_or(&param.default);

        if is_bool {
            let is_true = if let Some(b) = val.as_bool() {
                b
            } else if let Some(s) = val.as_str() {
                s.eq_ignore_ascii_case("true") || s == "1"
            } else if let Some(n) = val.as_i64() {
                n == 1
            } else {
                false
            };

            if is_true {
                if let Some(ref flag) = param.cli_flag {
                    final_args.push(flag.clone());
                } else {
                    final_args.push(format!("--{}", param.id));
                }
            }
        } else if let Some(ref flag) = param.cli_flag {
            // Non-boolean parameter with CLI flag
            if !val.is_null() {
                let val_str = if let Some(s) = val.as_str() {
                    s.trim().to_string()
                } else if let Some(n) = val.as_f64() {
                    n.to_string()
                } else {
                    "".to_string()
                };

                if !val_str.is_empty() {
                    final_args.push(flag.clone());
                    final_args.push(val_str);
                }
            }
        }
    }

    // 3. Auto-append required databases not explicitly referenced in args_template
    for db in databases {
        if explicitly_referenced_dbs.contains(&db.name) {
            continue;
        }

        if let Some(ref flag) = db.cli_flag
            && final_args.contains(flag)
        {
            continue;
        }

        if requires_databases.contains(&db.name)
            && let Some(ref flag) = db.cli_flag
                && let Some(path) = get_db_path(&db.destination_subpath) {
                    final_args.push(flag.clone());
                    final_args.push(path.to_string_lossy().to_string());
                }
    }

    Ok(final_args)
}

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

        // 1. Resolve input files and directories into placeholders
        let mut placeholders = HashMap::new();
        placeholders.insert(
            "work_dir".to_string(),
            work_dir.to_string_lossy().to_string(),
        );
        placeholders.insert(
            "output_dir".to_string(),
            work_dir.to_string_lossy().to_string(),
        );

        for (port_id, val) in inputs {
            if let Some(s) = val.as_str() {
                placeholders.insert(port_id.clone(), s.to_string());
            } else if let Some(arr) = val.get("files").and_then(|f| f.as_array()) {
                let file_list = arr
                    .iter()
                    .filter_map(|v| v.as_str().map(String::from))
                    .collect::<Vec<String>>()
                    .join("\t");
                placeholders.insert(port_id.clone(), file_list);
            } else if let Some(obj) = val.as_object()
                && let Some(wd) = obj.get("work_dir").and_then(|v| v.as_str()) {
                    placeholders.insert(port_id.clone(), wd.to_string());
                }
        }

        // Default input_files resolution
        if !placeholders.contains_key("input_files")
            && let Some(first_in) = inputs.values().next() {
                if let Some(s) = first_in.as_str() {
                    placeholders.insert("input_files".to_string(), s.to_string());
                } else if let Some(arr) = first_in.get("files").and_then(|f| f.as_array()) {
                    let first_file = arr.first().and_then(|v| v.as_str()).unwrap_or("");
                    placeholders.insert("input_files".to_string(), first_file.to_string());
                }
            }

        // 2. Build execution strategy
        let execution_strategy = manifest
            .get_execution_for_node(&node.id, &node.title)
            .cloned()
            .unwrap_or_else(|| ExecutionStrategy::Binary {
                executable_name: manifest.primary_executable_name().to_string(),
                args_template: vec![
                    ArgElement::Literal("{input_files}".to_string()),
                    ArgElement::Literal("-o".to_string()),
                    ArgElement::Literal("{work_dir}".to_string()),
                ],
                requires_databases: vec![],
            });

        let (executable_name, args_template, requires_dbs) = match &execution_strategy {
            ExecutionStrategy::Binary {
                executable_name,
                args_template,
                requires_databases,
            } => (executable_name.clone(), args_template.clone(), requires_databases.clone()),
            ExecutionStrategy::PythonModule {
                module_name,
                args_template,
                requires_databases,
            } => {
                let mut full_args = vec![ArgElement::Literal("-m".to_string()), ArgElement::Literal(module_name.clone())];
                full_args.extend(args_template.clone());
                ("python".to_string(), full_args, requires_databases.clone())
            }
        };

        let node_params_defs: Vec<ParameterDef> = if let Some(n_def) = node_def {
            n_def.params.iter().chain(manifest.params.iter()).cloned().collect()
        } else {
            manifest.params.clone()
        };

        let get_db_path = |subpath: &str| -> Option<PathBuf> {
            let path = self.env_mgr.get_database_path(subpath);
            if path.exists() {
                Some(path)
            } else {
                None
            }
        };

        let final_args = build_argv(
            &args_template,
            &node_params_defs,
            &node.params,
            &manifest.databases,
            &requires_dbs,
            get_db_path,
            &placeholders,
        )?;

        let cmd_msg = format!("Invoking: {} {}", executable_name, final_args.join(" "));
        logs.push(cmd_msg.clone());
        let _ = event_tx
            .send(WorkflowStreamEvent::Log {
                node_id: node.id.clone(),
                line: cmd_msg,
            })
            .await;

        // 3. Spawn subprocess command with piped stdout/stderr
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

        let output_ports_defs = if let Some(n_def) = node_def {
            n_def.outputs.clone()
        } else {
            manifest.outputs.clone()
        };

        let mut outputs = HashMap::new();
        for out_port in output_ports_defs {
            if let Some(val) = collected_artifacts.get(&out_port.id) {
                outputs.insert(out_port.id.clone(), val.clone());
            } else {
                outputs.insert(out_port.id.clone(), serde_json::json!(work_dir.to_string_lossy()));
            }
        }
        outputs.insert("work_dir".to_string(), serde_json::json!(work_dir.to_string_lossy()));

        Ok(outputs)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_build_argv_boolean_injection_and_database_scoping() {
        let args_template = vec![
            ArgElement::Literal("-ifa".to_string()),
            ArgElement::Literal("{input_files}".to_string()),
            ArgElement::Literal("-o".to_string()),
            ArgElement::Literal("{work_dir}".to_string()),
            ArgElement::Literal("-t".to_string()),
            ArgElement::Literal("{threshold}".to_string()),
        ];

        let params_defs = vec![
            ParameterDef {
                id: "threshold".to_string(),
                name: "Threshold".to_string(),
                param_type: "number".to_string(),
                default: serde_json::json!(0.9),
                min: None,
                max: None,
                step: None,
                options: vec![],
                cli_flag: None,
                required: None,
                show: None,
                description: "".to_string(),
                input_id: None,
                multiple: None,
            },
            ParameterDef {
                id: "acquired".to_string(),
                name: "Scan Acquired".to_string(),
                param_type: "boolean".to_string(),
                default: serde_json::json!(true),
                min: None,
                max: None,
                step: None,
                options: vec![],
                cli_flag: Some("-acq".to_string()),
                required: None,
                show: None,
                description: "".to_string(),
                input_id: None,
                multiple: None,
            },
            ParameterDef {
                id: "point".to_string(),
                name: "Scan Point".to_string(),
                param_type: "boolean".to_string(),
                default: serde_json::json!(false),
                min: None,
                max: None,
                step: None,
                options: vec![],
                cli_flag: Some("-c".to_string()),
                required: None,
                show: None,
                description: "".to_string(),
                input_id: None,
                multiple: None,
            },
        ];

        let databases = vec![
            DatabaseRequirement {
                name: "resfinder_db".to_string(),
                download_url: "".to_string(),
                is_git: false,
                destination_subpath: "db/resfinder".to_string(),
                cli_flag: Some("-db_res".to_string()),
                env_var_name: None,
                post_install_command: None,
            },
            DatabaseRequirement {
                name: "pointfinder_db".to_string(),
                download_url: "".to_string(),
                is_git: false,
                destination_subpath: "db/pointfinder".to_string(),
                cli_flag: Some("-db_point".to_string()),
                env_var_name: None,
                post_install_command: None,
            },
        ];

        let mut placeholders = HashMap::new();
        placeholders.insert("input_files".to_string(), "/data/sample.fasta".to_string());
        placeholders.insert("work_dir".to_string(), "/tmp/run1".to_string());

        let get_db = |subpath: &str| -> Option<PathBuf> {
            Some(PathBuf::from("/mock/databases").join(subpath))
        };

        // Scenario 1: acquired=true, point=false, requires resfinder_db only
        let param_vals_1 = serde_json::json!({
            "threshold": 0.95,
            "acquired": true,
            "point": false,
        });

        let argv_1 = build_argv(
            &args_template,
            &params_defs,
            &param_vals_1,
            &databases,
            &["resfinder_db".to_string()],
            get_db,
            &placeholders,
        )
        .expect("template should be valid");

        assert_eq!(
            argv_1,
            vec![
                "-ifa", "/data/sample.fasta",
                "-o", "/tmp/run1",
                "-t", "0.95",
                "-acq",
                "-db_res", "/mock/databases/db/resfinder"
            ]
        );
        // Note: -c and -db_point must NOT be present!
        assert!(!argv_1.contains(&"-c".to_string()));
        assert!(!argv_1.contains(&"-db_point".to_string()));

        // Scenario 2: point=true, requires both databases
        let param_vals_2 = serde_json::json!({
            "threshold": 0.90,
            "acquired": true,
            "point": true,
        });

        let argv_2 = build_argv(
            &args_template,
            &params_defs,
            &param_vals_2,
            &databases,
            &["resfinder_db".to_string(), "pointfinder_db".to_string()],
            get_db,
            &placeholders,
        )
        .expect("template should be valid");

        assert!(argv_2.contains(&"-acq".to_string()));
        assert!(argv_2.contains(&"-c".to_string()));
        assert!(argv_2.contains(&"-db_res".to_string()));
        assert!(argv_2.contains(&"-db_point".to_string()));

        // Scenario 3: Explicit placeholder in template is not double-injected
        let template_with_acq = vec![
            ArgElement::Literal("-ifa".to_string()),
            ArgElement::Literal("{input_files}".to_string()),
            ArgElement::Literal("{acquired}".to_string()),
        ];
        let argv_3 = build_argv(
            &template_with_acq,
            &params_defs,
            &param_vals_2,
            &databases,
            &[],
            get_db,
            &placeholders,
        )
        .expect("template should be valid");
        let acq_count = argv_3.iter().filter(|&a| a == "-acq").count();
        assert_eq!(acq_count, 1, "-acq must not be double injected");
    }

    #[test]
    fn test_build_argv_conditional_flag_single_vs_multiple() {
        // Conditional: single file → "-ifa", multiple files → "-ifq"
        let args_template = vec![
            ArgElement::Conditional {
                single: "-ifa".to_string(),
                multiple: "-ifq".to_string(),
                placeholder: "input_files".to_string(),
            },
            ArgElement::Literal("-o".to_string()),
            ArgElement::Literal("{work_dir}".to_string()),
        ];

        let params_defs = vec![];
        let param_values = serde_json::json!({});
        let databases = vec![];

        let get_db = |_: &str| -> Option<PathBuf> { None };

        // Single file → should use "-ifa"
        let mut ph_single = HashMap::new();
        ph_single.insert("input_files".to_string(), "/data/genome.fna".to_string());
        ph_single.insert("work_dir".to_string(), "/tmp/out".to_string());

        let argv_single = build_argv(
            &args_template, &params_defs, &param_values, &databases, &[], get_db, &ph_single,
        ).unwrap();
        assert_eq!(argv_single, vec!["-ifa", "/data/genome.fna", "-o", "/tmp/out"]);

        // Multiple files (tab-separated) → should use "-ifq"
        let mut ph_multi = HashMap::new();
        ph_multi.insert("input_files".to_string(), "/data/r1.fastq\t/data/r2.fastq".to_string());
        ph_multi.insert("work_dir".to_string(), "/tmp/out".to_string());

        let argv_multi = build_argv(
            &args_template, &params_defs, &param_values, &databases, &[], get_db, &ph_multi,
        ).unwrap();
        assert_eq!(argv_multi, vec!["-ifq", "/data/r1.fastq", "/data/r2.fastq", "-o", "/tmp/out"]);
    }
}
