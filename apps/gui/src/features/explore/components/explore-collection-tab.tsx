import * as React from "react"
import { cn } from "@/lib/utils"
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
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ShortcutBadge } from "@/components/ui/shortcut-badge"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Trash2,
  Download,
  CheckCircle2,
  Clock,
  ChevronDown,
  Loader2,
  FileCode,
  Binary,
  Filter,
  Check,
  Package,
  Dna,
  Zap,
} from "lucide-react"
import { toast } from "sonner"
import {
  DataTableBulkActions,
  DataTableViewOptions,
  DataTablePagination,
  ActionBarItem,
} from "@/components/common/data-table"
import { useQueryClient } from "@tanstack/react-query"
import { useSearchStore } from "../stores/search-store"
import {
  resolveCollectionUrlsApi,
  startDownloadsApi,
  downloadGenomesApi,
  type GenomePackageLayers,
  type SraRecord,
} from "../services/sra-service"
import { openApiEventStream } from "@/lib/api-client"

function renderMutedValue(val?: string | null): React.ReactNode {
  if (!val || !val.trim()) return <span className="text-muted-foreground/35 font-mono select-none">—</span>
  const clean = val.trim().toLowerCase()
  if (clean === "n/a" || clean === "na" || clean === "missing" || clean === "unknown" || clean === "none") {
    return <span className="text-muted-foreground/35 font-mono select-none">—</span>
  }
  return val
}

export const isRecordDownloaded = (r: SraRecord) =>
  Boolean(r.isDownloaded || r.is_downloaded || r.status === "downloaded")

const isAssemblyRecord = (r: SraRecord) =>
  Boolean(
    r.accession?.startsWith("GCF_") ||
    r.accession?.startsWith("GCA_") ||
    r.platform?.toLowerCase().includes("assembly") ||
    r.platform?.toLowerCase().includes("chromosome") ||
    r.platform?.toLowerCase().includes("scaffold") ||
    r.platform?.toLowerCase().includes("contig") ||
    r.platform?.toLowerCase().includes("complete genome")
  )

interface ExploreCollectionTabProps {
  collection: SraRecord[]
  onRemoveFromCollection: (ids: string[]) => void
  onSelectRecord?: (record: SraRecord, db: string) => void
}

