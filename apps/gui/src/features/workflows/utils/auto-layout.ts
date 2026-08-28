import dagre from "@dagrejs/dagre"
import type { Node, Edge } from "@xyflow/react"
import type { WorkflowNodeData } from "../types"

const DEFAULT_NODE_WIDTH = 320
const NODE_SEP = 60  // Vertical spacing between sibling nodes in the same column
const RANK_SEP = 120 // Horizontal spacing between pipeline stages

/**
 * Estimates realistic node card height based on sockets and parameter inputs
 */
function estimateNodeHeight(node: Node<WorkflowNodeData>): number {
  if (node.measured?.height && node.measured.height > 60) {
    return node.measured.height
  }
  const socketCount = Math.max(
    node.data.inputs?.length || 0,
    node.data.outputs?.length || 0
  )
  const paramCount = Object.keys(node.data.params || {}).length
  const headerHeight = 72
  const socketsHeight = socketCount > 0 ? socketCount * 32 + 12 : 0
  const paramsHeight = paramCount * 54
  const padding = 20

  return Math.max(160, headerHeight + socketsHeight + paramsHeight + padding)
}

/**
 * Calculates the exact vertical Y offset of a source socket handle within a node card
 */
function getSourceHandleOffsetY(node: Node<WorkflowNodeData>, handleId?: string | null): number {
  if (!handleId || !node.data.outputs || node.data.outputs.length === 0) {
    return estimateNodeHeight(node) / 2
  }
  const index = node.data.outputs.findIndex((p) => p.id === handleId)
  if (index === -1) {
    return estimateNodeHeight(node) / 2
  }
  const headerHeight = 72
  const handleItemHeight = 32
  return headerHeight + index * handleItemHeight + 16
}

/**
 * Automatically calculates optimal Dagre DAG coordinates for React Flow nodes and edges.
 * Features:
 * 1. Port-aware sorting: Eliminates crossing edges by ordering sibling targets based on socket vertical index.
 * 2. Accurate card height estimation: Prevents overlapping tall nodes (like ResFinder).
 * 3. Balanced Rank Centering: Vertically centers multi-node columns relative to pipeline midline.
 */
