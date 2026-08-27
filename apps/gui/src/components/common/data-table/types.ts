import type { RowData } from "@tanstack/react-table"

export interface Option {
  label: string
  value: string
  icon?: React.ComponentType<{ className?: string }>
}

declare module "@tanstack/react-table" {
  interface ColumnMeta<TData extends RowData, TValue> {
    label?: string
    placeholder?: string
    variant?: "text" | "number" | "range" | "date" | "dateRange" | "select" | "multiSelect"
    unit?: string
    options?: Option[]
  }
}
