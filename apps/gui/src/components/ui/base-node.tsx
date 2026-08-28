import * as React from "react"
import { cn } from "@/lib/utils"

export interface BaseNodeProps extends React.HTMLAttributes<HTMLDivElement> {
  selected?: boolean
}

export const BaseNode = React.forwardRef<HTMLDivElement, BaseNodeProps>(
  ({ className, selected, children, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          "relative flex flex-col w-[320px] rounded-2xl border border-border/70 bg-card/95 backdrop-blur-md text-card-foreground shadow-sm transition-all duration-150 select-none",
          selected && "ring-2 ring-primary/80 border-primary shadow-lg shadow-primary/10",
          className
        )}
        {...props}
      >
        {children}
      </div>
    )
  }
)

BaseNode.displayName = "BaseNode"