export function getLayoutedElements(
  nodes: Node<WorkflowNodeData>[],
  edges: Edge[],
  direction: "LR" | "TB" = "LR"
): { nodes: Node<WorkflowNodeData>[]; edges: Edge[] } {
  if (nodes.length === 0) {
    return { nodes, edges }
  }

  // 1. Initialize Dagre graph
  const dagreGraph = new dagre.graphlib.Graph()
  dagreGraph.setDefaultEdgeLabel(() => ({}))

  dagreGraph.setGraph({
    rankdir: direction,
    nodesep: NODE_SEP,
    ranksep: RANK_SEP,
    align: undefined, // Let Dagre balance ranks
    ranker: "network-simplex",
  })

  // 2. Register nodes with accurate estimated dimensions
  const nodeDimensions = new Map<string, { width: number; height: number }>()
  nodes.forEach((node) => {
    const width = node.measured?.width || DEFAULT_NODE_WIDTH
    const height = estimateNodeHeight(node)
    nodeDimensions.set(node.id, { width, height })
    dagreGraph.setNode(node.id, { width, height })
  })

  // 3. Register edges
  edges.forEach((edge) => {
    dagreGraph.setEdge(edge.source, edge.target)
  })

  // 4. Run Dagre topological layout to determine rank columns
  dagre.layout(dagreGraph)

  // 5. Group nodes into ranks by Dagre-assigned X position
  const rankMap = new Map<number, Node<WorkflowNodeData>[]>()
  nodes.forEach((node) => {
    const dagreNode = dagreGraph.node(node.id)
    if (!dagreNode) return

    // Cluster X coordinates into rank buckets (within 40px)
    let matchedRankX: number | null = null
    for (const rankX of rankMap.keys()) {
      if (Math.abs(rankX - dagreNode.x) < 40) {
        matchedRankX = rankX
        break
      }
    }

    const key = matchedRankX !== null ? matchedRankX : Math.round(dagreNode.x)
    const list = rankMap.get(key) || []
    list.push(node)
    rankMap.set(key, list)
  })

  // Sort ranks from Left to Right
  const sortedRanks = Array.from(rankMap.entries())
    .sort(([x1], [x2]) => x1 - x2)
    .map(([, rankNodes]) => rankNodes)

  // 6. Perform Port-Aware Cross-Minimization and Column Stacking
  const placedPositions = new Map<string, { x: number; y: number }>()
  let currentRankX = 50

  // Calculate global pipeline vertical center
  const rankTotalHeights: number[] = []
  sortedRanks.forEach((rankNodes) => {
    const totalH =
      rankNodes.reduce((sum, n) => sum + (nodeDimensions.get(n.id)?.height || 200), 0) +
      Math.max(0, rankNodes.length - 1) * NODE_SEP
    rankTotalHeights.push(totalH)
  })
  const maxPipelineHeight = Math.max(...rankTotalHeights, 400)
  const targetMidlineY = maxPipelineHeight / 2

  sortedRanks.forEach((rankNodes, rankIdx) => {
    const rankWidth = Math.max(
      ...rankNodes.map((n) => nodeDimensions.get(n.id)?.width || DEFAULT_NODE_WIDTH)
    )

    if (rankIdx === 0) {
      // First rank (e.g. Folder Inputs): Stack cleanly centered around target midline
      const totalHeight = rankTotalHeights[0]
      let currentY = targetMidlineY - totalHeight / 2

      rankNodes.forEach((node) => {
        const h = nodeDimensions.get(node.id)?.height || 200
        placedPositions.set(node.id, { x: currentRankX, y: Math.round(currentY) })
        currentY += h + NODE_SEP
      })
    } else {
      // Subsequent ranks: Sort nodes by average incoming source handle Y position
      const scoredNodes = rankNodes.map((node) => {
        const incomingEdges = edges.filter((e) => e.target === node.id)
        if (incomingEdges.length === 0) {
          const dagreY = dagreGraph.node(node.id)?.y ?? targetMidlineY
          return { node, idealY: dagreY }
        }

        // Calculate average Y position of all source ports feeding into this node
        let sourceYSum = 0
        let count = 0
        incomingEdges.forEach((e) => {
          const srcPos = placedPositions.get(e.source)
          const srcNode = nodes.find((n) => n.id === e.source)
          if (srcPos && srcNode) {
            const handleOffsetY = getSourceHandleOffsetY(srcNode, e.sourceHandle)
            sourceYSum += srcPos.y + handleOffsetY
            count++
          }
        })

        const idealY = count > 0 ? sourceYSum / count : targetMidlineY
        return { node, idealY }
      })

      // Sort nodes ascending so top source sockets connect to top target nodes (zero crossings!)
      scoredNodes.sort((a, b) => a.idealY - b.idealY)

      const totalHeight =
        scoredNodes.reduce(
          (sum, sn) => sum + (nodeDimensions.get(sn.node.id)?.height || 200),
          0
        ) + Math.max(0, scoredNodes.length - 1) * NODE_SEP

      // Center this column around the average ideal Y of its nodes
      const avgIdealY =
        scoredNodes.reduce((sum, sn) => sum + sn.idealY, 0) / scoredNodes.length
      let startY = Math.max(20, avgIdealY - totalHeight / 2)

      scoredNodes.forEach(({ node }) => {
        const h = nodeDimensions.get(node.id)?.height || 200
        placedPositions.set(node.id, { x: currentRankX, y: Math.round(startY) })
        startY += h + NODE_SEP
      })
    }

    currentRankX += rankWidth + RANK_SEP
  })

  // 7. Output layouted nodes with final uncrossed, centered coordinates
  const layoutedNodes = nodes.map((node) => {
    const pos = placedPositions.get(node.id) || { x: 50, y: 50 }
    return {
      ...node,
      position: pos,
    }
  })

  return { nodes: layoutedNodes, edges }
}
