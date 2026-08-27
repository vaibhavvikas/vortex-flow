"use client"

import type { Column } from "@tanstack/react-table"
import { Input } from "@/components/ui/input"

interface DataTableSliderFilterProps<TData, TValue> {
  column: Column<TData, TValue>
  title?: string
}

export function DataTableSliderFilter<TData, TValue>({
  column,
  title,
}: DataTableSliderFilterProps<TData, TValue>) {
  const filterValue = (column.getFilterValue() as [number, number]) ?? [0, 100]

  return (
    <div className="flex items-center gap-1.5">
      <Input
        type="number"
        placeholder={`Min ${title}`}
        value={filterValue[0] ?? ""}
        onChange={(e) =>
          column.setFilterValue([
            e.target.value ? Number(e.target.value) : undefined,
            filterValue[1],
          ])
        }
        className="h-8 w-24"
      />
      <span className="text-sm text-muted-foreground">-</span>
      <Input
        type="number"
        placeholder={`Max ${title}`}
        value={filterValue[1] ?? ""}
        onChange={(e) =>
          column.setFilterValue([
            filterValue[0],
            e.target.value ? Number(e.target.value) : undefined,
          ])
        }
        className="h-8 w-24"
      />
    </div>
  )
}
