import { apiFetch } from "@/lib/api-client"
import { getApiConfig } from "@/lib/api-config"
import type { WorkflowGraphDto, WorkflowExecutionReport } from "../types"

export interface ValidateWorkflowResponse {
  is_valid: boolean
  execution_order?: string[]
  error?: string
  error_type?: "cycle" | "socket_mismatch" | "validation_error"
}

export interface RunWorkflowResponse {
  success: boolean
  report?: WorkflowExecutionReport
  error?: string
  error_type?: string
}

export type WorkflowStreamEvent =
  | { type: "workflow_start"; run_id: string }
  | { type: "node_start"; node_id: string; title: string }
  | { type: "log"; node_id: string; line: string }
  | { type: "node_complete"; node_id: string; duration_ms: number; outputs: Record<string, any> }
  | { type: "node_error"; node_id: string; error: string }
  | {
      type: "workflow_complete"
      run_id: string
      is_success: boolean
      total_duration_ms: number
      report: WorkflowExecutionReport
    }
  | { type: "workflow_error"; error: string }

export const workflowService = {
  async getResFinderTemplate(): Promise<WorkflowGraphDto> {
    return apiFetch<WorkflowGraphDto>("/api/workflow/templates/resfinder")
  },

  async validateWorkflow(graph: WorkflowGraphDto): Promise<ValidateWorkflowResponse> {
    try {
      return await apiFetch<ValidateWorkflowResponse>("/api/workflow/validate", {
        method: "POST",
        body: JSON.stringify(graph),
      })
    } catch (err: any) {
      return {
        is_valid: false,
        error: err.message || "Validation failed",
        error_type: "validation_error",
      }
    }
  },

  async runWorkflow(graph: WorkflowGraphDto): Promise<RunWorkflowResponse> {
    try {
      return await apiFetch<RunWorkflowResponse>("/api/workflow/run", {
        method: "POST",
        body: JSON.stringify(graph),
      })
    } catch (err: any) {
      return {
        success: false,
        error: err.message || "Execution failed",
        error_type: "execution_error",
      }
    }
  },

  /**
   * Streams workflow execution events and live logs line-by-line via SSE
   */
  async runWorkflowStream(
    graph: WorkflowGraphDto,
    onEvent: (event: WorkflowStreamEvent) => void,
    signal?: AbortSignal
  ): Promise<void> {
    const { baseUrl, token } = await getApiConfig()
    const url = new URL("/api/workflow/stream", baseUrl)

    const response = await fetch(url, {
      method: "POST",
      signal,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(graph),
    })

    if (!response.ok || !response.body) {
      throw new Error(`Streaming failed: HTTP ${response.status} ${response.statusText}`)
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder("utf-8")
    let buffer = ""

    try {
      while (true) {
        const { value, done } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const blocks = buffer.split("\n\n")
        buffer = blocks.pop() || ""

        for (const block of blocks) {
          const trimmed = block.trim()
          if (!trimmed) continue

          // Handle SSE 'data: ...' prefix
          const lines = trimmed.split("\n")
          for (const line of lines) {
            if (line.startsWith("data:")) {
              const jsonStr = line.replace(/^data:\s*/, "").trim()
              if (jsonStr) {
                try {
                  const event: WorkflowStreamEvent = JSON.parse(jsonStr)
                  onEvent(event)
                } catch (e) {
                  console.error("Failed to parse SSE JSON chunk:", e, jsonStr)
                }
              }
            }
          }
        }
      }
    } finally {
      try {
        await reader.cancel()
      } catch {
        // Stream cancelled or completed
      }
    }
  },

  async pickFolder(): Promise<string | null> {
    try {
      const res = await apiFetch<{ selected: boolean; path?: string; error?: string }>(
        "/api/workflow/pick-folder",
        { method: "POST" }
      )
      if (res.selected && res.path) {
        return res.path
      }
      return null
    } catch (e) {
      console.error("Failed to pick folder:", e)
      return null
    }
  },
}
