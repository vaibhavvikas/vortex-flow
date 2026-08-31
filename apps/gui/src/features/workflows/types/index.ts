import type { ToolManifest, NodeDefinition } from "@/features/extensions/types"

export type SocketKind = "file" | "folder"

export type SocketType =
  | {
      kind: "folder"
      schema?: string
    }
  | {
      kind: "file"
      format: string
      schema?: string
    }

export interface SocketMatcher {
  kind?: SocketKind
  format?: string
  schema?: string
}

export interface InputPort {
  id: string
  name: string
  accepted_types: SocketMatcher[]
  direction?: "input"
}

export interface OutputPort {
  id: string
  name: string
  socket_type: SocketType
  direction?: "output"
}

export type WorkflowPort = InputPort | OutputPort

export interface ValidationRule {
  rule: "require_at_least_one" | string
  params: string[]
  error_message: string
}

export type NodeExecutionStatus = "idle" | "installing" | "running" | "completed" | "failed"

export interface WorkflowNodeData extends Record<string, unknown> {
  label?: string
  title: string
  category: string
  kind: "folder_input" | "resfinder" | "output_save" | "tool" | string
  tool_id?: string
  node_id?: string
  node_type?: "executor" | "parser" | "transformer" | "viewer"
  manifest?: ToolManifest
  nodeDef?: NodeDefinition
  nodeIndex?: number
  status: NodeExecutionStatus
  inputs: InputPort[]
  outputs: OutputPort[]
  params: Record<string, any>
  visible_params?: string[]
  results?: Record<string, any>
  plugin_version?: string
  onParamChange?: (key: string, value: any) => void
  onDelete?: () => void
}

export interface WorkflowGraphDto {
  nodes: {
    id: string
    kind: { type: string; tool_id?: string }
    title: string
    inputs: InputPort[]
    outputs: OutputPort[]
    params: Record<string, any>
    position: [number, number]
    plugin_version?: string
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
  is_valid?: boolean
  total_duration_ms?: number
  node_reports?: NodeExecutionReport[]
  outputs?: Record<string, any>
}

export function isInputPort(port: WorkflowPort): port is InputPort {
  return "accepted_types" in port
}

export function isOutputPort(port: WorkflowPort): port is OutputPort {
  return "socket_type" in port
}

export function matchSocket(matcher: SocketMatcher, producer: SocketType): boolean {
  if (matcher.kind && matcher.kind !== producer.kind) {
    return false
  }

  if (matcher.format) {
    if (producer.kind !== "file" || producer.format !== matcher.format) {
      return false
    }
  }

  if (matcher.schema) {
    if (producer.schema !== matcher.schema) {
      return false
    }
  }

  return true
}

export function canConnectPorts(output: OutputPort, input: InputPort): boolean {
  if (!input.accepted_types || input.accepted_types.length === 0) {
    return true
  }
  return input.accepted_types.some((matcher) => matchSocket(matcher, output.socket_type))
}
