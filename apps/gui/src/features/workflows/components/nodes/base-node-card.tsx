import * as React from "react"
import { Position } from "@xyflow/react"
import {
  Info,
  Trash2,
  MoreHorizontal,
  Copy,
  Loader2,
  Check,
  AlertCircle,
  SlidersHorizontal,
  FileJson,
  Layers,
} from "lucide-react"
import { BaseNode } from "@/components/ui/base-node"
import { BaseHandle } from "@/components/ui/base-handle"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"
import { useWorkflowStore } from "../../stores/workflow-store"
import type { InputPort, OutputPort, SocketMatcher, SocketType, WorkflowNodeData } from "../../types"

// ---------------------------------------------------------------------------
// Performance: string → color lookup as a module-level Map (O(1) hash)
// instead of a 20-case switch executed inside every render of every socket.
// ---------------------------------------------------------------------------
const STRING_TYPE_COLORS = new Map<string, string>([
  ["sequence_folder",        "#8b5cf6"], // Violet
  ["fasta_file",             "#f97316"], // Orange
  ["fasta",                  "#f97316"],
  ["fastq_pair",             "#ec4899"], // Pink
  ["fastq",                  "#ec4899"],
  ["resfinder_output_folder","#10b981"], // Emerald
  ["resfinder_report",       "#10b981"],
  ["amr_gene_table",         "#f43f5e"], // Rose
  ["amr_genes",              "#f43f5e"],
  ["point_mutation_table",   "#f59e0b"], // Amber
  ["point_mutations",        "#f59e0b"],
  ["phenotype_table",        "#06b6d4"], // Cyan
  ["phenotype_profile",      "#06b6d4"],
  ["tsv_file",               "#0ea5e9"], // Sky
  ["tsv",                    "#0ea5e9"],
  ["tabular_report",         "#0ea5e9"],
  ["csv",                    "#06b6d4"], // Cyan
  ["xlsx",                   "#10b981"], // Emerald
  ["html_report",            "#6366f1"], // Indigo
  ["html",                   "#6366f1"],
  ["json_data",              "#14b8a6"], // Teal
  ["json",                   "#14b8a6"],
  ["any",                    "#3b82f6"], // Blue
])

const FORMAT_COLORS = new Map<string, string>([
  ["tsv",   "#0ea5e9"],
  ["csv",   "#06b6d4"],
  ["xlsx",  "#10b981"],
  ["fasta", "#f97316"],
  ["fastq", "#ec4899"],
  ["html",  "#6366f1"],
  ["json",  "#14b8a6"], // base; schema refines further
])

const JSON_SCHEMA_COLORS = new Map<string, string>([
  ["amr_genes",         "#f43f5e"],
  ["point_mutations",   "#f59e0b"],
  ["phenotype_profile", "#06b6d4"],
])

/**
 * Returns a consistent hex color for a given socket definition.
 */
export function getSocketColor(socketTypeOrMatcher?: SocketType | SocketMatcher, _fallbackIndex = 0): string {
  if (!socketTypeOrMatcher) return "#94a3b8"

  if ("format" in socketTypeOrMatcher && socketTypeOrMatcher.format) {
    const fmt = socketTypeOrMatcher.format.toLowerCase()
    if (fmt === "json" && "schema" in socketTypeOrMatcher && socketTypeOrMatcher.schema) {
      const s = socketTypeOrMatcher.schema.toLowerCase()
      const match = JSON_SCHEMA_COLORS.get(s)
      if (match) return match
    }
    const match = FORMAT_COLORS.get(fmt)
    if (match) return match
  }

  if ("schema" in socketTypeOrMatcher && socketTypeOrMatcher.schema) {
    const raw = socketTypeOrMatcher.schema.toLowerCase()
    const directMatch = STRING_TYPE_COLORS.get(raw)
    if (directMatch) return directMatch
    const lastPart = raw.split(".").pop() ?? raw
    const partMatch = STRING_TYPE_COLORS.get(lastPart)
    if (partMatch) return partMatch
  }

  if (socketTypeOrMatcher.kind) {
    const k = String(socketTypeOrMatcher.kind).toLowerCase()
    if (k === "folder") return "#8b5cf6"
    if (k === "file") return "#0ea5e9"
    if (k === "any") return "#3b82f6"
  }

  return "#94a3b8"
}

