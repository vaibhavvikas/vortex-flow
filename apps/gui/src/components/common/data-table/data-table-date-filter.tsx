"use client"

import type { Column } from "@tanstack/react-table"
import { Input } from "@/components/ui/input"

interface DataTableDateFilterProps<TData, TValue> {
  column: Column<TData, TValue>
  title?: string
  multiple?: boolean
}

export function DataTableDateFilter<TData, TValue>({
  column,
  title,
}: DataTableDateFilterProps<TData, TValue>) {
  return (
    <Input
      type="date"
      placeholder={title}
      value={(column.getFilterValue() as string) ?? ""}
      onChange={(e) => column.setFilterValue(e.target.value || undefined)}
      className="h-8 w-36"
    />
  )
}