export function ExploreCollectionTab({
  collection,
  onRemoveFromCollection,
  onSelectRecord,
}: ExploreCollectionTabProps) {
  const queryClient = useQueryClient()

  // Live refetch collection whenever background downloads finish
  React.useEffect(() => {
    const closeStream = openApiEventStream("/api/downloads/events", (data) => {
      try {
          if (!data.trim()) return
          const parsed = JSON.parse(data)
          if (parsed.TaskFinished || parsed.status === "completed") {
            queryClient.invalidateQueries({ queryKey: ["collection"] })
          }
        } catch {
          // ignore
        }
    })
    return () => {
      closeStream()
    }
  }, [queryClient])
  const collectionRowSelection = useSearchStore((s) => s.collectionRowSelection)
  const setCollectionRowSelection = useSearchStore((s) => s.setCollectionRowSelection)
  const columnVisibility = useSearchStore((s) => s.collectionColumnVisibility)
  const setColumnVisibility = useSearchStore((s) => s.setCollectionColumnVisibility)

  // Two Dataset Tabs: SRA Runs vs Assemblies
  const [datasetTab, setDatasetTab] = React.useState<"sra" | "assembly">("sra")

  // Status Filter: All | Saved (Pending) | Downloaded
  const [statusFilter, setStatusFilter] = React.useState<"all" | "saved" | "downloaded">("all")
  const [globalFilter, setGlobalFilter] = React.useState("")

  // URL resolution state
  const [isResolving, setIsResolving] = React.useState(false)

  // Genome Package Configuration Modal
  const [isGenomePackageModalOpen, setIsGenomePackageModalOpen] = React.useState(false)
  const [includeGenomeFasta, setIncludeGenomeFasta] = React.useState(true)
  const [includeGff, setIncludeGff] = React.useState(true)
  const [includeProteinFasta, setIncludeProteinFasta] = React.useState(true)
  const [includeCdsFasta, setIncludeCdsFasta] = React.useState(false)
  const [includeRnaFasta, setIncludeRnaFasta] = React.useState(false)
  const [includeSequenceReport, setIncludeSequenceReport] = React.useState(true)

  const hasAnyLayerSelected =
    includeGenomeFasta ||
    includeGff ||
    includeProteinFasta ||
    includeCdsFasta ||
    includeRnaFasta ||
    includeSequenceReport

  const applyPreset = (preset: "standard" | "complete" | "fasta_only") => {
    if (preset === "standard") {
      setIncludeGenomeFasta(true)
      setIncludeGff(true)
      setIncludeProteinFasta(true)
      setIncludeCdsFasta(false)
      setIncludeRnaFasta(false)
      setIncludeSequenceReport(true)
    } else if (preset === "complete") {
      setIncludeGenomeFasta(true)
      setIncludeGff(true)
      setIncludeProteinFasta(true)
      setIncludeCdsFasta(true)
      setIncludeRnaFasta(true)
      setIncludeSequenceReport(true)
    } else if (preset === "fasta_only") {
      setIncludeGenomeFasta(true)
      setIncludeGff(false)
      setIncludeProteinFasta(false)
      setIncludeCdsFasta(false)
      setIncludeRnaFasta(false)
      setIncludeSequenceReport(false)
    }
  }

  // Separate records by dataset type
  const sraRecords = React.useMemo(() => collection.filter((r) => !isAssemblyRecord(r)), [collection])
  const assemblyRecords = React.useMemo(() => collection.filter((r) => isAssemblyRecord(r)), [collection])

  const activeDatasetRecords = datasetTab === "sra" ? sraRecords : assemblyRecords

  // Filter by status within active dataset
  const displayData = React.useMemo(() => {
    let list = activeDatasetRecords
    if (statusFilter === "saved") {
      list = list.filter((r) => !isRecordDownloaded(r))
    } else if (statusFilter === "downloaded") {
      list = list.filter((r) => isRecordDownloaded(r))
    }
    return list
  }, [activeDatasetRecords, statusFilter])

  // Counts for status filter in active dataset
  const totalActiveCount = activeDatasetRecords.length
  const pendingCount = activeDatasetRecords.filter((r) => !isRecordDownloaded(r)).length
  const downloadedCount = activeDatasetRecords.filter((r) => isRecordDownloaded(r)).length

  const setSelectedRecord = useSearchStore((s) => s.setSelectedRecord)
  const isAssembly = datasetTab === "assembly"

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
              setSelectedRecord(row.original, datasetTab)
              onSelectRecord?.(row.original, datasetTab)
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
        accessorKey: "status",
        header: "Status",
        size: 115,
        meta: { label: "Status" },
        cell: ({ row }) => {
          const isDownloaded = isRecordDownloaded(row.original)
          return isDownloaded ? (
            <Badge variant="outline" className="bg-muted text-foreground gap-1 text-xs font-normal">
              <CheckCircle2 className="size-3" />
              Downloaded
            </Badge>
          ) : (
            <Badge variant="outline" className="bg-muted/50 text-muted-foreground gap-1 text-xs font-normal">
              <Clock className="size-3" />
              Pending
            </Badge>
          )
        },
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
        id: "actions",
        size: 50,
        enableHiding: false,
        cell: ({ row }) => (
          <div className="flex items-center justify-end">
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={() => onRemoveFromCollection([row.original.id])}
              title="Remove from Collection"
              className="cursor-pointer"
            >
              <Trash2 className="size-3.5 text-destructive" />
            </Button>
          </div>
        ),
      },
    ],
    [datasetTab, onRemoveFromCollection, onSelectRecord, setSelectedRecord]
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
              setSelectedRecord(row.original, datasetTab)
              onSelectRecord?.(row.original, datasetTab)
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
        accessorKey: "status",
        header: "Status",
        size: 115,
        meta: { label: "Status" },
        cell: ({ row }) => {
          const isDownloaded = isRecordDownloaded(row.original)
          return isDownloaded ? (
            <Badge variant="outline" className="bg-muted text-foreground gap-1 text-xs font-normal">
              <CheckCircle2 className="size-3" />
              Downloaded
            </Badge>
          ) : (
            <Badge variant="outline" className="bg-muted/50 text-muted-foreground gap-1 text-xs font-normal">
              <Clock className="size-3" />
              Pending
            </Badge>
          )
        },
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
        id: "actions",
        size: 50,
        enableHiding: false,
        cell: ({ row }) => (
          <div className="flex items-center justify-end">
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={() => onRemoveFromCollection([row.original.id])}
              title="Remove from Collection"
              className="cursor-pointer"
            >
              <Trash2 className="size-3.5 text-destructive" />
            </Button>
          </div>
        ),
      },
    ],
    [datasetTab, onRemoveFromCollection, onSelectRecord, setSelectedRecord]
  )

  const columns = isAssembly ? assemblyColumns : sraColumns

  const table = useReactTable({
    data: displayData,
    columns,
    state: {
      rowSelection: collectionRowSelection,
      columnVisibility,
      globalFilter,
    },
    initialState: {
      pagination: {
        pageSize: 100,
      },
    },
    onRowSelectionChange: setCollectionRowSelection,
    onColumnVisibilityChange: setColumnVisibility,
    onGlobalFilterChange: setGlobalFilter,
    getRowId: (row) => row.id || row.accession,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  })

  const selectedRows = React.useMemo(
    () => table.getSelectedRowModel().rows.map((r) => r.original),
    [table.getSelectedRowModel().rows]
  )
  const selectedIds = React.useMemo(
    () => selectedRows.map((r) => r.id || r.accession),
    [selectedRows]
  )

  const handleRemoveSelected = () => {
    if (selectedIds.length === 0) return
    onRemoveFromCollection(selectedIds)
    setCollectionRowSelection({})
  }

  // SRA Download handler with smart skip
  const handleDownloadSra = async (format: "sra" | "fastq") => {
    const unDownloaded = activeDatasetRecords.filter((r) => !isRecordDownloaded(r))
    if (unDownloaded.length === 0) {
      toast.info("All SRA items in this collection are already downloaded.")
      return
    }

    const toastId = toast.loading(
      `Resolving ${format.toUpperCase()} URLs for ${unDownloaded.length} pending item(s)...`
    )

    try {
      setIsResolving(true)
      const targetIds = unDownloaded.map((r) => r.id)
      const res = await resolveCollectionUrlsApi(format, targetIds)
      const startRes = await startDownloadsApi(undefined, format)

      const count = startRes.enqueued_count || res.resolved_count || unDownloaded.length
      toast.success(
        `Started ${count} ${format.toUpperCase()} download(s)${downloadedCount > 0 ? ` (${downloadedCount} already downloaded and skipped)` : ""
        }`,
        { id: toastId }
      )
    } catch (err: any) {
      console.error("Failed to resolve download links:", err)
      toast.error(`Error: ${err?.message || err}`, { id: toastId })
    } finally {
      setIsResolving(false)
    }
  }

  // Genome Package UI Confirmation
  const handleConfirmGenomeDownload = async () => {
    const unDownloaded = activeDatasetRecords.filter((r) => !isRecordDownloaded(r))
    if (unDownloaded.length === 0) {
      toast.info("All assemblies in this collection are already downloaded.")
      setIsGenomePackageModalOpen(false)
      return
    }

    setIsGenomePackageModalOpen(false)
    const toastId = toast.loading(`Preparing genome packages for ${unDownloaded.length} assemblies...`)

    try {
      const layers: GenomePackageLayers = {
        genome_fasta: includeGenomeFasta,
        genome_gff: includeGff,
        protein_fasta: includeProteinFasta,
        cds_fasta: includeCdsFasta,
        rna_fasta: includeRnaFasta,
        sequence_report: includeSequenceReport,
      }

      // Chunk accessions into batches of at most 100 items per request
      const BATCH_SIZE = 100
      const allAccessions = unDownloaded.map((r) => r.accession)
      const batches: string[][] = []
      for (let i = 0; i < allAccessions.length; i += BATCH_SIZE) {
        batches.push(allAccessions.slice(i, i + BATCH_SIZE))
      }

      let totalEnqueued = 0
      for (const batch of batches) {
        const res = await downloadGenomesApi(batch, layers)
        totalEnqueued += res.enqueued_count
      }

      toast.success(
        `Queued download for ${totalEnqueued} assembly package(s) (${batches.length} batch${batches.length === 1 ? "" : "es"
        })${downloadedCount > 0 ? ` (${downloadedCount} already downloaded and skipped)` : ""}.`,
        { id: toastId }
      )
    } catch (err: any) {
      console.error("Failed to queue genome downloads:", err)
      toast.error(`Failed to queue downloads: ${err?.message || err}`, { id: toastId })
    }
  }

  const statusLabel =
    statusFilter === "all"
      ? "All Items"
      : statusFilter === "saved"
        ? "Pending / Saved"
        : "Downloaded"

  return (
    <div className="relative space-y-4">
      {/* Top Dataset Switcher (SRA Runs vs Assemblies) */}
      <div className="border-b border-border">
        <Tabs
          value={datasetTab}
          onValueChange={(val) => {
            setDatasetTab(val as "sra" | "assembly")
            setCollectionRowSelection({})
          }}
        >
          <TabsList variant="line" className="gap-6 bg-transparent h-9 p-0">
            <TabsTrigger value="sra" className="gap-2 cursor-pointer">
              <Dna className="size-3.5" />
              <span>SRA Runs</span>
              <ShortcutBadge count={sraRecords.length} />
            </TabsTrigger>
            <TabsTrigger value="assembly" className="gap-2 cursor-pointer">
              <Package className="size-3.5" />
              <span>Assemblies</span>
              <ShortcutBadge count={assemblyRecords.length} />
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* Toolbar Row */}
      <div
        role="toolbar"
        aria-orientation="horizontal"
        className="flex w-full items-center justify-between gap-2 p-1"
      >
        {/* Left: Filter input & Status Facet Dropdown */}
        <div className="flex flex-1 flex-wrap items-center gap-2">
          <Input
            placeholder={`Filter ${datasetTab === "sra" ? "SRA" : "assembly"} collection...`}
            value={globalFilter ?? ""}
            onChange={(e) => setGlobalFilter(e.target.value)}
            className="h-8 w-60 sm:w-72"
          />

          {/* Status Faceted Filter Dropdown */}
          <DropdownMenu modal={false}>
            <DropdownMenuTrigger
              render={
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 gap-1.5 px-2.5 font-normal cursor-pointer"
                />
              }
            >
              <Filter className="size-3 text-muted-foreground" />
              <span>Status: <strong className="font-semibold text-foreground">{statusLabel}</strong></span>
              <ChevronDown className="size-3 text-muted-foreground ml-0.5" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-52">
              <DropdownMenuGroup>
                <DropdownMenuLabel className="text-xs text-muted-foreground uppercase font-semibold">
                  Filter by Status
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="cursor-pointer flex items-center py-1.5"
                  onClick={() => setStatusFilter("all")}
                >
                  <span className="flex-1">All Items</span>
                  <span className="font-mono text-xs text-muted-foreground tabular-nums mr-2">
                    {totalActiveCount}
                  </span>
                  <Check className={cn("size-3.5 text-primary shrink-0", statusFilter !== "all" && "invisible")} />
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="cursor-pointer flex items-center py-1.5"
                  onClick={() => setStatusFilter("saved")}
                >
                  <span className="flex-1">Pending / Saved</span>
                  <span className="font-mono text-xs text-muted-foreground tabular-nums mr-2">
                    {pendingCount}
                  </span>
                  <Check className={cn("size-3.5 text-primary shrink-0", statusFilter !== "saved" && "invisible")} />
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="cursor-pointer flex items-center py-1.5"
                  onClick={() => setStatusFilter("downloaded")}
                >
                  <span className="flex-1">Downloaded</span>
                  <span className="font-mono text-xs text-muted-foreground tabular-nums mr-2">
                    {downloadedCount}
                  </span>
                  <Check className={cn("size-3.5 text-primary shrink-0", statusFilter !== "downloaded" && "invisible")} />
                </DropdownMenuItem>
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Right: Download All + View Options */}
        <div className="flex items-center gap-2 ml-auto">
          {datasetTab === "sra" ? (
            /* SRA Download All Dropdown */
            <DropdownMenu modal={false}>
              <DropdownMenuTrigger
                disabled={activeDatasetRecords.length === 0 || isResolving}
                render={
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 gap-1.5 cursor-pointer"
                    disabled={activeDatasetRecords.length === 0 || isResolving}
                  />
                }
              >
                {isResolving ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Download className="size-3.5" />
                )}
                <span>Download All</span>
                <ChevronDown className="size-3 text-muted-foreground ml-0.5" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuGroup>
                  <DropdownMenuLabel className="text-xs text-muted-foreground font-normal">
                    Select Target Sequence Format
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className="gap-2 cursor-pointer"
                    onClick={() => handleDownloadSra("fastq")}
                  >
                    <FileCode className="size-4" />
                    <div className="flex flex-col">
                      <span className="font-semibold">FastQ (.fastq.gz)</span>
                      <span className="text-xs text-muted-foreground">EMBL ENA Portal (AWS/GCP/HTTPS)</span>
                    </div>
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className="gap-2 cursor-pointer"
                    onClick={() => handleDownloadSra("sra")}
                  >
                    <Binary className="size-4" />
                    <div className="flex flex-col">
                      <span className="font-semibold">SRA (.sra)</span>
                      <span className="text-xs text-muted-foreground">NCBI SRA / ENA AWS S3</span>
                    </div>
                  </DropdownMenuItem>
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            /* Assemblies Download Genome Package Button */
            <Button
              variant="outline"
              size="sm"
              className="h-8 gap-1.5 cursor-pointer"
              disabled={activeDatasetRecords.length === 0}
              onClick={() => setIsGenomePackageModalOpen(true)}
            >
              <Download className="size-3.5" />
              <span>Download All</span>
            </Button>
          )}

          <DataTableViewOptions table={table} />
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
                      style={size ? { width: `${size}px`, maxWidth: `${size}px` } : undefined}
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
            {table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  data-state={row.getIsSelected() && "selected"}
                  className="hover:bg-muted/40 transition-colors"
                >
                  {row.getVisibleCells().map((cell) => {
                    const size = cell.column.columnDef.size
                    return (
                      <TableCell
                        key={cell.id}
                        style={size ? { width: `${size}px`, maxWidth: `${size}px` } : undefined}
                        className="text-sm py-2 px-3 align-middle"
                      >
                        {flexRender(
                          cell.column.columnDef.cell,
                          cell.getContext()
                        )}
                      </TableCell>
                    )
                  })}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className="h-32 text-center text-sm text-muted-foreground"
                >
                  {activeDatasetRecords.length === 0 ? (
                    <div className="flex flex-col items-center justify-center gap-1.5">
                      <p className="font-medium text-foreground">
                        No {datasetTab === "sra" ? "SRA runs" : "genome assemblies"} saved
                      </p>
                      <p className="text-sm text-muted-foreground">
                        Search and save {datasetTab === "sra" ? "SRA runs" : "assemblies (GCF/GCA)"} from the Search tab.
                      </p>
                    </div>
                  ) : (
                    "No records match the current filter."
                  )}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination Footer */}
      <DataTablePagination table={table} />

      {/* Bottom Floating Bulk Actions Bar */}
      <DataTableBulkActions table={table}>
        <ActionBarItem
          onClick={handleRemoveSelected}
          className="text-destructive hover:bg-destructive/10"
        >
          <Trash2 className="size-3.5" />
          Remove Selected ({selectedIds.length})
        </ActionBarItem>
      </DataTableBulkActions>

      {/* Genome Package Configuration Dialog */}
      <Dialog open={isGenomePackageModalOpen} onOpenChange={setIsGenomePackageModalOpen}>
        <DialogContent className="sm:max-w-lg p-6">
          <DialogHeader>
            <div className="flex items-center gap-2.5">
              <div className="size-8 rounded-lg bg-muted flex items-center justify-center border border-border">
                <Package className="size-4 text-foreground" />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <DialogTitle className="text-base font-semibold">
                    Download Genome Packages
                  </DialogTitle>
                  <Badge variant="secondary" className="text-xs font-normal px-2 py-0.5">
                    {pendingCount} {pendingCount === 1 ? "assembly" : "assemblies"}
                  </Badge>
                </div>
                <DialogDescription className="mt-0.5">
                  {downloadedCount > 0
                    ? `Packaging ${pendingCount} assemblies (${downloadedCount} already downloaded and skipped).`
                    : "Select sequence and annotation layers to include in the package."}
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="space-y-4 py-1">
            {/* Quick Presets */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block">
                Quick Presets
              </label>
              <div className="flex flex-wrap gap-1.5">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => applyPreset("standard")}
                  className="h-7 px-2.5 cursor-pointer font-normal gap-1.5"
                >
                  <Zap className="size-3 text-muted-foreground" />
                  <span>Standard (FASTA + GFF3)</span>
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => applyPreset("complete")}
                  className="h-7 px-2.5 cursor-pointer font-normal gap-1.5"
                >
                  <Package className="size-3 text-muted-foreground" />
                  <span>Full Package</span>
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => applyPreset("fasta_only")}
                  className="h-7 px-2.5 cursor-pointer font-normal gap-1.5"
                >
                  <Dna className="size-3 text-muted-foreground" />
                  <span>FASTA Only</span>
                </Button>
              </div>
            </div>

            {/* Layer Checkboxes */}
            <div className="space-y-2">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block">
                Included Sequence & Annotation Layers
              </label>

              <div className="rounded-lg border border-border divide-y divide-border/60 overflow-hidden bg-card">
                <div className="flex items-start gap-3 p-2.5 hover:bg-muted/20 transition-colors">
                  <Checkbox
                    id="dlg-fasta"
                    checked={includeGenomeFasta}
                    onCheckedChange={(v) => setIncludeGenomeFasta(!!v)}
                    className="mt-0.5"
                  />
                  <div className="grid gap-0.5 leading-none">
                    <label htmlFor="dlg-fasta" className="text-sm font-medium cursor-pointer">
                      Genomic FASTA (.fna)
                    </label>
                    <span className="text-sm text-muted-foreground">Complete genomic contigs, scaffolds, and chromosome sequences</span>
                  </div>
                </div>

                <div className="flex items-start gap-3 p-2.5 hover:bg-muted/20 transition-colors">
                  <Checkbox
                    id="dlg-gff"
                    checked={includeGff}
                    onCheckedChange={(v) => setIncludeGff(!!v)}
                    className="mt-0.5"
                  />
                  <div className="grid gap-0.5 leading-none">
                    <label htmlFor="dlg-gff" className="text-sm font-medium cursor-pointer">
                      Genomic Annotation (.gff3)
                    </label>
                    <span className="text-sm text-muted-foreground">Gene, transcript, exon, CDS, and regulatory features</span>
                  </div>
                </div>

                <div className="flex items-start gap-3 p-2.5 hover:bg-muted/20 transition-colors">
                  <Checkbox
                    id="dlg-prot"
                    checked={includeProteinFasta}
                    onCheckedChange={(v) => setIncludeProteinFasta(!!v)}
                    className="mt-0.5"
                  />
                  <div className="grid gap-0.5 leading-none">
                    <label htmlFor="dlg-prot" className="text-sm font-medium cursor-pointer">
                      Protein FASTA (.faa)
                    </label>
                    <span className="text-sm text-muted-foreground">Translated amino acid sequences for predicted proteins</span>
                  </div>
                </div>

                <div className="flex items-start gap-3 p-2.5 hover:bg-muted/20 transition-colors">
                  <Checkbox
                    id="dlg-cds"
                    checked={includeCdsFasta}
                    onCheckedChange={(v) => setIncludeCdsFasta(!!v)}
                    className="mt-0.5"
                  />
                  <div className="grid gap-0.5 leading-none">
                    <label htmlFor="dlg-cds" className="text-sm font-medium cursor-pointer">
                      Coding Sequences (CDS FASTA)
                    </label>
                    <span className="text-sm text-muted-foreground">Nucleotide sequences corresponding to coding regions</span>
                  </div>
                </div>

                <div className="flex items-start gap-3 p-2.5 hover:bg-muted/20 transition-colors">
                  <Checkbox
                    id="dlg-rna"
                    checked={includeRnaFasta}
                    onCheckedChange={(v) => setIncludeRnaFasta(!!v)}
                    className="mt-0.5"
                  />
                  <div className="grid gap-0.5 leading-none">
                    <label htmlFor="dlg-rna" className="text-sm font-medium cursor-pointer">
                      RNA FASTA
                    </label>
                    <span className="text-sm text-muted-foreground">Transcript and non-coding RNA sequences</span>
                  </div>
                </div>

                <div className="flex items-start gap-3 p-2.5 hover:bg-muted/20 transition-colors">
                  <Checkbox
                    id="dlg-report"
                    checked={includeSequenceReport}
                    onCheckedChange={(v) => setIncludeSequenceReport(!!v)}
                    className="mt-0.5"
                  />
                  <div className="grid gap-0.5 leading-none">
                    <label htmlFor="dlg-report" className="text-sm font-medium cursor-pointer">
                      Assembly & Sequence Data Reports
                    </label>
                    <span className="text-sm text-muted-foreground">JSON catalog, assembly stats, and data reports</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <DialogFooter className="mt-4 flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsGenomePackageModalOpen(false)}
              className="cursor-pointer"
            >
              Cancel
            </Button>
            <Button
              size="sm"
              disabled={!hasAnyLayerSelected || pendingCount === 0}
              onClick={handleConfirmGenomeDownload}
              className="gap-1.5 cursor-pointer"
            >
              <Download className="size-3.5" />
              <span>
                Download {pendingCount > 0 ? `${pendingCount} ` : ""}Package{pendingCount === 1 ? "" : "s"} (.zip)
              </span>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
