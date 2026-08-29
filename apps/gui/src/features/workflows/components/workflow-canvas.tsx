import * as React from "react"
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  ControlButton,
  MiniMap,
  useReactFlow,
  BackgroundVariant,
  type Connection,
  type Edge,
  type Node,
} from "@xyflow/react"
import "@xyflow/react/dist/style.css"
import {
  Play,
  RotateCcw,
  AlertTriangle,
  Terminal,
  Boxes,
  Sparkles,
  Lock,
  Unlock,
  Upload,
  Download,
  ShieldCheck,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Spinner } from "@/components/ui/spinner"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import { toast } from "sonner"
import { useTheme } from "@/components/layout/theme-provider"
import { getLayoutedElements } from "../utils/auto-layout"
import { FolderInputNode } from "./nodes/folder-input-node"
import { OutputSaveNode } from "./nodes/output-save-node"
import { DynamicToolNode } from "./nodes/dynamic-tool-node"
import { getSocketColor } from "./nodes/base-node-card"
import { CustomWorkflowEdge } from "./edges/custom-edge"
import { WorkflowNodePalette, type NodePaletteItem } from "./workflow-node-palette"
import { WorkflowExecutionDrawer } from "./workflow-execution-drawer"
import { workflowService, type RunWorkflowResponse } from "../services/workflow-service"
import { useWorkflowStore } from "../stores/workflow-store"
import type { WorkflowNodeData, WorkflowGraphDto } from "../types"

const nodeTypes = {
  folderInput: FolderInputNode,
  outputSave: OutputSaveNode,
  dynamicTool: DynamicToolNode,
  resfinder: DynamicToolNode,
}

const edgeTypes = {
  default: CustomWorkflowEdge,
  custom: CustomWorkflowEdge,
}

export interface WorkflowCanvasProps {
  onSelectNode?: (node: Node<WorkflowNodeData> | null) => void
}

