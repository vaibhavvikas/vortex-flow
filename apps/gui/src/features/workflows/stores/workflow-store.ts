import { create } from "zustand"
import {
  type Node,
  type Edge,
  type OnNodesChange,
  type OnEdgesChange,
  type Connection,
  type Viewport,
  applyNodeChanges,
  applyEdgeChanges,
  addEdge,
} from "@xyflow/react"
import type { WorkflowNodeData, WorkflowGraphDto } from "../types"

export const defaultInitialNodes: Node<WorkflowNodeData>[] = []

export const defaultInitialEdges: Edge[] = []

interface WorkflowStore {
  nodes: Node<WorkflowNodeData>[]
  edges: Edge[]
  viewport: Viewport
  isRunning: boolean
  isPaletteOpen: boolean

  setNodes: (nodes: Node<WorkflowNodeData>[] | ((nds: Node<WorkflowNodeData>[]) => Node<WorkflowNodeData>[])) => void
  setEdges: (edges: Edge[] | ((eds: Edge[]) => Edge[])) => void
  setViewport: (viewport: Viewport) => void
  setIsRunning: (isRunning: boolean) => void
  setIsPaletteOpen: (isPaletteOpen: boolean) => void
  togglePalette: () => void

  addNode: (node: Node<WorkflowNodeData>) => void
  deleteNode: (nodeId: string) => void
  onNodesChange: OnNodesChange<Node<WorkflowNodeData>>
  onEdgesChange: OnEdgesChange
  onConnect: (connection: Connection | Edge) => void
  updateNodeParam: (nodeId: string, key: string, value: any) => void
  setAllNodesStatus: (status: WorkflowNodeData["status"]) => void
  resetWorkflow: () => void
  getGraphDto: () => WorkflowGraphDto
}

export const useWorkflowStore = create<WorkflowStore>((set, get) => ({
  nodes: defaultInitialNodes,
  edges: defaultInitialEdges,
  viewport: { x: 50, y: 50, zoom: 0.82 },
  isRunning: false,
  isPaletteOpen: true,

  setNodes: (updater) => {
    set((state) => ({
      nodes: typeof updater === "function" ? updater(state.nodes) : updater,
    }))
  },

  setEdges: (updater) => {
    set((state) => ({
      edges: typeof updater === "function" ? updater(state.edges) : updater,
    }))
  },

  setViewport: (viewport) => set({ viewport }),
  setIsRunning: (isRunning) => set({ isRunning }),
  setIsPaletteOpen: (isPaletteOpen) => set({ isPaletteOpen }),
  togglePalette: () => set((state) => ({ isPaletteOpen: !state.isPaletteOpen })),

  addNode: (node) => {
    set((state) => ({
      nodes: [...state.nodes, node],
    }))
  },

  deleteNode: (nodeId) => {
    set((state) => ({
      nodes: state.nodes.filter((n) => n.id !== nodeId),
      edges: state.edges.filter((e) => e.source !== nodeId && e.target !== nodeId),
    }))
  },

  onNodesChange: (changes) => {
    set((state) => ({
      nodes: applyNodeChanges(changes, state.nodes),
    }))
  },

  onEdgesChange: (changes) => {
    set((state) => ({
      edges: applyEdgeChanges(changes, state.edges),
    }))
  },

  onConnect: (connection) => {
    set((state) => ({
      edges: addEdge(connection, state.edges),
    }))
  },

  updateNodeParam: (nodeId, key, value) => {
    set((state) => ({
      nodes: state.nodes.map((node) =>
        node.id === nodeId
          ? {
              ...node,
              data: {
                ...node.data,
                params: {
                  ...node.data.params,
                  [key]: value,
                },
              },
            }
          : node
      ),
    }))
  },

  setAllNodesStatus: (status) => {
    set((state) => ({
      nodes: state.nodes.map((n) => ({
        ...n,
        data: {
          ...n.data,
          status,
        },
      })),
    }))
  },

  resetWorkflow: () => {
    set({
      nodes: defaultInitialNodes,
      edges: defaultInitialEdges,
      viewport: { x: 0, y: 0, zoom: 1 },
    })
  },

  getGraphDto: () => {
    const { nodes, edges } = get()
    return {
      nodes: nodes.map((n) => ({
        id: n.id,
        kind:
          n.data.kind === "folder_input"
            ? { type: "folder_input" }
            : n.data.kind === "output_save"
            ? { type: "output_save" }
            : { type: "tool", tool_id: n.data.tool_id || (n.data.manifest as any)?.id || "resfinder" },
        title: n.data.title || n.data.label || "",
        inputs: n.data.inputs || [],
        outputs: n.data.outputs || [],
        params: n.data.params || {},
        position: [n.position.x, n.position.y],
      })),
      edges: edges.map((e) => ({
        id: e.id,
        source_node: e.source,
        source_port: e.sourceHandle || "",
        target_node: e.target,
        target_port: e.targetHandle || "",
      })),
    }
  },
}))
