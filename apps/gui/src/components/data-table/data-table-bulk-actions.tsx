import * as React from "react"
import type { Table } from "@tanstack/react-table"
import { X } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"

export interface DataTableBulkActionsProps<TData> {
  table: Table<TData>
  entityName?: string
  children: React.ReactNode
}

export function DataTableBulkActions<TData>({
  table,
  entityName = "item",
  children,
}: DataTableBulkActionsProps<TData>) {
  const selectedRows = table.getFilteredSelectedRowModel().rows
  const selectedCount = selectedRows.length

  // Clear selection on Escape key
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        table.resetRowSelection()
      }
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [table])

  if (selectedCount === 0) return null

  return (
    <TooltipProvider>
      <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-40 animate-in fade-in-0 slide-in-from-bottom-4 duration-200">
        <div className="bg-card/95 backdrop-blur-md border border-border/80 shadow-2xl rounded-2xl p-1.5 px-2 flex items-center gap-2 transition-all duration-200 ease-out hover:scale-105 hover:shadow-primary/10 hover:border-primary/40">
          {/* Close button with circular border */}
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="outline"
                  size="icon"
                  className="size-7 rounded-full border-border/70 text-muted-foreground hover:text-foreground cursor-pointer"
                  onClick={() => table.resetRowSelection()}
                  aria-label="Clear selection (Esc)"
                />
              }
            >
              <X className="size-3.5" />
            </TooltipTrigger>
            <TooltipContent>
              <p>Clear selection (Esc)</p>
            </TooltipContent>
          </Tooltip>

          <div className="h-4 w-px bg-border/60" />

          {/* White pill with count + text */}
          <div className="flex items-center gap-1.5 px-0.5">
            <span className="bg-foreground text-background font-bold text-xs px-2.5 py-0.5 rounded-full font-mono shadow-xs">
              {selectedCount}
            </span>
            <span className="text-xs font-medium text-foreground tracking-tight whitespace-nowrap">
              {entityName}{selectedCount > 1 ? "s" : ""} selected
            </span>
          </div>

          <div className="h-4 w-px bg-border/60" />

          {/* Action icon buttons */}
          <div className="flex items-center gap-1.5">{children}</div>
        </div>
      </div>
    </TooltipProvider>
  )
}
