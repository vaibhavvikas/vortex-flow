import * as React from "react"
import { Terminal, ChevronUp, ChevronDown, Copy, Check, AlertCircle, CheckCircle2, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import type { RunWorkflowResponse } from "../services/workflow-service"

interface WorkflowExecutionDrawerProps {
  isOpen: boolean
  onToggle: () => void
  isRunning: boolean
  runResult: RunWorkflowResponse | null
  liveLogs?: { node_id: string; line: string }[]
}

export function WorkflowExecutionDrawer({
  isOpen,
  onToggle,
  isRunning,
  runResult,
  liveLogs = [],
}: WorkflowExecutionDrawerProps) {
  const [isExpanded, setIsExpanded] = React.useState(false)
  const [hasCopied, setHasCopied] = React.useState(false)
  const logContainerRef = React.useRef<HTMLDivElement>(null)

  // Use live streaming logs if present; otherwise fall back to run report
  const logs = React.useMemo(() => {
    if (liveLogs && liveLogs.length > 0) {
      return liveLogs
    }
    if (!runResult?.report?.node_reports) return []
    const allLogs: { node_id: string; line: string }[] = []
    for (const nr of runResult.report.node_reports) {
      for (const log of nr.logs) {
        allLogs.push({ node_id: nr.node_id, line: log })
      }
    }
    return allLogs
  }, [liveLogs, runResult])

  // Auto-scroll on new logs
  React.useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight
    }
  }, [logs.length, isRunning])

  const handleCopyLogs = () => {
    const text = logs.map((l) => `[${l.node_id}] ${l.line}`).join("\n")
    navigator.clipboard.writeText(text)
    setHasCopied(true)
    setTimeout(() => setHasCopied(false), 2000)
    toast.success("Execution logs copied to clipboard")
  }

  const heightClass = isExpanded ? "h-96" : "h-56"

  return (
    <div
      className={cn(
        "absolute bottom-0 left-0 right-0 z-30 transition-all duration-300 ease-in-out bg-zinc-950/95 text-zinc-100 border-t border-zinc-800 shadow-2xl flex flex-col font-mono",
        heightClass,
        isOpen
          ? "translate-y-0 opacity-100 pointer-events-auto"
          : "translate-y-full opacity-0 pointer-events-none"
      )}
    >
      {/* Console Header Bar */}
      <div className="h-9 px-4 border-b border-zinc-800/80 bg-zinc-900/90 flex items-center justify-between shrink-0 select-none">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 text-xs text-zinc-300 font-semibold">
            <Terminal className="size-3.5 text-primary" />
            <span>Workflow Execution Logs</span>
          </div>

          {isRunning ? (
            <Badge variant="outline" className="bg-primary/20 text-primary border-primary/30 text-[10px] gap-1 py-0 px-2">
              <Loader2 className="size-2.5 animate-spin" />
              <span>Running...</span>
            </Badge>
          ) : runResult ? (
            runResult.success ? (
              <Badge variant="outline" className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 text-[10px] gap-1 py-0 px-2">
                <CheckCircle2 className="size-2.5" />
                <span>Success ({runResult.report?.total_duration_ms ?? 0}ms)</span>
              </Badge>
            ) : (
              <Badge variant="outline" className="bg-destructive/20 text-destructive border-destructive/30 text-[10px] gap-1 py-0 px-2">
                <AlertCircle className="size-2.5" />
                <span>Failed</span>
              </Badge>
            )
          ) : (
            <Badge variant="outline" className="bg-zinc-800 text-zinc-400 border-zinc-700 text-[10px] py-0 px-2">
              Idle
            </Badge>
          )}
        </div>

        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleCopyLogs}
            disabled={logs.length === 0}
            className="h-6 px-2 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 text-[11px] gap-1 cursor-pointer"
            title="Copy Logs"
          >
            {hasCopied ? <Check className="size-3 text-emerald-400" /> : <Copy className="size-3" />}
            <span>{hasCopied ? "Copied" : "Copy"}</span>
          </Button>

          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsExpanded(!isExpanded)}
            className="size-6 p-0 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 cursor-pointer"
            title={isExpanded ? "Collapse" : "Expand"}
          >
            {isExpanded ? <ChevronDown className="size-3.5" /> : <ChevronUp className="size-3.5" />}
          </Button>

          <Button
            variant="ghost"
            size="sm"
            onClick={onToggle}
            className="size-6 p-0 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 cursor-pointer text-xs"
            title="Close Console"
          >
            ✕
          </Button>
        </div>
      </div>

      {/* Log Output Area */}
      <div
        ref={logContainerRef}
        className="flex-1 overflow-y-auto p-3 text-xs space-y-1 select-text bg-black/40"
      >
        {logs.length === 0 ? (
          <div className="h-full flex items-center justify-center text-zinc-500 text-xs italic select-none">
            {isRunning ? "Streaming live execution stdout/stderr..." : "Run a pipeline to view execution logs..."}
          </div>
        ) : (
          logs.map((entry, idx) => {
            const isError =
              entry.line.toLowerCase().includes("error") ||
              entry.line.toLowerCase().includes("failed") ||
              entry.line.includes("[stderr]")
            const isSuccess =
              entry.line.toLowerCase().includes("completed successfully") ||
              entry.line.toLowerCase().includes("verified at") ||
              entry.line.toLowerCase().includes("exported artifact")

            return (
              <div
                key={idx}
                className={`leading-relaxed break-all ${
                  isError
                    ? "text-red-400 font-medium"
                    : isSuccess
                    ? "text-emerald-400 font-medium"
                    : "text-zinc-300"
                }`}
              >
                <span className="text-zinc-600 select-none mr-2 font-mono text-[10px]">
                  {String(idx + 1).padStart(2, "0")}
                </span>
                <span className="text-zinc-500 select-none font-semibold mr-1.5">
                  [{entry.node_id}]
                </span>
                <span>{entry.line}</span>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
