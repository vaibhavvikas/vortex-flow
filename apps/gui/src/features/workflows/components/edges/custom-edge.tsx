import * as React from "react"
import {
  BaseEdge,
  type EdgeProps,
  getBezierPath,
  Position,
  EdgeLabelRenderer,
} from "@xyflow/react"
import { Trash2 } from "lucide-react"
import { useWorkflowStore } from "../../stores/workflow-store"
import { cn } from "@/lib/utils"

export const CustomWorkflowEdge = React.memo(function CustomWorkflowEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition = Position.Right,
  targetPosition = Position.Left,
  style = {},
  markerEnd,
  selected,
  ...props
}: EdgeProps) {
  const [isHovered, setIsHovered] = React.useState(false)
  const setEdges = useWorkflowStore((s) => s.setEdges)

  // Direct bezier path from exact sourceHandle to targetHandle coordinates
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetPosition,
    targetX,
    targetY,
  })

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation()
    setEdges((edges) => edges.filter((edge) => edge.id !== id))
  }

  const defaultStrokeColor = (style?.stroke as string) || "hsl(var(--muted-foreground) / 0.5)"
  const activeStrokeColor = (style?.stroke as string) || "hsl(var(--primary))"

  return (
    <>
      {/* Invisible wider interaction path for effortless hover/click targeting */}
      <path
        d={edgePath}
        fill="none"
        stroke="transparent"
        strokeWidth={20}
        className="cursor-pointer"
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      />

      {/* Rendered Langflow Bezier Edge */}
      <BaseEdge
        path={edgePath}
        markerEnd={markerEnd}
        style={{
          ...style,
          stroke: selected || isHovered ? activeStrokeColor : defaultStrokeColor,
          strokeWidth: selected || isHovered ? 2.5 : 2,
          filter:
            selected || isHovered
              ? `drop-shadow(0 0 6px ${activeStrokeColor})`
              : undefined,
          transition: "stroke 0.15s ease, stroke-width 0.15s ease",
        }}
        {...props}
      />

      {/* Floating Center Action Button on Hover/Select */}
      <EdgeLabelRenderer>
        <div
          style={{
            position: "absolute",
            transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
            pointerEvents: isHovered || selected ? "all" : "none",
            zIndex: 40,
          }}
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
          className={cn(
            "transition-all duration-150 flex items-center justify-center",
            isHovered || selected
              ? "opacity-100 scale-100"
              : "opacity-0 scale-75 pointer-events-none"
          )}
        >
          <button
            type="button"
            onClick={handleDelete}
            title="Delete Connection"
            className="size-6 rounded-full bg-background border border-border shadow-md flex items-center justify-center text-muted-foreground hover:text-destructive-foreground hover:bg-destructive hover:border-destructive transition-all cursor-pointer"
          >
            <Trash2 className="size-3" />
          </button>
        </div>
      </EdgeLabelRenderer>
    </>
  )
})