export function formatPortType(port: InputPort | OutputPort): string {
  if ("accepted_types" in port && port.accepted_types?.length) {
    const first = port.accepted_types[0]
    if (first.schema) {
      const s = first.schema.split(".").pop() || first.schema
      return s.replace(/_/g, " ").toUpperCase()
    }
    if (first.format) return first.format.toUpperCase()
    if (first.kind) return String(first.kind).toUpperCase()
  }

  if ("socket_type" in port && port.socket_type) {
    const st = port.socket_type
    if ("schema" in st && st.schema) {
      const s = st.schema.split(".").pop() || st.schema
      return s.replace(/_/g, " ").toUpperCase()
    }
    if ("format" in st && (st as any).format) return String((st as any).format).toUpperCase()
    if (st.kind) return String(st.kind).toUpperCase()
  }

  return "ANY"
}

export interface GenericNodeCardProps {
  id?: string
  title: string
  icon: React.ComponentType<{ className?: string }>
  description?: string
  data?: WorkflowNodeData
  selected?: boolean
  className?: string
  children?: React.ReactNode
  inputs?: InputPort[]
  outputs?: OutputPort[]
  onDelete?: () => void
}

export function GenericNodeCard({
  id,
  title,
  icon: Icon,
  description,
  data,
  selected = false,
  className,
  children,
  inputs = [],
  outputs = [],
  onDelete,
}: GenericNodeCardProps) {
  const handleDelete = onDelete || data?.onDelete
  const hasSockets = inputs.length > 0 || outputs.length > 0
  const status = data?.status || "idle"
  const isRunning = status === "running" || status === "installing"
  const isCompleted = status === "completed"
  const isFailed = status === "failed"
  const isInvalid = Boolean((data as any)?.isInvalid)
  const validationError = (data as any)?.validationError as string | undefined

  const nodeId = typeof id === "string" ? id : typeof data?.id === "string" ? data.id : ""
  const { inspectNodeId, setInspectNodeId, duplicateNode } = useWorkflowStore()
  const isInspectingThisNode = Boolean(nodeId && inspectNodeId === nodeId)
  const [isMenuOpen, setIsMenuOpen] = React.useState(false)

  const handleCopyId = () => {
    if (nodeId) {
      navigator.clipboard?.writeText(nodeId)
    }
  }

  const handleCopyJson = () => {
    if (data) {
      navigator.clipboard?.writeText(JSON.stringify(data, null, 2))
    }
  }

  const toolbarRef = React.useRef<HTMLDivElement>(null)

  return (
    <BaseNode
      selected={selected}
      className={cn(
        "w-80 generic-node-div group/node relative",
        isInvalid && "border-destructive",
        isRunning && "border-amber-500",
        isCompleted && "border-emerald-500",
        isFailed && "border-destructive",
        className
      )}
    >
      {/* Floating Action Toolbar (Scales with workspace zoom) */}
      {selected && (
        <div
          ref={toolbarRef}
          className={cn(
            "absolute -top-12 left-1/2 z-50 -translate-x-1/2 nodrag pointer-events-auto",
            "transform transition-all duration-150 ease-out"
          )}
        >
          <div className="flex items-center gap-1 p-1 bg-card/95 backdrop-blur-md border border-border/80 rounded-xl shadow-xl whitespace-nowrap">
            <Button
              variant={isInspectingThisNode ? "secondary" : "ghost"}
              size="sm"
              data-parameter-trigger={nodeId}
              onClick={(e) => {
                e.stopPropagation()
                nodeId && setInspectNodeId(isInspectingThisNode ? null : nodeId)
              }}
              className={cn(
                "h-7 px-2.5 text-xs font-medium gap-1.5 cursor-pointer rounded-lg",
                isInspectingThisNode
                  ? "bg-primary/20 text-primary border border-primary/30"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/80"
              )}
            >
              <SlidersHorizontal className="size-3.5" />
              <span>Parameters</span>
            </Button>

            <Button
              variant="ghost"
              size="sm"
              onClick={(e) => {
                e.stopPropagation()
                nodeId && duplicateNode(nodeId)
              }}
              className="h-7 px-2.5 text-xs font-medium gap-1.5 text-muted-foreground hover:text-foreground hover:bg-muted/80 cursor-pointer rounded-lg"
            >
              <Copy className="size-3.5" />
              <span>Duplicate</span>
            </Button>

            <DropdownMenu open={isMenuOpen} onOpenChange={setIsMenuOpen}>
              <DropdownMenuTrigger
                render={
                  <Button
                    variant={isMenuOpen ? "secondary" : "ghost"}
                    size="icon"
                    onClick={(e) => e.stopPropagation()}
                    className={cn(
                      "size-7 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/80 cursor-pointer",
                      isMenuOpen && "bg-muted text-foreground ring-1 ring-border"
                    )}
                  >
                    <MoreHorizontal className="size-3.5" />
                    <span className="sr-only">More options</span>
                  </Button>
                }
              />
              <DropdownMenuContent container={toolbarRef} align="end" className="w-44 z-50">
                <DropdownMenuGroup>
                  <DropdownMenuItem
                    onClick={handleCopyJson}
                    className="text-xs cursor-pointer"
                  >
                    <FileJson className="size-3.5 mr-2 text-muted-foreground" />
                    Copy Node JSON
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={handleCopyId}
                    className="text-xs cursor-pointer"
                  >
                    <Layers className="size-3.5 mr-2 text-muted-foreground" />
                    Copy Node ID
                  </DropdownMenuItem>
                  {handleDelete && (
                    <DropdownMenuItem
                      onClick={handleDelete}
                      className="text-xs text-destructive hover:bg-destructive/10 focus:text-destructive focus:bg-destructive/10 cursor-pointer"
                    >
                      <Trash2 className="size-3.5 mr-2" />
                      Delete Node
                    </DropdownMenuItem>
                  )}
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      )}

      {/* 1. Header (Clean Inline Title & Icon + Description) */}
      <div className="flex flex-col w-full border-b border-border/70 bg-card/50 rounded-t-xl">
        <div className="flex w-full items-center justify-between gap-2 px-3.5 py-2.5">
          <div className="flex items-center gap-2 overflow-hidden min-w-0 flex-1">
            {/* Direct Inline Icon */}
            <Icon
              className={cn(
                "size-4 shrink-0 transition-colors",
                isInvalid   ? "text-destructive" :
                isRunning   ? "text-amber-500 animate-spin" :
                isCompleted ? "text-emerald-500" :
                isFailed    ? "text-destructive" :
                              "text-primary"
              )}
            />

            <span className="text-sm font-semibold truncate text-foreground tracking-tight">
              {title}
            </span>
          </div>

          {/* Status Indicators */}
          <div className="flex items-center gap-1 shrink-0">
            {isInvalid && (
              <Tooltip>
                <TooltipTrigger
                  render={
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-medium text-destructive bg-destructive/10 border border-destructive/25 cursor-help nodrag">
                      <AlertCircle className="size-2.5" />
                      Fix
                    </span>
                  }
                />
                <TooltipContent side="top" align="end" className="max-w-xs text-xs font-normal leading-relaxed">
                  {validationError || "At least one required configuration or input connection is missing."}
                </TooltipContent>
              </Tooltip>
            )}

            {isRunning && (
              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-medium bg-amber-500/10 text-amber-500 border border-amber-500/20">
                <Loader2 className="size-2.5 animate-spin" />
                Running
              </span>
            )}

            {isCompleted && (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-medium text-emerald-500 bg-emerald-500/10 border border-emerald-500/20">
                <Check className="size-2.5" />
                Done
              </span>
            )}

            {isFailed && (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-medium text-destructive bg-destructive/10 border border-destructive/20">
                <AlertCircle className="size-2.5" />
                Error
              </span>
            )}
          </div>
        </div>

        {description && (
          <p className="text-[11px] text-muted-foreground/80 leading-relaxed line-clamp-2 px-3.5 pb-2.5 -mt-0.5 select-none">
            {description}
          </p>
        )}
      </div>

    {/* 2. Sockets (Inputs & Outputs) */}
      {hasSockets && (
        <div className="flex flex-col py-1 border-b border-border/60 bg-muted/15">
          {inputs.map((inPort, idx) => {
            const firstMatcher = inPort.accepted_types?.[0]
            const color = getSocketColor(firstMatcher, idx)
            const typeLabel = formatPortType(inPort)

            return (
              <div
                key={`in_${inPort.id}`}
                className="relative flex h-7.5 w-full items-center justify-start px-3.5 text-xs text-foreground/80 hover:bg-muted/30 transition-colors"
              >
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <BaseHandle
                        type="target"
                        position={Position.Left}
                        id={inPort.id}
                        color={color}
                      />
                    }
                  />
                  <TooltipContent side="top" sideOffset={6} className="text-xs">
                    <div className="flex flex-col gap-0.5">
                      <span className="font-semibold text-background">{inPort.name}</span>
                      <span className="text-[10px] text-background/75 font-mono">Accepts: {typeLabel} (Input)</span>
                    </div>
                  </TooltipContent>
                </Tooltip>
                <div className="flex items-center gap-1.5 pl-1 font-medium truncate">
                  <span>{inPort.name}</span>
                </div>
              </div>
            )
          })}

          {outputs.map((outPort, idx) => {
            const color = getSocketColor(outPort.socket_type, idx + 2)
            const typeLabel = formatPortType(outPort)

            return (
              <div
                key={`out_${outPort.id}`}
                className="relative flex h-7.5 w-full items-center justify-end px-3.5 text-xs text-foreground/80 hover:bg-muted/30 transition-colors"
              >
                <div className="flex items-center gap-1.5 pr-1 font-medium truncate">
                  <span>{outPort.name}</span>
                </div>
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <BaseHandle
                        type="source"
                        position={Position.Right}
                        id={outPort.id}
                        color={color}
                      />
                    }
                  />
                  <TooltipContent side="top" sideOffset={6} className="text-xs">
                    <div className="flex flex-col gap-0.5">
                      <span className="font-semibold text-background">{outPort.name}</span>
                      <span className="text-[10px] text-background/75 font-mono">Type: {typeLabel} (Output)</span>
                    </div>
                  </TooltipContent>
                </Tooltip>
              </div>
            )
          })}
        </div>
      )}

      {/* 3. Parameters / Controls */}
      {children && (
        <div className="flex flex-col py-2.5 gap-1.5">
          {children}
        </div>
      )}
    </BaseNode>
  )
}

interface GenericInputFieldProps {
  label: string
  required?: boolean
  description?: string
  children?: React.ReactNode
}

export function GenericInputField({ label, required, description, children }: GenericInputFieldProps) {
  return (
    <div className="relative flex w-full flex-col gap-1.5 px-4 py-1.5">
      <div className="flex w-full items-center justify-between text-sm">
        <div className="flex items-center gap-1.5 truncate">
          <span className="text-xs font-semibold text-foreground/90 leading-none">{label}</span>
          {required && <span className="text-destructive text-xs leading-none font-bold">*</span>}
          {description && (
            <Tooltip>
              <TooltipTrigger
                render={<Info className="size-3 text-muted-foreground/60 hover:text-foreground cursor-help" />}
              />
              <TooltipContent className="text-xs max-w-xs">{description}</TooltipContent>
            </Tooltip>
          )}
        </div>
      </div>
      {children && <div className="w-full">{children}</div>}
    </div>
  )
}
