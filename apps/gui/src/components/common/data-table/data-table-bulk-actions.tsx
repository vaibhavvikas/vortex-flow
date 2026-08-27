"use client"

import * as React from "react"
import type { Table } from "@tanstack/react-table"
import { X } from "lucide-react"
import {
  ActionBar,
  ActionBarSelection,
  ActionBarClose,
  ActionBarSeparator,
  ActionBarGroup,
} from "@/components/ui/action-bar"

export interface DataTableBulkActionsProps<TData> {
  table: Table<TData>
  entityName?: string
  children: React.ReactNode
}

export function DataTableBulkActions<TData>({
  table,
  children,
}: DataTableBulkActionsProps<TData>) {
  const selectedRows = (table.getFilteredSelectedRowModel?.() ?? table.getSelectedRowModel?.())?.rows ?? []
  const selectedCount = selectedRows.length

  const handleOpenChange = React.useCallback(
    (open: boolean) => {
      if (!open) {
        table.resetRowSelection()
      }
    },
    [table]
  )

  if (selectedCount === 0) return null

  return (
    <ActionBar open={selectedCount > 0} onOpenChange={handleOpenChange} sideOffset={48}>
      <ActionBarSelection>
        {selectedCount} selected
        <ActionBarSeparator />
        <ActionBarClose>
          <X className="size-3.5" />
        </ActionBarClose>
      </ActionBarSelection>

      <ActionBarSeparator />

      <ActionBarGroup>{children}</ActionBarGroup>
    </ActionBar>
  )
}
