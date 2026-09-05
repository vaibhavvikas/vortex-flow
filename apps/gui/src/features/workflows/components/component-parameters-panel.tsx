import * as React from "react"
import { X, Info } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { ScrollArea } from "@/components/ui/scroll-area"
import { cn } from "@/lib/utils"
import { useWorkflowStore } from "../stores/workflow-store"
import type { ParameterDef } from "@/features/extensions/types"
import type { Node } from "@xyflow/react"
import type { WorkflowNodeData } from "../types"

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

  const panelRef = React.useRef<HTMLDivElement>(null)
  const [hasRendered, setHasRendered] = React.useState(false)

  const activeNode = React.useMemo(() => {
    if (!inspectNodeId) return null
    return nodes.find((n) => n.id === inspectNodeId) || null
  }, [nodes, inspectNodeId])

  // Retain last active node data during slide-out exit animation
  const lastActiveNodeRef = React.useRef<Node<WorkflowNodeData> | null>(null)
  if (activeNode) {
    lastActiveNodeRef.current = activeNode
  }

  const displayNode = activeNode || lastActiveNodeRef.current
  const isOpen = Boolean(inspectNodeId && activeNode)

  React.useEffect(() => {
    if (isOpen && !hasRendered) {
      setHasRendered(true)
    }
  }, [isOpen, hasRendered])

  // Click off-screen (click outside) & Escape key dismissal
  React.useEffect(() => {
    if (!isOpen) return

    const handlePointerDown = (event: PointerEvent | MouseEvent) => {
      const target = event.target as Element | null
      if (!target) return

      // If click is within the panel, do not dismiss
      if (panelRef.current?.contains(target)) {
        return
      }

      // If click is on a parameter toggle trigger button on a node, let onClick handle it
      if (target.closest("[data-parameter-trigger]")) {
        return
      }

      // If click is inside a portal element (tooltips, popovers, select dropdowns), do not dismiss
      if (
        target.closest('[data-slot="tooltip-content"]') ||
        target.closest('[data-slot="tooltip-positioner"]') ||
        target.closest('[data-slot="select-content"]') ||
        target.closest('[data-slot="popover-content"]')
      ) {
        return
      }

      // Clicked anywhere off the parameters panel -> close the panel
      setInspectNodeId(null)
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setInspectNodeId(null)
      }
    }

    document.addEventListener("pointerdown", handlePointerDown)
    document.addEventListener("keydown", handleKeyDown)

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown)
      document.removeEventListener("keydown", handleKeyDown)
    }
  }, [isOpen, setInspectNodeId])

  const nodeData = displayNode?.data
  const manifest = nodeData?.manifest
  const nodeDef = nodeData?.nodeDef
  const inputs = nodeData?.inputs || []

  // Filter out any params that are provided via input socket connections
  const inputPortIds = React.useMemo(() => new Set(inputs.map((inp) => inp.id)), [inputs])

  // Strictly use nodeDef.params if this is a specialized sub-node; otherwise fallback to manifest
  const applicableParams: ParameterDef[] = React.useMemo(() => {
    if (!displayNode) return []
    if (displayNode.data.kind === "folder_input") {
      return FOLDER_INPUT_PARAMS
    }
    if (displayNode.data.kind === "output_save") {
      return OUTPUT_SAVE_PARAMS
    }
    const rawParams = nodeDef?.params || (nodeDef ? [] : manifest?.params || [])
    return rawParams.filter((p) => !inputPortIds.has(p.id))
  }, [displayNode, nodeDef, manifest, inputPortIds])

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
    return displayNode?.data.visible_params || defaultVisibleIds
  }, [displayNode?.data.visible_params, defaultVisibleIds])

  if (!hasRendered && !isOpen) return null
  if (!displayNode || !nodeData) return null

  return (
    <div
      ref={panelRef}
      role="region"
      aria-label="Component Parameters"
      data-state={isOpen ? "open" : "closed"}
      className={cn(
        "absolute top-16 right-4 bottom-4 z-40 w-84 sm:w-96 rounded-xl border border-border/80 bg-card/95 backdrop-blur-md overflow-hidden flex flex-col max-h-[calc(100%-5rem)] shadow-2xl",
        "transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]",
        isOpen
          ? "translate-x-0 opacity-100 pointer-events-auto"
          : "translate-x-[calc(100%+2rem)] opacity-0 pointer-events-none shadow-none"
      )}
    >
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
                        toggleParamVisibility(displayNode.id, param.id, defaultVisibleIds)
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
                        toggleParamVisibility(displayNode.id, param.id, defaultVisibleIds)
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
