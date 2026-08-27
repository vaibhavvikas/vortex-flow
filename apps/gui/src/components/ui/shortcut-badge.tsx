import * as React from "react"
import { cn } from "@/lib/utils"

export interface ShortcutBadgeProps extends React.ComponentProps<"span"> {
  count?: number | string
}

export function ShortcutBadge({
  count,
  children,
  className,
  ...props
}: ShortcutBadgeProps) {
  const displayValue = count !== undefined ? String(count) : children

  return (
    <span
      data-slot="shortcut-badge"
      className={cn(
        "pointer-events-none inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-md border border-input bg-background px-1 font-mono text-[0.625rem] font-medium text-muted-foreground shadow-2xs tabular-nums select-none",
        className
      )}
      {...props}
    >
      {displayValue}
    </span>
  )
}
