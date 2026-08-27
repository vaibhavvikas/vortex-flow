import * as React from "react"
import {
  useReactTable,
  getCoreRowModel,
  getFilteredRowModel,
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
  Search,
  BookmarkPlus,
  Copy,
  Database,
  ChevronDown,
  Check,
} from "lucide-react"
import { Spinner } from "@/components/ui/spinner"
import { toast } from "sonner"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { DataTableBulkActions, DataTableToolbar, DataTablePagination, ActionBarItem } from "@/components/common/data-table"
import { useSearchStore } from "../stores/search-store"
import { useSraQuery, type SraRecord } from "../hooks/use-sra-query"

export type { SraRecord }

const EMPTY_RECORDS: SraRecord[] = []

const DB_OPTIONS: { id: string; label: string; placeholder: string }[] = [
  { id: "sra", label: "SRA (Sequencing Runs)", placeholder: "Search NCBI SRA (e.g. SRR1448794, RNA-Seq)..." },
  { id: "assembly", label: "Assemblies (GCF / GCA)", placeholder: "Search NCBI Assemblies (e.g. GCF_000001405, Homo sapiens)..." },
]

interface SearchFormProps {
  initialQuery: string
  activeDb: string
  onDbChange: (db: string) => void
  onSubmit: (query: string, db: string) => void
  loading: boolean
}

function SearchForm({ initialQuery, activeDb, onDbChange, onSubmit, loading }: SearchFormProps) {
  const [searchInput, setSearchInput] = React.useState(initialQuery)

  React.useEffect(() => {
    setSearchInput(initialQuery)
  }, [initialQuery])

  const currentOption = DB_OPTIONS.find((opt) => opt.id === activeDb) || DB_OPTIONS[0]

  const handleSubmit = (e: React.SubmitEvent) => {
    e.preventDefault()
    if (!searchInput.trim()) return
    onSubmit(searchInput.trim(), activeDb)
  }

  return (
    <form onSubmit={handleSubmit} className="flex items-center gap-2">
      {/* Database Selector Dropdown */}
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="outline"
              size="sm"
              type="button"
              className="h-8 gap-1.5 px-2.5 font-medium cursor-pointer"
            />
          }
        >
          <Database className="size-3.5 text-primary" />
          <span className="max-w-[140px] truncate">{currentOption.label}</span>
          <ChevronDown className="size-3 text-muted-foreground" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-60">
          <DropdownMenuGroup>
            <DropdownMenuLabel className="text-xs text-muted-foreground uppercase font-semibold">
              NCBI Database
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            {DB_OPTIONS.map((opt) => (
              <DropdownMenuItem
                key={opt.id}
                onClick={() => {
                  onDbChange(opt.id)
                  if (searchInput.trim()) {
                    onSubmit(searchInput.trim(), opt.id)
                  }
                }}
                className="cursor-pointer flex items-center justify-between py-1.5"
              >
                <span>{opt.label}</span>
                {activeDb === opt.id && <Check className="size-3.5 text-primary" />}
              </DropdownMenuItem>
            ))}
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>

      <Input
        placeholder={currentOption.placeholder}
        value={searchInput}
        onChange={(e) => setSearchInput(e.target.value)}
        className="h-8 w-64 sm:w-80"
      />
      <Button type="submit" size="sm" disabled={loading} className="h-8 px-3 cursor-pointer">
        {loading ? <Spinner data-icon="inline-start" /> : <Search data-icon="inline-start" className="size-3.5" />}
        Search
      </Button>
    </form>
  )
}

function renderMutedValue(val?: string | null): React.ReactNode {
  if (!val || !val.trim()) return <span className="text-muted-foreground/35 font-mono select-none">—</span>
  const clean = val.trim().toLowerCase()
  if (clean === "n/a" || clean === "na" || clean === "missing" || clean === "unknown" || clean === "none") {
    return <span className="text-muted-foreground/35 font-mono select-none">—</span>
  }
  return val
}

function formatDate(rawDate?: string): React.ReactNode {
  if (!rawDate || !rawDate.trim()) return <span className="text-muted-foreground/35 font-mono select-none">—</span>
  const text = rawDate.trim()
  const clean = text.split(" ")[0].split("T")[0]

  if (
    clean === "0001/01/01" ||
    clean === "0001-01-01" ||
    clean.startsWith("0001") ||
    clean.startsWith("0000") ||
    clean === "01/01/01" ||
    clean === "1/01/01" ||
    clean === "01/01/0001" ||
    clean.startsWith("1970") ||
    clean.toLowerCase() === "n/a" ||
    clean.toLowerCase() === "na" ||
    clean.toLowerCase() === "null" ||
    clean === "-"
  ) {
    return <span className="text-muted-foreground/35 font-mono select-none">—</span>
  }

  const sep = clean.includes("/") ? "/" : clean.includes("-") ? "-" : clean.includes(".") ? "." : null
  if (sep) {
    const parts = clean.split(sep)
    if (parts.length === 3) {
      let y = parts[0]
      let m = parts[1]
      let d = parts[2]
      if (d.length === 4) {
        const temp = y
        y = d
        d = temp
      }
      const yearNum = parseInt(y, 10)
      if (yearNum >= 1970 && yearNum < 2100) {
        return `${d.padStart(2, "0")}/${m.padStart(2, "0")}/${yearNum}`
      }
      return <span className="text-muted-foreground/35 font-mono select-none">—</span>
    }
  }

  return <span className="text-muted-foreground/35 font-mono select-none">—</span>
}

