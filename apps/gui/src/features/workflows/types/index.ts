export type SocketType =
  | "sequence_folder"
  | "fasta_file"
  | "fastq_pair"
  | "resfinder_report"
  | "tabular_report"
  | "any"

export interface WorkflowPort {
  id: string
  name: string
  socket_type: SocketType
  direction: "input" | "output"
}

export type NodeExecutionStatus = "idle" | "installing" | "running" | "completed" | "failed"

import type { ToolManifest } from "@/features/extensions/types"

export interface WorkflowNodeData extends Record<string, unknown> {
  label?: string
  title: string
  category: string
  kind: "folder_input" | "resfinder" | "output_save" | "tool" | string
  tool_id?: string
  manifest?: ToolManifest
  nodeIndex?: number
  status: NodeExecutionStatus
  inputs: WorkflowPort[]
  outputs: WorkflowPort[]
  params: Record<string, any>
  onParamChange?: (key: string, value: any) => void
  onDelete?: () => void
}

export interface WorkflowGraphDto {
  nodes: {
    id: string
    kind: { type: string; tool_id?: string }
    title: string
    inputs: WorkflowPort[]
    outputs: WorkflowPort[]
    params: Record<string, any>
    position: [number, number]
  }[]
  edges: {
    id: string
    source_node: string
    source_port: string
    target_node: string
    target_port: string
  }[]
}

export interface NodeExecutionReport {
  node_id: string
  status: string
  duration_ms: number
  outputs: Record<string, any>
  logs: string[]
}

export interface WorkflowExecutionReport {
  run_id: string
  is_success: boolean
  node_reports: NodeExecutionReport[]
  total_duration_ms: number
}
