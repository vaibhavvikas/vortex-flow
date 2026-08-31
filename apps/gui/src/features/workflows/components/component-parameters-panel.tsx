import * as React from "react"
import { X, Info } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { ScrollArea } from "@/components/ui/scroll-area"
import { useWorkflowStore } from "../stores/workflow-store"
import type { ParameterDef } from "@/features/extensions/types"

export const FOLDER_INPUT_PARAMS: ParameterDef[] = [
  {
    id: "directory_path",
    name: "Directory Path",
    type: "directory",
    required: true,
    show: true,
    description: "Local directory path containing raw sequencing files",
    default: "",
  },
  {
    id: "file_pattern",
    name: "File Match Filter",
    type: "string",
    required: true,
    show: true,
    description: "Glob filter pattern for matching files (*.fasta, *.fastq, etc.)",
    default: "*.fasta,*.fna,*.fa,*.fastq",
  },
]

export const OUTPUT_SAVE_PARAMS: ParameterDef[] = [
  {
    id: "destination_dir",
    name: "Export Path",
    type: "directory",
    required: true,
    show: true,
    description: "Local destination directory for saved pipeline outputs",
    default: "",
  },
  {
    id: "open_folder",
    name: "Open On Complete",
    type: "boolean",
    required: true,
    show: true,
    description: "Automatically open output directory upon workflow completion",
    default: true,
  },
]

export function ComponentParametersPanel() {
  const {
    nodes,
    inspectNodeId,
    setInspectNodeId,
    toggleParamVisibility,
  } = useWorkflowStore()

  const activeNode = React.useMemo(() => {
    if (!inspectNodeId) return null
    return nodes.find((n) => n.id === inspectNodeId) || null
  }, [nodes, inspectNodeId])

  const nodeData = activeNode?.data
  const manifest = nodeData?.manifest
  const nodeDef = nodeData?.nodeDef
  const inputs = nodeData?.inputs || []

  // Filter out any params that are provided via input socket connections
  const inputPortIds = React.useMemo(() => new Set(inputs.map((inp) => inp.id)), [inputs])

  // Strictly use nodeDef.params if this is a specialized sub-node; otherwise fallback to manifest
  const applicableParams: ParameterDef[] = React.useMemo(() => {
    if (!activeNode) return []
    if (activeNode.data.kind === "folder_input") {
      return FOLDER_INPUT_PARAMS
    }
    if (activeNode.data.kind === "output_save") {
      return OUTPUT_SAVE_PARAMS
    }
    const rawParams = nodeDef?.params || (nodeDef ? [] : manifest?.params || [])
    return rawParams.filter((p) => !inputPortIds.has(p.id))
  }, [activeNode, nodeDef, manifest, inputPortIds])

  // Default visible parameters:
  // 1. If required is true -> always show
  // 2. If show is boolean -> use show flag
  // 3. Otherwise -> hide by default
  const defaultVisibleIds = React.useMemo(() => {
    return applicableParams
      .filter((p) => {
        if (p.required === true) return true
        if (typeof p.show === "boolean") return p.show
        return false
      })
      .map((p) => p.id)
  }, [applicableParams])

  const visibleParams = React.useMemo(() => {
    return activeNode?.data.visible_params || defaultVisibleIds
  }, [activeNode?.data.visible_params, defaultVisibleIds])

  if (!inspectNodeId || !activeNode || !nodeData) return null

  return (
    <div className="absolute top-16 right-4 bottom-4 z-40 w-84 sm:w-96 rounded-xl border border-border/80 bg-card/95 backdrop-blur-md shadow-2xl overflow-hidden flex flex-col max-h-[calc(100%-5rem)] animate-in fade-in slide-in-from-right-4 duration-200">
      {/* Header */}
      <div className="flex items-start justify-between p-4 pb-3 border-b border-border/70 bg-muted/10 shrink-0">
        <div className="flex flex-col gap-0.5 min-w-0 pr-2">
          <h3 className="text-sm font-semibold text-foreground tracking-tight truncate">
            Component Parameters
          </h3>
          <p className="text-[11px] text-muted-foreground leading-normal">
            Adjust component parameter visibility and define API inputs.
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setInspectNodeId(null)}
          className="size-6 text-muted-foreground hover:text-foreground rounded-lg -mr-1 -mt-1 cursor-pointer shrink-0"
        >
          <X className="size-3.5" />
          <span className="sr-only">Close</span>
        </Button>
      </div>

      {/* Parameter Rows List */}
      <ScrollArea className="flex-1 min-h-0 overflow-y-auto">
        <div className="flex flex-col gap-1 p-3 pb-5">
          {applicableParams.map((param) => {
            const isParamVisible = visibleParams.includes(param.id)
            const defaultDisplay =
              param.default !== undefined
                ? typeof param.default === "boolean"
                  ? param.default
                    ? "True"
                    : "False"
                  : String(param.default)
                : "Empty"

            return (
              <div
                key={param.id}
                className="flex items-center justify-between py-2 px-2.5 rounded-lg hover:bg-muted/30 transition-colors gap-2 border-b border-border/30 last:border-0"
              >
                {/* Left: Name, required asterisk, info tooltip, Default value */}
                <div className="flex flex-col min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="text-xs font-semibold text-foreground truncate">
                      {param.name}
                    </span>
                    {param.required && (
                      <span className="text-rose-500 font-bold text-xs shrink-0">*</span>
                    )}
                    {param.description && (
                      <Tooltip>
                        <TooltipTrigger
                          render={
                            <button
                              type="button"
                              className="text-muted-foreground/50 hover:text-foreground transition-colors cursor-help shrink-0 nodrag"
                            >
                              <Info className="size-3" />
                            </button>
                          }
                        />
                        <TooltipContent side="top" className="max-w-xs text-xs font-normal">
                          {param.description}
                        </TooltipContent>
                      </Tooltip>
                    )}
                  </div>
                  <span className="text-[10px] text-muted-foreground truncate mt-0.5">
                    Default: {defaultDisplay}
                  </span>
                </div>

                {/* Right: API pill + Add / Remove button */}
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className="px-1.5 py-0.5 rounded border border-border/70 text-[9px] font-mono text-muted-foreground bg-muted/20 font-medium">
                    API
                  </span>
                  {isParamVisible ? (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={param.required === true}
                      onClick={() =>
                        toggleParamVisibility(activeNode.id, param.id, defaultVisibleIds)
                      }
                      className="h-6 text-[11px] px-2.5 text-muted-foreground hover:text-foreground border-border/70 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      Remove
                    </Button>
                  ) : (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() =>
                        toggleParamVisibility(activeNode.id, param.id, defaultVisibleIds)
                      }
                      className="h-6 text-[11px] px-2.5 text-foreground font-medium bg-muted hover:bg-muted/80 border border-border/60 cursor-pointer"
                    >
                      + Add
                    </Button>
                  )}
                </div>
              </div>
            )
          })}

          {applicableParams.length === 0 && (
            <div className="p-6 flex flex-col items-center justify-center text-center gap-1.5 text-muted-foreground">
              <Info className="size-5 opacity-40" />
              <p className="text-xs font-medium">No optional parameters</p>
              <p className="text-[10px] max-w-[220px]">
                This node has no configurable parameters to add or remove.
              </p>
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  )
}