export interface ExploreSearchTabProps {
  onAddToCollection: (records: SraRecord[]) => void
  onSelectRecord?: (record: SraRecord, db: string) => void
}

export function ExploreSearchTab({ onAddToCollection, onSelectRecord }: ExploreSearchTabProps) {
  const activeQuery = useSearchStore((s) => s.activeQuery)
  const activeDb = useSearchStore((s) => s.activeDb)
  const setActiveDb = useSearchStore((s) => s.setActiveDb)
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
  const totalPages = Math.ceil(totalCount / 100) || 1
  const loading = isLoading || isFetching

  const setSelectedRecord = useSearchStore((s) => s.setSelectedRecord)
  const isAssembly = activeDb === "assembly"

  const sraColumns = React.useMemo<ColumnDef<SraRecord>[]>(
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
        meta: { label: "Accession" },
        cell: ({ row }) => (
          <button
            type="button"
            className="font-mono text-sm font-semibold text-primary hover:underline cursor-pointer select-none text-left block tabular-nums"
            onClick={(e) => {
              e.stopPropagation()
              setSelectedRecord(row.original, activeDb)
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
        meta: { label: "Description" },
        cell: ({ row }) => (
          <div className="font-medium text-sm truncate" title={row.original.title}>
            {renderMutedValue(row.original.title)}
          </div>
        ),
      },
      {
        accessorKey: "organism",
        header: "Organism",
        size: 140,
        enableHiding: false,
        meta: { label: "Organism" },
        cell: ({ row }) => (
          <span className="text-sm text-muted-foreground italic truncate block max-w-[130px]" title={row.original.organism}>
            {renderMutedValue(row.original.organism)}
          </span>
        ),
      },
      {
        accessorKey: "platform",
        header: "Platform",
        size: 120,
        meta: { label: "Platform" },
        cell: ({ row }) => (
          <span className="text-sm truncate block" title={row.original.platform}>
            {renderMutedValue(row.original.platform)}
          </span>
        ),
      },
      {
        accessorKey: "total_spots",
        header: "Spots / Reads",
        size: 105,
        meta: { label: "Spots / Reads" },
        cell: ({ row }) => (
          <span className="text-sm font-mono tabular-nums truncate block">
            {renderMutedValue(row.original.total_spots)}
          </span>
        ),
      },
      {
        accessorKey: "total_bases",
        header: "Bases",
        size: 105,
        meta: { label: "Bases" },
        cell: ({ row }) => (
          <span className="text-sm font-mono tabular-nums text-muted-foreground truncate block">
            {renderMutedValue(row.original.total_bases)}
          </span>
        ),
      },
      {
        accessorKey: "release_date",
        header: "Release Date",
        size: 105,
        meta: { label: "Release Date" },
        cell: ({ row }) => (
          <span className="text-sm text-muted-foreground font-mono tabular-nums truncate block">
            {formatDate(row.original.release_date)}
          </span>
        ),
      },
    ],
    [activeDb, onSelectRecord, setSelectedRecord]
  )

  const assemblyColumns = React.useMemo<ColumnDef<SraRecord>[]>(
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
        size: 140,
        enableHiding: false,
        meta: { label: "Accession" },
        cell: ({ row }) => (
          <button
            type="button"
            className="font-mono text-sm font-semibold text-primary hover:underline cursor-pointer select-none text-left block tabular-nums"
            onClick={(e) => {
              e.stopPropagation()
              setSelectedRecord(row.original, activeDb)
              onSelectRecord?.(row.original, activeDb)
            }}
          >
            {row.original.accession}
          </button>
        ),
      },
      {
        accessorKey: "title",
        header: "Identifier",
        size: 140,
        meta: { label: "Identifier" },
        cell: ({ row }) => {
          const val = row.original.instrument_model || row.original.title
          return (
            <div className="font-mono text-xs font-semibold tabular-nums text-foreground/90 truncate max-w-[130px]" title={val}>
              {renderMutedValue(val)}
            </div>
          )
        },
      },
      {
        accessorKey: "organism",
        header: "Organism",
        size: 160,
        enableHiding: false,
        meta: { label: "Organism" },
        cell: ({ row }) => (
          <span className="text-sm text-muted-foreground italic truncate block max-w-[150px]" title={row.original.organism}>
            {renderMutedValue(row.original.organism)}
          </span>
        ),
      },
      {
        accessorKey: "platform",
        header: "Assembly Level",
        size: 130,
        meta: { label: "Assembly Level" },
        cell: ({ row }) => (
          <span className="text-sm truncate block" title={row.original.platform}>
            {renderMutedValue(row.original.platform)}
          </span>
        ),
      },
      {
        accessorKey: "total_bases",
        header: "Genome Size",
        size: 110,
        meta: { label: "Genome Size" },
        cell: ({ row }) => (
          <span className="text-sm font-mono tabular-nums text-muted-foreground truncate block">
            {renderMutedValue(row.original.total_bases)}
          </span>
        ),
      },
      {
        accessorKey: "release_date",
        header: "Release Date",
        size: 105,
        meta: { label: "Release Date" },
        cell: ({ row }) => (
          <span className="text-sm text-muted-foreground font-mono tabular-nums truncate block">
            {formatDate(row.original.release_date)}
          </span>
        ),
      },
    ],
    [activeDb, onSelectRecord, setSelectedRecord]
  )

  const columns = isAssembly ? assemblyColumns : sraColumns

  const table = useReactTable({
    data,
    columns,
    pageCount: totalPages,
    manualPagination: true,
    state: {
      rowSelection: searchRowSelection,
      columnVisibility,
      pagination: {
        pageIndex: page - 1,
        pageSize: 100,
      },
    },
    getRowId: (row) => row.id || row.accession,
    onRowSelectionChange: setSearchRowSelection,
    onColumnVisibilityChange: setColumnVisibility,
    onPaginationChange: (updater) => {
      const nextPagination =
        typeof updater === "function"
          ? updater({ pageIndex: page - 1, pageSize: 100 })
          : updater
      setPage(nextPagination.pageIndex + 1)
    },
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  })

  const selectedRows = React.useMemo(
    () => table.getSelectedRowModel().rows.map((r) => r.original),
    [table.getSelectedRowModel().rows]
  )

  const handleAddSelectedToCollection = () => {
    if (selectedRows.length === 0) return
    onAddToCollection(selectedRows)
    toast.success(`Saved ${selectedRows.length} items`)
    setSearchRowSelection({})
  }

  return (
    <div className="relative space-y-4">
      {/* Top Toolbar (sadmann7/tablecn style) */}
      <DataTableToolbar table={table}>
        <div className="flex items-center gap-2">
          <SearchForm
            initialQuery={activeQuery}
            activeDb={activeDb}
            onDbChange={(db) => {
              setActiveDb(db)
              if (activeQuery.trim()) {
                submitSearch(activeQuery, db)
              }
            }}
            onSubmit={(query, db) => submitSearch(query, db)}
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
      </DataTableToolbar>

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
                      className="text-xs font-semibold text-muted-foreground py-2 px-3 bg-muted/30"
                    >
                      {header.isPlaceholder
                        ? null
                        : flexRender(
                            header.column.columnDef.header,
                            header.getContext()
                          )}
                    </TableHead>
                  )
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({ length: 5 }).map((_, idx) => (
                <TableRow key={idx}>
                  <TableCell colSpan={columns.length} className="h-10 px-3">
                    <Skeleton className="h-4 w-full" />
                  </TableCell>
                </TableRow>
              ))
            ) : table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  data-state={row.getIsSelected() && "selected"}
                  className="hover:bg-muted/40 transition-colors border-b border-border/50 text-sm"
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id} className="py-2.5 px-3">
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext()
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className="h-32 text-center text-sm text-muted-foreground"
                >
                  {activeQuery
                    ? "No records found matching query."
                    : "Enter a search query (e.g. 'PRJNA218110' or 'human') to view SRA data."}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination Footer (tablecn style) */}
      <DataTablePagination table={table} />

      {/* Floating Bottom Selection Action Bar (tablecn style) */}
      <DataTableBulkActions table={table}>
        <ActionBarItem
          onClick={() => {
            const accessions = selectedRows.map((r) => r.accession).join("\n")
            navigator.clipboard.writeText(accessions)
          }}
        >
          <Copy className="size-3.5" />
          Copy
        </ActionBarItem>

        <ActionBarItem onClick={handleAddSelectedToCollection}>
          <BookmarkPlus className="size-3.5" />
          Save to Collection
        </ActionBarItem>
      </DataTableBulkActions>
    </div>
  )
}
