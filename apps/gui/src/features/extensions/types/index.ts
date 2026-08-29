import type { WorkflowPort } from "../../workflows/types"

export type NodeType = "executor" | "parser" | "transformer" | "viewer"

export interface ParameterDef {
  id: string
  name: string
  type: "number" | "string" | "select" | "boolean"
  default?: any
  min?: number
  max?: number
  step?: number
  options?: string[]
  cli_flag?: string
  required?: boolean
  description?: string
}

export interface DatabaseRequirement {
  name: string
  download_url: string
  is_git: boolean
  destination_subpath: string
  cli_flag?: string
  env_var_name?: string
}

export interface OutputArtifactSpec {
  id: string
  file_pattern: string
  label: string
  format: "tsv" | "json" | "html" | "fasta"
}

export interface NodeDefinition {
  id: string
  name: string
  node_type?: NodeType
  description?: string
  icon?: string
  execution?: {
    type: "binary" | "python_module"
    executable_name: string
    args_template: string[]
  }
  inputs?: WorkflowPort[]
  outputs?: WorkflowPort[]
  params?: ParameterDef[]
  output_artifacts?: OutputArtifactSpec[]
}

export interface ToolManifest {
  id: string
  name: string
  version: string
  category: string
  description: string
  install: {
    type: "rattler" | "conda" | "pip" | "binary_archive"
    packages?: string[]
    channels?: string[]
  }
  databases?: DatabaseRequirement[]
  nodes?: NodeDefinition[]
  execution?: {
    type: "binary" | "python_module"
    executable_name: string
    args_template: string[]
  }
  inputs?: WorkflowPort[]
  outputs?: WorkflowPort[]
  params?: ParameterDef[]
  output_artifacts?: OutputArtifactSpec[]
}

export interface ExtensionItem {
  manifest: ToolManifest
  isInstalled: boolean
  isInstalling?: boolean
  databaseStatus?: "ready" | "missing" | "downloading"
}
