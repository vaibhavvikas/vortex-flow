import * as React from "react"
import { Position } from "@xyflow/react"
import { Info, CircleHelp, Trash2, Loader2, Check, AlertCircle } from "lucide-react"
import { BaseNode } from "@/components/ui/base-node"
import { BaseHandle } from "@/components/ui/base-handle"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import type { WorkflowNodeData, WorkflowPort } from "../../types"

export function getSocketColor(socketType: string, fallbackIndex: number = 0): string {
  switch (socketType) {
    case "sequence_folder":
      return "#8b5cf6" // Violet
    case "fasta_file":
      return "#f97316" // Orange
    case "fastq_pair":
      return "#ec4899" // Pink
    case "resfinder_output_folder":
    case "resfinder_report":
      return "#10b981" // Emerald
    case "amr_gene_table":
      return "#f43f5e" // Rose
    case "point_mutation_table":
      return "#f59e0b" // Amber
    case "phenotype_table":
      return "#06b6d4" // Cyan
    case "tsv_file":
    case "tabular_report":
      return "#0ea5e9" // Sky
    case "html_report":
      return "#6366f1" // Indigo
    case "json_data":
      return "#14b8a6" // Teal
    case "any":
      return "#3b82f6" // Blue
    default: {
      const palette = ["#8b5cf6", "#f97316", "#ec4899", "#10b981", "#06b6d4", "#3b82f6", "#eab308", "#14b8a6"]
      return palette[fallbackIndex % palette.length]
    }
  }
}

interface GenericNodeCardProps {
  data: WorkflowNodeData
  icon: React.ComponentType<{ className?: string }>
  title: string
  description?: string
  selected?: boolean
  className?: string
  children?: React.ReactNode
  inputs?: WorkflowPort[]
  outputs?: WorkflowPort[]
  onRun?: () => void
  onDelete?: () => void
}

