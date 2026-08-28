import * as React from "react"
import { Handle, type HandleProps, Position } from "@xyflow/react"
import { cn } from "@/lib/utils"

export const BaseHandle = React.forwardRef<
  HTMLDivElement,
  HandleProps & {
    className?: string
    color?: string
  }
>(({ className, position, style, color, onMouseEnter, onMouseLeave, onPointerEnter, onPointerLeave, ...props }, ref) => {
  const [isHovered, setIsHovered] = React.useState(false)
  const isLeft = position === Position.Left
  const dotColor = color || "var(--primary)"

  // 1. Normal state: inner circle + outer translucent color ring
  const normalShadow = `0 0 0 3px ${dotColor}40`

  // 2. Hover state: inner circle unchanged + outer ring switches to solid contrast border (no hsl wrapper on oklch tokens)
  const hoverShadow = `0 0 0 3px var(--foreground)`

  return (
    <Handle
      ref={ref}
      position={position}
      style={{
        width: "12px",
        height: "12px",
        top: "calc(50% - 6px)",
        left: isLeft ? "-6px" : undefined,
        right: !isLeft ? "-6px" : undefined,
        backgroundColor: dotColor,
        boxShadow: isHovered ? hoverShadow : normalShadow,
        transform: "none",
        ...style,
      }}
      className={cn(
        "!size-3 !rounded-full !border-0 !z-30 cursor-crosshair transition-all duration-150 select-none",
        // Extended invisible hit area for effortless drag/connect
        "before:absolute before:-inset-2 before:rounded-full before:content-[''] before:bg-transparent",
        className
      )}
      onPointerEnter={(e) => {
        setIsHovered(true)
        onPointerEnter?.(e)
      }}
      onPointerLeave={(e) => {
        setIsHovered(false)
        onPointerLeave?.(e)
      }}
      onMouseEnter={(e) => {
        setIsHovered(true)
        onMouseEnter?.(e)
      }}
      onMouseLeave={(e) => {
        setIsHovered(false)
        onMouseLeave?.(e)
      }}
      {...props}
    />
  )
})

BaseHandle.displayName = "BaseHandle"
