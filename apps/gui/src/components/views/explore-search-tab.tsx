import * as React from "react"
import {
  useReactTable,
  getCoreRowModel,
  getPaginationRowModel,
  flexRender,
  type ColumnDef,
} from "@tanstack/react-table"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import { Skeleton } from "@/components/ui/skeleton"
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
  Search,
  BookmarkPlus,
  Copy,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  SlidersHorizontal,
} from "lucide-react"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { Spinner } from "@/components/ui/spinner"
import { DataTableBulkActions } from "@/components/data-table"
import { useSearchStore } from "@/stores/search-store"
import { useSraQuery, type SraRecord } from "@/hooks/use-sra-query"

export type { SraRecord }

const EMPTY_RECORDS: SraRecord[] = []
const INITIAL_TABLE_STATE = { pagination: { pageSize: 100 } }

const columnLabelMap: Record<string, string> = {
  accession: "Accession",
  title: "Description",
  organism: "Organism",
  platform: "Platform",
  total_spots: "Spots / Reads",
  release_date: "Release Date",
}

interface SearchFormProps {
  initialQuery: string
  onSubmit: (query: string) => void
  loading: boolean
}

function SearchForm({ initialQuery, onSubmit, loading }: SearchFormProps) {
  const [searchInput, setSearchInput] = React.useState(initialQuery)

  React.useEffect(() => {
    setSearchInput(initialQuery)
  }, [initialQuery])

  const handleSubmit = (e: React.SubmitEvent) => {
    e.preventDefault()
    if (!searchInput.trim()) return
    onSubmit(searchInput.trim())
  }

  return (
    <form onSubmit={handleSubmit} className="flex items-center gap-2 max-w-sm">
      <Input
        placeholder="Filter or search NCBI SRA..."
        value={searchInput}
        onChange={(e) => setSearchInput(e.target.value)}
        className="h-8 text-xs w-60 sm:w-72"
      />
      <Button type="submit" size="sm" disabled={loading} className="h-8 text-xs px-3">
        {loading ? <Spinner data-icon="inline-start" /> : <Search data-icon="inline-start" className="size-3.5" />}
        Search
      </Button>
    </form>
  )
}

export interface ExploreSearchTabProps {
  onAddToCollection: (records: SraRecord[]) => void
  onSelectRecord?: (record: SraRecord, db: string) => void
}

