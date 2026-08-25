import * as React from "react"
import {
  useReactTable,
  getCoreRowModel,
  getPaginationRowModel,
  getFilteredRowModel,
  flexRender,
  type ColumnDef,
} from "@tanstack/react-table"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Trash2,
  Download,
  Bookmark,
  Play,
  SlidersHorizontal,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
} from "lucide-react"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { DataTableBulkActions } from "@/components/data-table"
import { useSearchStore } from "@/stores/search-store"
import type { SraRecord } from "@/services/sra-service"

interface ExploreCollectionTabProps {
  collection: SraRecord[]
  onRemoveFromCollection: (ids: string[]) => void
  onSelectRecord?: (record: SraRecord, db: string) => void
}

const columnLabelMap: Record<string, string> = {
  accession: "Accession",
  title: "Description",
  organism: "Organism",
  platform: "Platform",
  total_spots: "Spots / Reads",
  actions: "Actions",
}

export function ExploreCollectionTab({
  collection,
  onRemoveFromCollection,
  onSelectRecord,
}: ExploreCollectionTabProps) {
  const collectionRowSelection = useSearchStore((s) => s.collectionRowSelection)
  const setCollectionRowSelection = useSearchStore((s) => s.setCollectionRowSelection)
  const columnVisibility = useSearchStore((s) => s.collectionColumnVisibility)
  const setColumnVisibility = useSearchStore((s) => s.setCollectionColumnVisibility)
  const [globalFilter, setGlobalFilter] = React.useState("")

  const columns = React.useMemo<ColumnDef<SraRecord>[]>(
    () => [
      {
        id: "select",
        size: 40,
        header: ({ table }) => (
          <div className="w-6 flex justify-center">
            <Checkbox
              checked={table.getIsAllPageRowsSelected()}
              onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
              aria-label="Select all"
            />
          </div>
        ),
        cell: ({ row }) => (
          <div className="w-6 flex justify-center">
            <Checkbox
              checked={row.getIsSelected()}
              onCheckedChange={(value) => row.toggleSelected(!!value)}
              aria-label="Select row"
            />
          </div>
        ),
        enableSorting: false,
        enableHiding: false,
      },
      {
        accessorKey: "accession",
        header: "Accession",
        size: 110,
        enableHiding: false,
        cell: ({ row }) => (
          <button
            type="button"
            className="font-mono text-xs font-semibold text-primary hover:underline cursor-pointer select-none text-left block"
            onClick={(e) => {
              e.stopPropagation()
              onSelectRecord?.(row.original, "sra")
            }}
          >
            {row.original.accession}
          </button>
        ),
      },
      {
        accessorKey: "title",
        header: "Description",
        cell: ({ row }) => (
          <div className="font-medium text-xs truncate" title={row.original.title}>
            {row.original.title}
          </div>
        ),
      },
      {
        accessorKey: "organism",
        header: "Organism",
        size: 135,
        enableHiding: false,
        cell: ({ row }) => (
          <span className="text-xs text-muted-foreground italic truncate block max-w-[125px]" title={row.original.organism}>
            {row.original.organism}
          </span>
        ),
      },
      {
        accessorKey: "platform",
        header: "Platform",
        size: 110,
        cell: ({ row }) => (
          <Badge variant="default" className="text-[10px] truncate max-w-[100px]">
            {row.original.platform}
          </Badge>
        ),
      },
      {
        accessorKey: "total_spots",
        header: "Spots / Reads",
        size: 105,
        cell: ({ row }) => <span className="text-xs font-mono truncate block">{row.original.total_spots}</span>,
      },
      {
        id: "actions",
        header: "Actions",
        size: 80,
        cell: ({ row }) => (
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon-xs"
              title="Download FASTQ Stream"
            >
              <Download className="size-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={() => onRemoveFromCollection([row.original.id])}
              title="Remove from Collection"
            >
              <Trash2 className="size-3.5 text-destructive" />
            </Button>
          </div>
        ),
      },
    ],
    [onRemoveFromCollection]
  )

  const table = useReactTable({
    data: collection,
    columns,
    state: {
      rowSelection: collectionRowSelection,
      columnVisibility,
      globalFilter,
    },
    getRowId: (row) => row.id,
    onRowSelectionChange: setCollectionRowSelection,
    onColumnVisibilityChange: setColumnVisibility,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  })

  const selectedRows = table.getSelectedRowModel().rows.map((r) => r.original)
  const selectedIds = selectedRows.map((r) => r.id)

  const handleRemoveSelected = () => {
    if (selectedIds.length === 0) return
    onRemoveFromCollection(selectedIds)
    setCollectionRowSelection({})
  }

  return (
    <div className="relative space-y-4">
      {/* Top Toolbar (shadcn-admin style) */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 flex-1 max-w-sm">
          <Input
            placeholder="Filter collection records..."
            value={globalFilter ?? ""}
            onChange={(e) => setGlobalFilter(e.target.value)}
            className="h-8 text-xs w-60 sm:w-72"
          />
        </div>

        <div className="flex items-center gap-2 ml-auto">
          <Badge variant="outline" className="h-8 text-xs font-normal text-muted-foreground px-2.5">
            <span className="font-semibold font-mono text-foreground mr-1">{collection.length}</span> items saved
          </Badge>

          <DropdownMenu>
            <DropdownMenuTrigger render={
              <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5 cursor-pointer" />
            }>
              <SlidersHorizontal className="size-3.5" />
              View
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-48" align="end">
              <DropdownMenuGroup>
                <DropdownMenuLabel>Toggle columns</DropdownMenuLabel>
                {table
                  .getAllColumns()
                  .filter((column) => column.getCanHide())
                  .map((column) => (
                    <DropdownMenuCheckboxItem
                      key={column.id}
                      className="capitalize"
                      checked={column.getIsVisible() ?? false}
                      onCheckedChange={(value) => column.toggleVisibility(!!value)}
                    >
                      {columnLabelMap[column.id] || column.id}
                    </DropdownMenuCheckboxItem>
                  ))}
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* TanStack Table */}
      <div className="border border-border rounded-lg overflow-hidden bg-card">
        <Table className="table-fixed w-full">
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => {
                  const size = header.column.columnDef.size
                  return (
                    <TableHead
                      key={header.id}
                      style={size ? { width: `${size}px` } : undefined}
                      className={header.id === "title" ? "w-auto" : ""}
                    >
                      {header.isPlaceholder
                        ? null
                        : flexRender(header.column.columnDef.header, header.getContext())}
                    </TableHead>
                  )
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  data-state={row.getIsSelected() && "selected"}
                  className="hover:bg-muted/50 transition-colors"
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-32 text-center text-muted-foreground">
                  <div className="space-y-1">
                    <Bookmark className="size-8 mx-auto text-muted-foreground/50" />
                    <p className="font-medium text-xs">No items in your collection yet.</p>
                    <p className="text-[11px] text-muted-foreground">
                      Search the NCBI SRA tab and click "Add to Collection" to save datasets for processing.
                    </p>
                  </div>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination Footer */}
      {collection.length > 0 && (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 px-2 py-1">
          <div className="text-xs text-muted-foreground">
            <span>
              {table.getFilteredRowModel().rows.length} of {collection.length} entries shown
            </span>
          </div>

          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon-sm"
              className="size-8"
              onClick={() => table.setPageIndex(0)}
              disabled={!table.getCanPreviousPage()}
              title="First page"
            >
              <ChevronsLeft className="size-4" />
            </Button>
            <Button
              variant="outline"
              size="icon-sm"
              className="size-8"
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
              title="Previous page"
            >
              <ChevronLeft className="size-4" />
            </Button>

            <div className="text-xs font-mono font-medium px-2 min-w-8 text-center">
              {table.getState().pagination.pageIndex + 1}
            </div>

            <Button
              variant="outline"
              size="icon-sm"
              className="size-8"
              onClick={() => table.nextPage()}
              disabled={!table.getCanNextPage()}
              title="Next page"
            >
              <ChevronRight className="size-4" />
            </Button>
            <Button
              variant="outline"
              size="icon-sm"
              className="size-8"
              onClick={() => table.setPageIndex(table.getPageCount() - 1)}
              disabled={!table.getCanNextPage()}
              title="Last page"
            >
              <ChevronsRight className="size-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Floating Bottom Selection Action Bar (shadcn-admin style) */}
      <DataTableBulkActions table={table} entityName="item">
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="outline"
                size="icon"
                className="size-8 rounded-lg cursor-pointer hover:border-primary/50"
                aria-label="Stage into Pipeline"
              >
                <Play className="size-4 text-primary" />
                <span className="sr-only">Stage into Pipeline</span>
              </Button>
            }
          />
          <TooltipContent>
            <p>Stage {selectedIds.length} selected dataset(s) into pipeline</p>
          </TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="outline"
                size="icon"
                className="size-8 rounded-lg cursor-pointer hover:border-primary/50"
                aria-label="Download FASTQ Stream"
              >
                <Download className="size-4" />
                <span className="sr-only">Download FASTQ Stream</span>
              </Button>
            }
          />
          <TooltipContent>
            <p>Download FASTQ Stream for {selectedIds.length} dataset(s)</p>
          </TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="destructive"
                size="icon"
                className="size-8 rounded-lg cursor-pointer shadow-xs"
                onClick={handleRemoveSelected}
                aria-label="Remove Selected"
              >
                <Trash2 className="size-4" />
                <span className="sr-only">Remove Selected</span>
              </Button>
            }
          />
          <TooltipContent>
            <p>Remove {selectedIds.length} item(s) from collection</p>
          </TooltipContent>
        </Tooltip>
      </DataTableBulkActions>
    </div>
  )
}