function WorkflowCanvasInner({ onSelectNode }: WorkflowCanvasProps) {
  const { theme } = useTheme()
  const { fitView, screenToFlowPosition, getViewport } = useReactFlow()

  const nodes = useWorkflowStore((s) => s.nodes)
  const edges = useWorkflowStore((s) => s.edges)
  const isRunning = useWorkflowStore((s) => s.isRunning)
  const isPaletteOpen = useWorkflowStore((s) => s.isPaletteOpen)
  const setIsPaletteOpen = useWorkflowStore((s) => s.setIsPaletteOpen)
  const togglePalette = useWorkflowStore((s) => s.togglePalette)
  const addNode = useWorkflowStore((s) => s.addNode)
  const deleteNode = useWorkflowStore((s) => s.deleteNode)
  const onNodesChange = useWorkflowStore((s) => s.onNodesChange)
  const onEdgesChange = useWorkflowStore((s) => s.onEdgesChange)
  const onConnectStore = useWorkflowStore((s) => s.onConnect)
  const updateNodeParam = useWorkflowStore((s) => s.updateNodeParam)
  const setAllNodesStatus = useWorkflowStore((s) => s.setAllNodesStatus)
  const resetWorkflow = useWorkflowStore((s) => s.resetWorkflow)
  const getGraphDto = useWorkflowStore((s) => s.getGraphDto)
  const setIsRunning = useWorkflowStore((s) => s.setIsRunning)
  const setNodes = useWorkflowStore((s) => s.setNodes)
  const setEdges = useWorkflowStore((s) => s.setEdges)

  const [cycleError, setCycleError] = React.useState<string | null>(null)
  const [isConsoleOpen, setIsConsoleOpen] = React.useState(false)
  const [isValidating, setIsValidating] = React.useState(false)
  const [invalidNodeId, setInvalidNodeId] = React.useState<string | null>(null)
  const [validationErrorMessage, setValidationErrorMessage] = React.useState<string | null>(null)
  const [runResult, setRunResult] = React.useState<RunWorkflowResponse | null>(null)
  const [liveLogs, setLiveLogs] = React.useState<{ node_id: string; line: string }[]>([])
  const [isInteractive, setIsInteractive] = React.useState(true)
  const abortControllerRef = React.useRef<AbortController | null>(null)

  // Clean up streaming reader on unmount to prevent memory leaks
  React.useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
      }
    }
  }, [])

  // Pre-flight Pipeline Validation Handler
  const handleValidatePipeline = React.useCallback(async () => {
    if (nodes.length === 0) {
      toast.error("Workflow canvas is empty. Add nodes before validating.")
      return
    }

    setIsValidating(true)
    setInvalidNodeId(null)
    setValidationErrorMessage(null)

    try {
      const graphDto = getGraphDto()
      const validation = await workflowService.validateWorkflow(graphDto)

      if (validation.is_valid) {
        setInvalidNodeId(null)
        setValidationErrorMessage(null)
        toast.success("Pipeline is valid! Ready for execution.", {
          description: `${validation.execution_order?.length || nodes.length} nodes successfully sequenced.`,
        })
      } else {
        if (validation.invalid_node_id) {
          setInvalidNodeId(validation.invalid_node_id)
        }
        setValidationErrorMessage(validation.error || null)
        if (validation.error_type === "cycle") {
          setCycleError(validation.error || "Circular loop detected in workflow.")
        } else {
          toast.error("Pipeline Validation Failed", {
            description: validation.error || "Please check node parameters and connections.",
          })
        }
      }
    } catch (err: any) {
      toast.error("Validation check failed", { description: err.message })
    } finally {
      setIsValidating(false)
    }
  }, [nodes, getGraphDto])

  // Run Pipeline handler with real-time SSE event streaming
  const handleRunPipeline = async () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }
    const abortController = new AbortController()
    abortControllerRef.current = abortController

    setInvalidNodeId(null)
    setValidationErrorMessage(null)
    const graphDto = getGraphDto()

    // 1. Validate graph first
    const validation = await workflowService.validateWorkflow(graphDto)
    if (!validation.is_valid) {
      setIsRunning(false)
      if (validation.invalid_node_id) {
        setInvalidNodeId(validation.invalid_node_id)
      }
      setValidationErrorMessage(validation.error || null)
      if (validation.error_type === "cycle") {
        setCycleError(validation.error || "Circular loop detected in workflow.")
      } else {
        toast.error("Pipeline Validation Failed", {
          description: validation.error || "Please check node parameters and connections.",
        })
      }
      return
    }

    setIsRunning(true)
    setIsConsoleOpen(true)
    setLiveLogs([])
    setRunResult(null)
    setAllNodesStatus("idle")

    toast.info("Pipeline execution started")

    try {
      await workflowService.runWorkflowStream(
        graphDto,
        (event) => {
          if (event.type === "node_start") {
            setNodes((nds) =>
              nds.map((n) =>
                n.id === event.node_id ? { ...n, data: { ...n.data, status: "running" } } : n
              )
            )
          } else if (event.type === "log") {
            setLiveLogs((prev) => [...prev, { node_id: event.node_id, line: event.line }])
          } else if (event.type === "node_complete") {
            setNodes((nds) =>
              nds.map((n) =>
                n.id === event.node_id
                  ? {
                      ...n,
                      data: {
                        ...n.data,
                        status: "completed",
                        results: event.outputs || {},
                      },
                    }
                  : n
              )
            )
          } else if (event.type === "node_error") {
            setNodes((nds) =>
              nds.map((n) =>
                n.id === event.node_id ? { ...n, data: { ...n.data, status: "failed" } } : n
              )
            )
          } else if (event.type === "workflow_complete") {
            setIsRunning(false)
            setRunResult({
              success: event.is_success,
              report: event.report,
            })
            if (event.is_success) {
              toast.success(`Pipeline completed (${event.total_duration_ms}ms)`)
            } else {
              toast.error("Pipeline execution encountered an error")
            }
          } else if (event.type === "workflow_error") {
            setIsRunning(false)
            toast.error(`Execution error: ${event.error}`)
          }
        },
        abortController.signal
      )
    } catch (err: any) {
      if (err.name !== "AbortError") {
        console.error("Workflow streaming error:", err)
        setIsRunning(false)
        toast.error(`Workflow execution failed: ${err.message}`)
      }
    } finally {
      setIsRunning(false)
    }
  }

  // Attach onParamChange, onRun & onDelete handlers to each node
  const enhancedNodes = React.useMemo(() => {
    return nodes.map((n) => ({
      ...n,
      data: {
        ...n.data,
        isInvalid: n.id === invalidNodeId,
        validationError: n.id === invalidNodeId ? validationErrorMessage || undefined : undefined,
        onParamChange: (key: string, value: any) => {
          if (invalidNodeId === n.id) {
            setInvalidNodeId(null)
            setValidationErrorMessage(null)
          }
          updateNodeParam(n.id, key, value)
        },
        onRun: () => {
          handleRunPipeline()
        },
        onDelete: () => {
          deleteNode(n.id)
          toast.info(`Deleted ${n.data.title || "node"}`)
        },
      },
    }))
  }, [nodes, invalidNodeId, validationErrorMessage, updateNodeParam, deleteNode])

  // Handle connecting two ports
  const onConnect = React.useCallback(
    async (params: Connection) => {
      const sourceNode = nodes.find((n) => n.id === params.source)
      const targetNode = nodes.find((n) => n.id === params.target)

      const sourcePort = sourceNode?.data.outputs?.find((p) => p.id === params.sourceHandle)
      const targetPort = targetNode?.data.inputs?.find((p) => p.id === params.targetHandle)

      if (sourcePort && targetPort) {
        if (
          sourcePort.socket_type !== "any" &&
          targetPort.socket_type !== "any" &&
          sourcePort.socket_type !== targetPort.socket_type
        ) {
          toast.error(
            `Incompatible sockets: Cannot connect '${sourcePort.socket_type}' to '${targetPort.socket_type}'`
          )
          return
        }
      }

      // Determine wire color dynamically based on socket type
      const strokeColor = sourcePort ? getSocketColor(sourcePort.socket_type) : "var(--primary)"

      const newEdge: Edge = {
        ...params,
        id: `e_${params.source}_${params.target}_${Date.now()}`,
        animated: true,
        style: { stroke: strokeColor, strokeWidth: 2 },
      }

      onConnectStore(newEdge)

      // Validate cycle immediately
      const tempEdges = [...edges, newEdge]
      const graphDto: WorkflowGraphDto = {
        ...getGraphDto(),
        edges: tempEdges.map((e) => ({
          id: e.id,
          source_node: e.source,
          source_port: e.sourceHandle || "",
          target_node: e.target,
          target_port: e.targetHandle || "",
        })),
      }

      const validation = await workflowService.validateWorkflow(graphDto)
      if (!validation.is_valid && validation.error_type === "cycle") {
        setCycleError(
          validation.error || "Circular loop detected! Workflows must be a directed acyclic graph."
        )
      }
    },
    [nodes, edges, getGraphDto, onConnectStore]
  )

  // Drag and drop onto React Flow canvas
  const handleDragOver = React.useCallback((event: React.DragEvent) => {
    event.preventDefault()
    event.dataTransfer.dropEffect = "move"
  }, [])

  const handleDrop = React.useCallback(
    (event: React.DragEvent) => {
      event.preventDefault()

      const rawData = event.dataTransfer.getData("application/reactflow/node")
      if (!rawData) return

      try {
        const item: NodePaletteItem = JSON.parse(rawData)
        const position = screenToFlowPosition({
          x: event.clientX,
          y: event.clientY,
        })

        const newNodeId = `node_${item.id.replace(/:/g, "_")}_${Date.now()}`
        const newNode: Node<WorkflowNodeData> = {
          id: newNodeId,
          type: item.type,
          position,
          data: {
            title: item.title,
            category: item.category,
            kind: item.kind,
            tool_id: item.tool_id,
            node_id: item.node_id,
            node_type: item.node_type,
            manifest: item.manifest,
            nodeDef: item.nodeDef,
            status: "idle",
            inputs: item.inputs,
            outputs: item.outputs,
            params: item.defaultParams,
          },
        }

        addNode(newNode)
        toast.success(`Added ${item.title}`)
      } catch (err) {
        console.error("Failed to parse dropped node:", err)
      }
    },
    [screenToFlowPosition, addNode]
  )

  const handleAddFromPalette = React.useCallback(
    (item: NodePaletteItem) => {
      const vp = getViewport()
      const x = -vp.x / vp.zoom + 200 + Math.random() * 50
      const y = -vp.y / vp.zoom + 120 + Math.random() * 50

      const newNodeId = `node_${item.id.replace(/:/g, "_")}_${Date.now()}`
      const newNode: Node<WorkflowNodeData> = {
        id: newNodeId,
        type: item.type,
        position: { x, y },
        data: {
          title: item.title,
          category: item.category,
          kind: item.kind,
          tool_id: item.tool_id,
          node_id: item.node_id,
          node_type: item.node_type,
          manifest: item.manifest,
          nodeDef: item.nodeDef,
          status: "idle",
          inputs: item.inputs,
          outputs: item.outputs,
          params: item.defaultParams,
        },
      }

      addNode(newNode)
      toast.success(`Added ${item.title}`)
    },
    [getViewport, addNode]
  )



  const fileInputRef = React.useRef<HTMLInputElement>(null)

  // Export current workflow as .vortexflow JSON package
  const handleExportWorkflow = React.useCallback(() => {
    if (nodes.length === 0) {
      toast.error("Workflow canvas is empty. Add nodes before exporting.")
      return
    }

    const workflowData = {
      vortexflow_version: "2.4.0",
      exported_at: new Date().toISOString(),
      name: "Custom Workflow",
      viewport: getViewport(),
      nodes: nodes.map((n) => ({
        id: n.id,
        type: n.type,
        position: n.position,
        data: {
          title: n.data.title,
          category: n.data.category,
          kind: n.data.kind,
          tool_id: n.data.tool_id,
          node_id: n.data.node_id,
          node_type: n.data.node_type,
          manifest: n.data.manifest,
          nodeDef: n.data.nodeDef,
          inputs: n.data.inputs,
          outputs: n.data.outputs,
          params: n.data.params,
        },
      })),
      edges: edges.map((e) => ({
        id: e.id,
        source: e.source,
        sourceHandle: e.sourceHandle,
        target: e.target,
        targetHandle: e.targetHandle,
        type: e.type || "default",
        animated: e.animated ?? true,
        style: e.style,
      })),
    }

    const jsonStr = JSON.stringify(workflowData, null, 2)
    const blob = new Blob([jsonStr], { type: "application/json" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    const dateStr = new Date().toISOString().slice(0, 10)
    a.href = url
    a.download = `pipeline-${dateStr}.vortexflow`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)

    toast.success("Workflow exported successfully (.vortexflow)")
  }, [nodes, edges, getViewport])

  // Import workflow from file
  const onImportFileChange = React.useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (!file) return

      const reader = new FileReader()
      reader.onload = (event) => {
        try {
          const content = event.target?.result as string
          const parsed = JSON.parse(content)

          if (!parsed.nodes || !Array.isArray(parsed.nodes)) {
            toast.error("Invalid workflow file format: missing nodes array")
            return
          }

          const importedNodes = parsed.nodes.map((n: any) => ({
            id: n.id,
            type: n.type || "dynamicTool",
            position: n.position || { x: 100, y: 100 },
            data: {
              ...n.data,
              status: "idle" as const,
              params: n.data.params || {},
              inputs: n.data.inputs || [],
              outputs: n.data.outputs || [],
            },
          }))

          const importedEdges = (parsed.edges || []).map((e: any) => {
            const srcNode = importedNodes.find((n: any) => n.id === e.source)
            const srcPort = srcNode?.data.outputs?.find((p: any) => p.id === e.sourceHandle)
            const strokeColor = e.style?.stroke || (srcPort ? getSocketColor(srcPort.socket_type) : "#3b82f6")

            return {
              id: e.id || `e_${e.source}_${e.target}_${Date.now()}`,
              source: e.source,
              sourceHandle: e.sourceHandle,
              target: e.target,
              targetHandle: e.targetHandle,
              type: "default",
              animated: e.animated ?? true,
              style: { stroke: strokeColor, strokeWidth: 2, ...e.style },
            }
          })

          setNodes(importedNodes)
          setEdges(importedEdges)

          setTimeout(() => {
            fitView({ duration: 400, padding: 0.35, maxZoom: 0.85 })
          }, 80)

          toast.success(
            `Imported workflow: ${importedNodes.length} nodes, ${importedEdges.length} connections`
          )
        } catch (err: any) {
          console.error("Failed to parse workflow file:", err)
          toast.error("Could not parse workflow file. Please check file format.")
        } finally {
          if (fileInputRef.current) {
            fileInputRef.current.value = ""
          }
        }
      }
      reader.readAsText(file)
    },
    [setNodes, setEdges, fitView]
  )

  // Reset to default template and re-center view
  const handleResetTemplate = () => {
    resetWorkflow()
    setRunResult(null)
    setTimeout(() => {
      fitView({ duration: 400, padding: 0.35, maxZoom: 0.85 })
    }, 50)
    toast.info("Workflow reset")
  }

  // Prettify / Auto-Layout using Dagre graph engine
  const handleAutoLayout = React.useCallback(() => {
    if (nodes.length === 0) return
    const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedElements(
      nodes,
      edges,
      "LR"
    )
    setNodes(layoutedNodes)
    setEdges(layoutedEdges)
    setTimeout(() => {
      fitView({ duration: 400, padding: 0.35, maxZoom: 0.85 })
    }, 50)
    toast.success("Workflow layout organized")
  }, [nodes, edges, setNodes, setEdges, fitView])

  return (
    <div className="w-full h-full relative bg-background overflow-hidden flex flex-col">
      {/* Hidden File Input for Workflow Import */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={onImportFileChange}
        accept=".vortexflow,.json"
        className="hidden"
      />

      {/* Top Workflow Control Bar */}
      <div className="h-12 px-4 border-b border-border/60 bg-card/60 backdrop-blur-md flex items-center justify-between z-10">
        <div className="flex items-center gap-2.5">
          <Button
            variant={isPaletteOpen ? "default" : "outline"}
            size="sm"
            onClick={togglePalette}
            className="h-8 gap-1.5 text-xs font-normal cursor-pointer"
            title="Toggle Node Palette"
          >
            <Boxes className="size-3.5" />
            <span>Nodes</span>
          </Button>

          <Badge variant="outline" className="text-xs font-normal">
            Workflow Canvas
          </Badge>
          <span className="text-xs text-muted-foreground hidden sm:inline">
            {nodes.length} Nodes · {edges.length} Connections
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* Import / Export Controls */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            disabled={isRunning}
            className="h-8 gap-1.5 text-xs cursor-pointer font-normal"
            title="Import workflow from .vortexflow file"
          >
            <Upload className="size-3.5 text-muted-foreground" />
            <span>Import</span>
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={handleExportWorkflow}
            disabled={isRunning}
            className="h-8 gap-1.5 text-xs cursor-pointer font-normal"
            title="Export workflow to .vortexflow file"
          >
            <Download className="size-3.5 text-muted-foreground" />
            <span>Export</span>
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsConsoleOpen(!isConsoleOpen)}
            className="h-8 gap-1.5 text-xs cursor-pointer font-normal"
            title="Toggle Execution Console"
          >
            <Terminal className="size-3.5 text-primary" />
            Console
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={handleResetTemplate}
            disabled={isRunning}
            className="h-8 gap-1.5 text-xs cursor-pointer font-normal"
          >
            <RotateCcw className="size-3.5" />
            Reset
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={handleValidatePipeline}
            disabled={isValidating || isRunning || nodes.length === 0}
            className="h-8 gap-1.5 text-xs cursor-pointer font-normal text-foreground shadow-xs"
            title="Pre-flight Pipeline Validation"
          >
            {isValidating ? (
              <Spinner className="size-3.5" />
            ) : (
              <ShieldCheck className="size-3.5 text-primary" />
            )}
            <span>Validate</span>
          </Button>

          <Button
            variant="default"
            size="sm"
            onClick={handleRunPipeline}
            disabled={isRunning}
            className="h-8 gap-1.5 text-xs font-medium cursor-pointer"
          >
            {isRunning ? (
              <>
                <Spinner className="size-3.5" />
                Executing...
              </>
            ) : (
              <>
                <Play className="size-3.5 fill-current" />
                Run Pipeline
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Workspace Area: Docked Node Palette + Flow Canvas */}
      <div className="flex-1 w-full h-full relative flex overflow-hidden">
        {/* Docked Collapsible Node Palette */}
        <WorkflowNodePalette
          isOpen={isPaletteOpen}
          onClose={() => setIsPaletteOpen(false)}
          onAddNode={handleAddFromPalette}
        />

        {/* Main React Flow Canvas Area */}
        <div
          className="flex-1 h-full relative overflow-hidden"
          onDragOver={handleDragOver}
          onDrop={handleDrop}
        >
          <ReactFlow
            colorMode={theme as "dark" | "light" | "system"}
            nodes={enhancedNodes}
            edges={edges}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            deleteKeyCode={["Backspace", "Delete"]}
            onNodeClick={(_, node) => onSelectNode?.(node as Node<WorkflowNodeData>)}
            onPaneClick={() => onSelectNode?.(null)}
            nodesDraggable={isInteractive}
            nodesConnectable={isInteractive}
            elementsSelectable={isInteractive}
            elevateNodesOnSelect={true}
            elevateEdgesOnSelect={true}
            defaultViewport={{ x: 50, y: 50, zoom: 0.82 }}
            minZoom={0.2}
            maxZoom={2}
            fitView={nodes.length > 0}
            fitViewOptions={{ padding: 0.35, maxZoom: 0.85 }}
            proOptions={{ hideAttribution: true }}
          >
            <Background variant={BackgroundVariant.Dots} gap={24} size={2} />
            <Controls
              showZoom={true}
              showFitView={false}
              showInteractive={false}
              className="bg-card border border-border text-foreground shadow-sm rounded-lg"
            >
              <ControlButton
                onClick={handleAutoLayout}
                title="Prettify Workflow Layout (Dagre)"
                aria-label="Prettify layout"
                className="hover:bg-muted text-foreground cursor-pointer"
              >
                <Sparkles className="size-3.5" />
              </ControlButton>
              <ControlButton
                onClick={() => fitView({ duration: 400, padding: 0.35, maxZoom: 0.85 })}
                title="Fit View"
                aria-label="Fit view"
                className="hover:bg-muted text-foreground cursor-pointer"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 32 32"
                  className="size-3.5 stroke-current fill-none stroke-[2.5]"
                >
                  <path
                    d="M4 12V4h8M20 4h8v8M28 20v8h-8M12 28H4v-8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </ControlButton>
              <ControlButton
                onClick={() => setIsInteractive(!isInteractive)}
                title={isInteractive ? "Lock Canvas" : "Unlock Canvas"}
                aria-label={isInteractive ? "Lock Canvas" : "Unlock Canvas"}
                className="hover:bg-muted text-foreground cursor-pointer"
              >
                {isInteractive ? (
                  <Unlock className="size-3.5 text-muted-foreground" />
                ) : (
                  <Lock className="size-3.5 text-amber-500" />
                )}
              </ControlButton>
            </Controls>
            <MiniMap
              className="bg-card border border-border rounded-lg"
              nodeColor={() => "var(--primary)"}
              maskColor="var(--background)"
            />
          </ReactFlow>

          {/* Live Execution Console Drawer */}
          <WorkflowExecutionDrawer
            isOpen={isConsoleOpen}
            onToggle={() => setIsConsoleOpen(!isConsoleOpen)}
            isRunning={isRunning}
            runResult={runResult}
            liveLogs={liveLogs}
          />
        </div>
      </div>

      {/* Cycle Detection Alert Dialog */}
      <Dialog open={!!cycleError} onOpenChange={() => setCycleError(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <div className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="size-5" />
              <DialogTitle className="text-base font-semibold">
                Circular Loop Detected
              </DialogTitle>
            </div>
            <DialogDescription className="text-xs pt-2 leading-relaxed">
              {cycleError ||
                "A circular dependency was detected. Workflows must be strict Directed Acyclic Graphs (DAGs). Please remove the looping edge to proceed."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCycleError(null)}
              className="cursor-pointer text-xs"
            >
              Understood
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export function WorkflowCanvas(props: WorkflowCanvasProps) {
  return (
    <ReactFlowProvider>
      <WorkflowCanvasInner {...props} />
    </ReactFlowProvider>
  )
}

