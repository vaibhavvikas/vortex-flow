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
import { Play, RotateCcw, AlertTriangle, Terminal, Boxes, Sparkles, Lock, Unlock } from "lucide-react"
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

  // Run Pipeline handler with real-time SSE event streaming
  const handleRunPipeline = async () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }
    const abortController = new AbortController()
    abortControllerRef.current = abortController

    setIsRunning(true)
    setIsConsoleOpen(true)
    setLiveLogs([])
    setRunResult(null)
    setAllNodesStatus("idle")

    const graphDto = getGraphDto()

    // 1. Validate graph first
    const validation = await workflowService.validateWorkflow(graphDto)
    if (!validation.is_valid) {
      setIsRunning(false)
      if (validation.error_type === "cycle") {
        setCycleError(validation.error || "Circular loop detected in workflow.")
      } else {
        toast.error(`Validation Error: ${validation.error}`)
      }
      return
    }

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
                n.id === event.node_id ? { ...n, data: { ...n.data, status: "completed" } } : n
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
        onParamChange: (key: string, value: any) => {
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
  }, [nodes, updateNodeParam, deleteNode])

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

        const newNodeId = `node_${item.id}_${Date.now()}`
        const newNode: Node<WorkflowNodeData> = {
          id: newNodeId,
          type: item.type,
          position,
          data: {
            title: item.title,
            category: item.category,
            kind: item.kind,
            tool_id: item.tool_id,
            manifest: item.manifest,
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

      const newNodeId = `node_${item.id}_${Date.now()}`
      const newNode: Node<WorkflowNodeData> = {
        id: newNodeId,
        type: item.type,
        position: { x, y },
        data: {
          title: item.title,
          category: item.category,
          kind: item.kind,
          tool_id: item.tool_id,
          manifest: item.manifest,
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