export function ExploreSearchTab({ onAddToCollection, onSelectRecord }: ExploreSearchTabProps) {
  const activeQuery = useSearchStore((s) => s.activeQuery)
  const activeDb = useSearchStore((s) => s.activeDb)
  const page = useSearchStore((s) => s.page)
  const setPage = useSearchStore((s) => s.setPage)
  const submitSearch = useSearchStore((s) => s.submitSearch)

  const searchRowSelection = useSearchStore((s) => s.searchRowSelection)
  const setSearchRowSelection = useSearchStore((s) => s.setSearchRowSelection)

  const columnVisibility = useSearchStore((s) => s.searchColumnVisibility)
  const setColumnVisibility = useSearchStore((s) => s.setSearchColumnVisibility)

  const { data: searchResponse, isLoading, isFetching } = useSraQuery(activeQuery, activeDb, page)

  const data = searchResponse?.records ?? EMPTY_RECORDS
  const totalCount = searchResponse?.total_count || 0
  const loading = isLoading || isFetching

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
              onSelectRecord?.(row.original, activeDb)
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
          <Badge
            variant={row.original.platform.includes("NANOPORE") ? "secondary" : "default"}
            className="text-[10px] truncate max-w-[100px]"
          >
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
        accessorKey: "release_date",
        header: "Release Date",
        size: 105,
        cell: ({ row }) => (
          <span className="text-xs text-muted-foreground font-mono truncate block">
            {row.original.release_date}
          </span>
        ),
      },
    ],
    []
  )

  const table = useReactTable({
    data,
    columns,
    state: {
      rowSelection: searchRowSelection,
      columnVisibility,
    },
    getRowId: (row) => row.id || row.accession,
    initialState: INITIAL_TABLE_STATE,
    onRowSelectionChange: setSearchRowSelection,
    onColumnVisibilityChange: setColumnVisibility,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  })

  const selectedRows = table.getSelectedRowModel().rows.map((r) => r.original)

  const handleAddSelectedToCollection = () => {
    if (selectedRows.length === 0) return
    onAddToCollection(selectedRows)
    setSearchRowSelection({})
  }

  const totalPages = Math.ceil(totalCount / 100) || 1

  return (
    <div className="relative space-y-4">
      {/* Top Toolbar (shadcn-admin style) */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <SearchForm
            initialQuery={activeQuery}
            onSubmit={(query) => submitSearch(query, "sra")}
            loading={loading}
          />

          {totalCount > 0 && (
            <Badge variant="outline" className="h-8 text-xs font-normal text-muted-foreground px-2.5">
              <span className="font-semibold font-mono text-foreground mr-1">
                {totalCount.toLocaleString()}
              </span>
              entries
            </Badge>
          )}
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger render={
            <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5 ml-auto cursor-pointer" />
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

      {/* TanStack Results Table */}
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
            {loading ? (
              Array.from({ length: 6 }).map((_, idx) => (
                <TableRow key={`skeleton-row-${idx}`}>
                  <TableCell className="w-10"><Skeleton className="h-4 w-4 rounded" /></TableCell>
                  <TableCell className="w-28"><Skeleton className="h-4 w-20 font-mono" /></TableCell>
                  <TableCell className="w-auto"><Skeleton className="h-4 w-full" /></TableCell>
                  <TableCell className="w-32"><Skeleton className="h-4 w-24 italic" /></TableCell>
                  <TableCell className="w-28"><Skeleton className="h-4 w-20" /></TableCell>
                  <TableCell className="w-28"><Skeleton className="h-4 w-16" /></TableCell>
                  <TableCell className="w-28"><Skeleton className="h-4 w-20" /></TableCell>
                </TableRow>
              ))
            ) : table.getRowModel().rows?.length ? (
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
                <TableCell colSpan={columns.length} className="h-32 text-center text-muted-foreground text-xs">
                  {activeQuery
                    ? `No SRA records found for "${activeQuery}".`
                    : "Enter a search query above to search NCBI SRA datasets."}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination Footer (shadcn-admin style) */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 px-2 py-1">
        <div className="text-xs text-muted-foreground">
          {totalCount > 0 ? (
            <span>
              Page <span className="font-semibold text-foreground">{page}</span> of{" "}
              <span className="font-semibold text-foreground">{totalPages}</span> (
              <span className="font-mono font-medium text-foreground">{totalCount.toLocaleString()}</span> entries)
            </span>
          ) : (
            <span>0 entries</span>
          )}
        </div>

        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="icon-sm"
            className="size-8"
            onClick={() => setPage(1)}
            disabled={page <= 1 || loading}
            title="First page"
          >
            <ChevronsLeft className="size-4" />
          </Button>
          <Button
            variant="outline"
            size="icon-sm"
            className="size-8"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1 || loading}
            title="Previous page"
          >
            <ChevronLeft className="size-4" />
          </Button>

          <div className="text-xs font-mono font-medium px-2 min-w-8 text-center">
            {page}
          </div>

          <Button
            variant="outline"
            size="icon-sm"
            className="size-8"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages || loading}
            title="Next page"
          >
            <ChevronRight className="size-4" />
          </Button>
          <Button
            variant="outline"
            size="icon-sm"
            className="size-8"
            onClick={() => setPage(totalPages)}
            disabled={page >= totalPages || loading}
            title="Last page"
          >
            <ChevronsRight className="size-4" />
          </Button>
        </div>
      </div>

      {/* Floating Bottom Selection Action Bar (shadcn-admin style) */}
      <DataTableBulkActions table={table} entityName="dataset">
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="outline"
                size="icon"
                className="size-8 rounded-lg cursor-pointer hover:border-primary/50"
                onClick={() => {
                  const accessions = selectedRows.map((r) => r.accession).join("\n")
                  navigator.clipboard.writeText(accessions)
                }}
                aria-label="Copy Accessions"
              >
                <Copy className="size-4" />
                <span className="sr-only">Copy Accessions</span>
              </Button>
            }
          />
          <TooltipContent>
            <p>Copy {selectedRows.length} accession(s) to clipboard</p>
          </TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="default"
                size="icon"
                className="size-8 rounded-lg cursor-pointer shadow-xs"
                onClick={handleAddSelectedToCollection}
                aria-label="Add to Collection"
              >
                <BookmarkPlus className="size-4" />
                <span className="sr-only">Add to Collection</span>
              </Button>
            }
          />
          <TooltipContent>
            <p>Save {selectedRows.length} selected dataset(s) to collection</p>
          </TooltipContent>
        </Tooltip>
      </DataTableBulkActions>
    </div>
  )
}