export function GenericNodeCard({
  data,
  icon: Icon,
  title,
  description,
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

  return (
    <BaseNode
      selected={selected}
      className={cn(
        "w-80 generic-node-div group/node relative rounded-xl border bg-card shadow-sm transition-all duration-200 select-none",
        isInvalid && "border-destructive ring-2 ring-destructive/50 shadow-[0_0_20px_rgba(239,68,68,0.25)]",
        isRunning && "border-primary/80 ring-2 ring-primary/25 shadow-[0_0_20px_rgba(59,130,246,0.15)]",
        isCompleted && "border-emerald-500/50 shadow-emerald-500/10",
        isFailed && "border-destructive ring-1 ring-destructive/40 shadow-[0_0_20px_rgba(239,68,68,0.15)]",
        !isRunning && !isCompleted && !isFailed && !isInvalid && "border-border hover:shadow-md",
        className
      )}
    >
      {/* 1. Header (Title, CircleHelp Tooltip, Status Indicator/Delete) */}
      <div className="flex w-full items-center justify-between gap-2 px-4 py-2.5 border-b border-border/80">
        <div className="flex items-center gap-2 overflow-hidden min-w-0">
          <Icon
            className={cn(
              "size-4 shrink-0 transition-colors",
              isInvalid
                ? "text-destructive"
                : isRunning
                ? "text-primary"
                : isCompleted
                ? "text-emerald-500"
                : isFailed
                ? "text-destructive"
                : "text-foreground/80"
            )}
          />
          <span className="text-xs font-semibold truncate text-foreground tracking-tight">
            {title}
          </span>

          {description && (
            <Tooltip>
              <TooltipTrigger
                render={
                  <button
                    type="button"
                    className="inline-flex size-4 items-center justify-center text-muted-foreground/60 hover:text-foreground transition-colors cursor-help shrink-0 nodrag"
                  >
                    <CircleHelp className="size-3.5" />
                  </button>
                }
              />
              <TooltipContent side="top" className="max-w-xs text-xs font-normal leading-relaxed">
                {description}
              </TooltipContent>
            </Tooltip>
          )}
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {isInvalid && (
            <Tooltip>
              <TooltipTrigger
                render={
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-medium text-destructive bg-destructive/10 border border-destructive/30 cursor-help nodrag">
                    <AlertCircle className="size-2.5" />
                    Fix Settings
                  </span>
                }
              />
              <TooltipContent side="top" align="end" className="max-w-xs text-xs font-normal leading-relaxed">
                {validationError || "At least one required configuration or input connection is missing."}
              </TooltipContent>
            </Tooltip>
          )}

          {isRunning && (
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-medium bg-primary/10 text-primary border border-primary/20">
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

          {handleDelete && (
            <button
              type="button"
              onClick={handleDelete}
              title="Delete Node (Backspace/Del)"
              className="size-6 rounded-md flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors cursor-pointer nodrag"
            >
              <Trash2 className="size-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* 2. Top Sockets Section (ComfyUI-Style: Inputs Left, Outputs Right) */}
      {hasSockets && (
        <div className="flex flex-col py-1.5 border-b border-border/60 bg-muted/20">
          {/* Render Input Sockets */}
          {inputs.map((inPort, idx) => {
            const color = getSocketColor(inPort.socket_type, idx)

            return (
              <div
                key={`in_${inPort.id}`}
                className="relative flex h-8 w-full items-center justify-start px-4 text-xs"
              >
                {/* Left Border Handle (50% in, 50% out) */}
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <BaseHandle
                        type="target"
                        position={Position.Left}
                        id={inPort.id}
                        color={color}
                        title={`${inPort.name} • ${inPort.socket_type} (Input)`}
                      />
                    }
                  />
                  <TooltipContent side="left" className="text-xs">
                    <div className="flex flex-col gap-0.5">
                      <span className="font-semibold">{inPort.name}</span>
                      <span className="text-[10px] text-muted-foreground font-mono">
                        Type: {inPort.socket_type} (Input)
                      </span>
                    </div>
                  </TooltipContent>
                </Tooltip>

                <div className="flex items-center gap-1.5 pl-1 text-foreground/90 font-medium truncate">
                  <span>{inPort.name}</span>
                </div>
              </div>
            )
          })}

          {/* Render Output Sockets */}
          {outputs.map((outPort, idx) => {
            const color = getSocketColor(outPort.socket_type, idx + 2)

            return (
              <div
                key={`out_${outPort.id}`}
                className="relative flex h-8 w-full items-center justify-end px-4 text-xs"
              >
                <div className="flex items-center gap-1.5 pr-1 text-foreground/90 font-medium truncate">
                  <span>{outPort.name}</span>
                </div>

                {/* Right Border Handle (50% in, 50% out) */}
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <BaseHandle
                        type="source"
                        position={Position.Right}
                        id={outPort.id}
                        color={color}
                        title={`${outPort.name} • ${outPort.socket_type} (Output)`}
                      />
                    }
                  />
                  <TooltipContent side="right" className="text-xs">
                    <div className="flex flex-col gap-0.5">
                      <span className="font-semibold">{outPort.name}</span>
                      <span className="text-[10px] text-muted-foreground font-mono">
                        Type: {outPort.socket_type} (Output)
                      </span>
                    </div>
                  </TooltipContent>
                </Tooltip>
              </div>
            )
          })}
        </div>
      )}

      {/* 3. Parameters / Controls Section */}
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

export function GenericInputField({
  label,
  required,
  description,
  children,
}: GenericInputFieldProps) {
  return (
    <div className="relative flex w-full flex-col gap-1.5 px-4 py-1.5">
      {/* Top Label Row */}
      <div className="flex w-full items-center justify-between text-sm">
        <div className="flex items-center gap-1.5 truncate">
          <span className="text-xs font-semibold text-foreground/90 leading-none">
            {label}
          </span>
          {required && <span className="text-destructive text-xs leading-none font-bold">*</span>}
          {description && (
            <Tooltip>
              <TooltipTrigger
                render={
                  <Info className="size-3 text-muted-foreground/60 hover:text-foreground cursor-help" />
                }
              />
              <TooltipContent className="text-xs max-w-xs">{description}</TooltipContent>
            </Tooltip>
          )}
        </div>
      </div>

      {/* Input container */}
      {children && <div className="w-full">{children}</div>}
    </div>
  )
}
