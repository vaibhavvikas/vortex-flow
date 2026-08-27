import * as React from "react"
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  addEdge,
  BackgroundVariant,
  type Connection,
  type Node,
} from "@xyflow/react"
import { useTheme } from "@/components/layout/theme-provider"

export interface WorkflowNodeData extends Record<string, unknown> {
  label: string
  category: string
  status: "ready" | "running" | "completed" | "idle"
  threads: number
  mem: string
}

const initialNodes: Node<WorkflowNodeData>[] = [
  {
    id: "1",
    position: { x: 50, y: 150 },
    data: {
      label: "FASTQ Input Stream",
      category: "Data Ingestion",
      status: "completed",
      threads: 4,
      mem: "8GB",
    },
    style: {
      background: "var(--card)",
      color: "var(--card-foreground)",
      border: "1px solid var(--border)",
      borderRadius: "var(--radius-lg)",
      padding: "12px",
      width: 220,
    },
  },
  {
    id: "2",
    position: { x: 330, y: 150 },
    data: {
      label: "FastQC Quality Control",
      category: "Preprocessing",
      status: "completed",
      threads: 8,
      mem: "16GB",
    },
    style: {
      background: "var(--card)",
      color: "var(--card-foreground)",
      border: "1px solid var(--border)",
      borderRadius: "var(--radius-lg)",
      padding: "12px",
      width: 220,
    },
  },
  {
    id: "3",
    position: { x: 610, y: 150 },
    data: {
      label: "BWA-MEM2 Alignment",
      category: "Genome Alignment",
      status: "running",
      threads: 32,
      mem: "64GB",
    },
    style: {
      background: "var(--card)",
      color: "var(--card-foreground)",
      border: "1px solid var(--border)",
      borderRadius: "var(--radius-lg)",
      padding: "12px",
      width: 220,
    },
  },
  {
    id: "4",
    position: { x: 890, y: 150 },
    data: {
      label: "GATK HaplotypeCaller",
      category: "Variant Calling",
      status: "idle",
      threads: 16,
      mem: "32GB",
    },
    style: {
      background: "var(--card)",
      color: "var(--card-foreground)",
      border: "1px solid var(--border)",
      borderRadius: "var(--radius-lg)",
      padding: "12px",
      width: 220,
    },
  },
  {
    id: "5",
    position: { x: 1170, y: 150 },
    data: {
      label: "VCF Annotation & Report",
      category: "Output Report",
      status: "idle",
      threads: 4,
      mem: "8GB",
    },
    style: {
      background: "var(--card)",
      color: "var(--card-foreground)",
      border: "1px solid var(--border)",
      borderRadius: "var(--radius-lg)",
      padding: "12px",
      width: 220,
    },
  },
]

const initialEdges = [
  { id: "e1-2", source: "1", target: "2", animated: true },
  { id: "e2-3", source: "2", target: "3", animated: true },
  { id: "e3-4", source: "3", target: "4" },
  { id: "e4-5", source: "4", target: "5" },
]

export interface WorkflowCanvasProps {
  onSelectNode?: (node: Node<WorkflowNodeData> | null) => void
}

export function WorkflowCanvas({ onSelectNode }: WorkflowCanvasProps = {}) {
  const { theme } = useTheme()
  const [nodes, , onNodesChange] = useNodesState<Node<WorkflowNodeData>>(initialNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges)

  const onConnect = React.useCallback(
    (params: Connection) => setEdges((eds) => addEdge(params, eds)),
    [setEdges]
  )

  return (
    <div className="w-full h-full relative bg-background">
      <ReactFlow
        colorMode={theme}
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeClick={(_, node) => onSelectNode?.(node as Node<WorkflowNodeData>)}
        onPaneClick={() => onSelectNode?.(null)}
        fitView
      >
        <Background variant={BackgroundVariant.Dots} gap={20} size={1} />
        <Controls className="bg-card border border-border text-foreground shadow-sm rounded-lg" />
        <MiniMap
          className="bg-card border border-border rounded-lg"
          nodeColor={() => "var(--primary)"}
          maskColor="var(--background)"
        />
      </ReactFlow>
    </div>
  )
}
