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
          "relative flex flex-col w-[320px] rounded-xl border bg-card text-card-foreground shadow-xs transition-colors duration-150 select-none",
          selected ? "border-primary ring-[0.75px] ring-primary shadow-sm" : "border-border hover:border-muted-foreground/40",
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
