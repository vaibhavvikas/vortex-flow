import * as React from "react"
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  type ColumnDef,
} from "@tanstack/react-table"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
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
  Download,
  Play,
  Pause,
  RotateCcw,
  Loader2,
  CheckCircle2,
  AlertCircle,
  XCircle,
  Clock,
} from "lucide-react"
import { toast } from "sonner"
import {
  getDownloadsApi,
  startDownloadsApi,
  pauseDownloadApi,
  resumeDownloadApi,
  cancelDownloadApi,
  retryDownloadApi,
  deleteDownloadApi,
  type DownloadTaskItem,
} from "../services/sra-service"
import { openApiEventStream } from "@/lib/api-client"

function formatBytes(bytes: number): string {
  if (!bytes || bytes === 0) return "0 B"
  const k = 1024
  const sizes = ["B", "KB", "MB", "GB", "TB"]
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`
}

function formatEta(seconds?: number): string | null {
  if (seconds === undefined || seconds === null || seconds <= 0) return null
  if (seconds < 60) return `${seconds}s left`
  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  if (mins < 60) return `${mins}m ${secs}s left`
  const hours = Math.floor(mins / 60)
  const remMins = mins % 60
  return `${hours}h ${remMins}m left`
}

export function ExploreDownloadsView() {
  const [downloads, setDownloads] = React.useState<DownloadTaskItem[]>([])
  const [isLoading, setIsLoading] = React.useState(true)
  const [loadError, setLoadError] = React.useState<string | null>(null)
  const [isCancelAllDialogOpen, setIsCancelAllDialogOpen] = React.useState(false)


  const fetchDownloads = React.useCallback(async () => {
    try {
      const data = await getDownloadsApi()
      setDownloads(data)
      setLoadError(null)
    } catch (error) {
      console.error("Failed to fetch downloads:", error)
      setLoadError("The download queue could not be loaded. Check that the local VortexFlow server is running.")
    } finally {
      setIsLoading(false)
    }
  }, [])

  // Connect to backend Server-Sent Events (SSE) stream for real-time push updates
  React.useEffect(() => {
    fetchDownloads()

    const closeStream = openApiEventStream("/api/downloads/events", (data) => {
        try {
          if (!data.trim()) return
          const payload = JSON.parse(data)
          if (payload.ProgressUpdated) {
          const p = payload.ProgressUpdated
          const statusStr = (typeof p.status === "string" ? p.status : "downloading").toLowerCase()
          setDownloads((prev) =>
            prev.map((item) => {
              if (item.file_id !== p.task_id) return item
              const isItemPaused = item.download_status.toLowerCase() === "paused"
              const finalStatus = isItemPaused && statusStr !== "paused" ? "paused" : statusStr
              return {
                ...item,
                downloaded_bytes: p.downloaded_bytes,
                file_size_bytes: p.total_bytes > 0 ? p.total_bytes : item.file_size_bytes,
                download_status: finalStatus,
                speed_bytes_per_sec: finalStatus === "paused" ? 0 : p.speed_bytes_per_sec,
                eta_seconds: finalStatus === "paused" ? undefined : p.eta_seconds,
              }
            })
          )
        } else if (payload.StatusChanged) {
          const { task_id, status } = payload.StatusChanged
          const statusStr = typeof status === "string"
            ? status.toLowerCase()
            : status?.Failed
            ? `failed: ${status.Failed}`
            : typeof status?.failed === "string"
            ? `failed: ${status.failed}`
            : "unknown"

          setDownloads((prev) =>
            prev.map((item) =>
              item.file_id === task_id
                ? {
                    ...item,
                    download_status: statusStr,
                    speed_bytes_per_sec: statusStr === "downloading" ? item.speed_bytes_per_sec : 0,
                    eta_seconds: statusStr === "downloading" ? item.eta_seconds : undefined,
                  }
                : item
            )
          )
        } else if (payload.TaskFinished) {
          const { task_id } = payload.TaskFinished
          setDownloads((prev) =>
            prev.map((item) =>
              item.file_id === task_id
                ? {
                    ...item,
                    download_status: "completed",
                    downloaded_bytes: item.file_size_bytes > 0 ? item.file_size_bytes : item.downloaded_bytes,
                    speed_bytes_per_sec: 0,
                    eta_seconds: undefined,
                  }
                : item
            )
          )
        } else if (payload.TaskFailed) {
          const { task_id, error } = payload.TaskFailed
          setDownloads((prev) =>
            prev.map((item) =>
              item.file_id === task_id
                ? {
                    ...item,
                    download_status: `failed: ${error}`,
                    speed_bytes_per_sec: 0,
                    eta_seconds: undefined,
                  }
                : item
            )
          )
        } else {
          fetchDownloads()
        }
      } catch {
        fetchDownloads()
      }
    })

    return () => {
      closeStream()
    }
  }, [fetchDownloads])

  const handleStartAll = async () => {
    try {
      const res = await startDownloadsApi()
      toast.success(`Queued ${res.enqueued_count} download tasks`)
      fetchDownloads()
    } catch (err: any) {
      toast.error("Failed to start downloads")
    }
  }

  const handlePauseAll = async () => {
    const activeTasks = downloads.filter(
      (d) => d.download_status.toLowerCase() === "downloading" || d.download_status.toLowerCase() === "queued"
    )
    if (activeTasks.length === 0) return
    setDownloads((prev) =>
      prev.map((d) =>
        d.download_status.toLowerCase() === "downloading" || d.download_status.toLowerCase() === "queued"
          ? { ...d, download_status: "paused", speed_bytes_per_sec: 0, eta_seconds: undefined }
          : d
      )
    )
    try {
      await Promise.all(activeTasks.map((t) => pauseDownloadApi(t.file_id)))
      toast.success(`Paused ${activeTasks.length} download tasks`)
    } catch {
      toast.error("Failed to pause some downloads")
    } finally {
      fetchDownloads()
    }
  }

  const confirmCancelAll = async () => {
    const incompleteTasks = downloads.filter(
      (d) => d.download_status.toLowerCase() !== "completed"
    )
    if (incompleteTasks.length === 0) return
    setIsCancelAllDialogOpen(false)
    setDownloads((prev) => prev.filter((d) => d.download_status.toLowerCase() === "completed"))
    try {
      await Promise.all(
        incompleteTasks.map(async (t) => {
          await cancelDownloadApi(t.file_id)
          await deleteDownloadApi(t.file_id)
        })
      )
      toast.success(`Cancelled ${incompleteTasks.length} download tasks`)
    } catch {
      toast.error("Failed to cancel some downloads")
    } finally {
      fetchDownloads()
    }
  }

  const handlePause = async (id: string) => {
    try {
      setDownloads((prev) =>
        prev.map((d) => (d.file_id === id ? { ...d, download_status: "paused", speed_bytes_per_sec: 0, eta_seconds: undefined } : d))
      )
      await pauseDownloadApi(id)
      toast.success("Paused download")
    } catch (err) {
      toast.error("Failed to pause")
      fetchDownloads()
    }
  }

  const handleResume = async (id: string) => {
    try {
      setDownloads((prev) =>
        prev.map((d) => (d.file_id === id ? { ...d, download_status: "downloading" } : d))
      )
      await resumeDownloadApi(id)
      toast.success("Resuming download")
    } catch (err) {
      toast.error("Failed to resume")
      fetchDownloads()
    }
  }

  const handleCancel = async (id: string) => {
    try {
      setDownloads((prev) => prev.filter((d) => d.file_id !== id))
      await cancelDownloadApi(id)
      await deleteDownloadApi(id)
      toast.success("Cancelled download")
    } catch (err) {
      toast.error("Failed to cancel")
      fetchDownloads()
    }
  }

  const handleRetry = async (id: string) => {
    try {
      setDownloads((prev) =>
        prev.map((d) => (d.file_id === id ? { ...d, download_status: "downloading" } : d))
      )
      await retryDownloadApi(id)
      toast.success("Retrying download")
    } catch (err) {
      toast.error("Failed to retry")
      fetchDownloads()
    }
  }

  const columns = React.useMemo<ColumnDef<DownloadTaskItem>[]>(
    () => [
      {
        accessorKey: "file_name",
        header: "File Name",
        size: 210,
        cell: ({ row }) => {
          const fileName = row.original.file_name || row.original.accession
          return (
            <span
              className="font-mono text-sm font-medium text-foreground truncate block"
              title={fileName}
            >
              {fileName}
            </span>
          )
        },
      },
      {
        accessorKey: "accession",
        header: "Accession",
        size: 120,
        cell: ({ row }) => (
          <span className="font-mono text-sm tabular-nums text-muted-foreground truncate block">
            {row.original.accession}
          </span>
        ),
      },
      {
        accessorKey: "format",
        header: "Type",
        size: 85,
        cell: ({ row }) => (
          <Badge variant="outline" className="font-mono text-xs uppercase font-normal">
            {row.original.format || "FILE"}
          </Badge>
        ),
      },
      {
        accessorKey: "download_status",
        header: "Status",
        size: 110,
        cell: ({ row }) => {
          const status = row.original.download_status.toLowerCase()
          if (status === "downloading") {
            return (
              <Badge variant="outline" className="bg-muted text-foreground gap-1 text-xs font-normal">
                <Loader2 className="size-3 animate-spin" />
                Downloading
              </Badge>
            )
          }
          if (status === "completed") {
            return (
              <Badge variant="outline" className="bg-muted text-foreground gap-1 text-xs font-normal">
                <CheckCircle2 className="size-3" />
                Downloaded
              </Badge>
            )
          }
          if (status === "paused") {
            return (
              <Badge variant="outline" className="bg-muted/50 text-muted-foreground gap-1 text-xs font-normal">
                <Pause className="size-3" />
                Paused
              </Badge>
            )
          }
          if (status.startsWith("failed")) {
            return (
              <Badge variant="outline" className="bg-muted/50 text-destructive border-destructive/30 gap-1 text-xs font-normal">
                <AlertCircle className="size-3" />
                Failed
              </Badge>
            )
          }
          return (
            <Badge variant="outline" className="bg-muted/50 text-muted-foreground gap-1 text-xs font-normal">
              <Clock className="size-3" />
              Queued
            </Badge>
          )
        },
      },
      {
        accessorKey: "progress",
        header: "Progress",
        cell: ({ row }) => {
          const downloaded = row.original.downloaded_bytes || 0
          const total = row.original.file_size_bytes || 0
          const percent = total > 0 ? Math.min(100, Math.round((downloaded / total) * 100)) : downloaded > 0 ? 50 : 0
          const status = row.original.download_status.toLowerCase()

          if (status === "completed") {
            return (
              <div className="flex flex-col gap-1 w-full">
                <Progress value={100} />
                <span className="text-xs text-muted-foreground font-mono tabular-nums">
                  {formatBytes(total || downloaded)} (100%)
                </span>
              </div>
            )
          }

          const speed = row.original.speed_bytes_per_sec
          const speedText = status === "downloading" && speed && speed > 0 ? `${formatBytes(speed)}/s` : null
          const etaText = status === "downloading" ? formatEta(row.original.eta_seconds) : null

          return (
            <div className="flex flex-col gap-1 w-full">
              <Progress value={percent} />
              <div className="flex items-center justify-between text-xs text-muted-foreground font-mono tabular-nums">
                <span>
                  {status === "paused"
                    ? `${percent > 0 ? `${percent}% • ` : ""}Paused`
                    : percent > 0
                    ? `${percent}%`
                    : "Queued"}
                  {speedText ? ` • ${speedText}` : ""}
                  {etaText ? ` • ${etaText}` : ""}
                </span>
                <span>
                  {total > 0 ? `${formatBytes(downloaded)} of ${formatBytes(total)}` : formatBytes(downloaded)}
                </span>
              </div>
            </div>
          )
        },
      },
      {
        id: "actions",
        header: "",
        size: 80,
        cell: ({ row }) => {
          const item = row.original
          const status = item.download_status.toLowerCase()
          const isQueued = status === "queued" || status === "pending"
          const isDownloading = status === "downloading"
          const isPaused = status === "paused"
          const isFailed = status.startsWith("failed")
          const isCompleted = status === "completed"

          return (
            <div className="flex items-center gap-0.5 justify-end">
              {/* Force Start for Queued */}
              {isQueued && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7 cursor-pointer text-muted-foreground hover:text-foreground"
                  title="Force Start"
                  onClick={() => handleResume(item.file_id)}
                >
                  <Play className="size-3.5" />
                </Button>
              )}

              {/* Pause for Downloading */}
              {isDownloading && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7 cursor-pointer text-muted-foreground hover:text-foreground"
                  title="Pause"
                  onClick={() => handlePause(item.file_id)}
                >
                  <Pause className="size-3.5" />
                </Button>
              )}

              {/* Resume for Paused */}
              {isPaused && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7 cursor-pointer text-muted-foreground hover:text-foreground"
                  title="Resume"
                  onClick={() => handleResume(item.file_id)}
                >
                  <Play className="size-3.5" />
                </Button>
              )}

              {/* Retry for Failed */}
              {isFailed && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7 cursor-pointer text-muted-foreground hover:text-foreground"
                  title="Retry"
                  onClick={() => handleRetry(item.file_id)}
                >
                  <RotateCcw className="size-3.5" />
                </Button>
              )}

              {/* Cancel Button (available for queued, downloading, paused, failed — NOT completed) */}
              {!isCompleted && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7 cursor-pointer text-muted-foreground hover:text-destructive"
                  title="Cancel & Remove"
                  onClick={() => handleCancel(item.file_id)}
                >
                  <XCircle className="size-3.5" />
                </Button>
              )}
            </div>
          )
        },
      },
    ],
    []
  )

  const table = useReactTable({
    data: downloads,
    columns,
    getRowId: (row) => row.file_id,
    getCoreRowModel: getCoreRowModel(),
  })
  const downloadingCount = downloads.filter((d) => d.download_status.toLowerCase() === "downloading").length
  const queuedCount = downloads.filter((d) => d.download_status.toLowerCase() === "queued" || d.download_status.toLowerCase() === "pending").length
  const completedCount = downloads.filter((d) => d.download_status.toLowerCase() === "completed").length
  const activeCount = downloadingCount + queuedCount

  const handleClearCompleted = async () => {
    const completedItems = downloads.filter(
      (d) => d.download_status.toLowerCase() === "completed"
    )
    if (completedItems.length === 0) return

    const completedIds = new Set(completedItems.map((d) => d.file_id))
    setDownloads((prev) => prev.filter((d) => !completedIds.has(d.file_id)))

    try {
      await Promise.allSettled(
        completedItems.map((item) => deleteDownloadApi(item.file_id))
      )
    } catch {
      // ignore
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Unified Toolbar Row */}
      <div
        role="toolbar"
        aria-orientation="horizontal"
        className="flex w-full items-center justify-between gap-2 p-1"
      >
        {/* Left: Icon, Title & Status Badges */}
        <div className="flex items-center gap-2.5 flex-wrap">
          <Download className="size-4" />
          <span className="text-sm font-semibold">Download Queue</span>
          <Badge variant="secondary" className="text-xs font-normal">
            {downloads.length} total
          </Badge>
          {downloadingCount > 0 && (
            <Badge variant="outline" className="bg-muted text-foreground text-xs font-normal gap-1">
              <Loader2 className="size-3 animate-spin" />
              {downloadingCount} downloading
            </Badge>
          )}
          {queuedCount > 0 && (
            <Badge variant="outline" className="bg-muted/50 text-muted-foreground text-xs font-normal gap-1">
              <Clock className="size-3" />
              {queuedCount} queued
            </Badge>
          )}
          {completedCount > 0 && (
            <Badge variant="outline" className="bg-muted text-foreground text-xs font-normal gap-1">
              <CheckCircle2 className="size-3" />
              {completedCount} downloaded
            </Badge>
          )}
        </div>

        {/* Right: Batch Action Buttons */}
        <div className="flex items-center gap-2 ml-auto">
          <Button
            variant="outline"
            size="sm"
            className="h-8 gap-1.5 cursor-pointer"
            onClick={handleStartAll}
            disabled={downloads.length === 0 || downloadingCount === downloads.length}
          >
            <Play className="size-3.5" />
            <span>Start All</span>
          </Button>

          <Button
            variant="outline"
            size="sm"
            className="h-8 gap-1.5 cursor-pointer"
            onClick={handlePauseAll}
            disabled={activeCount === 0}
          >
            <Pause className="size-3.5" />
            <span>Pause All</span>
          </Button>

          <Button
            variant="destructive"
            size="sm"
            className="h-8 gap-1.5 cursor-pointer"
            onClick={() => setIsCancelAllDialogOpen(true)}
            disabled={downloads.filter((d) => d.download_status.toLowerCase() !== "completed").length === 0}
          >
            <XCircle className="size-3.5" />
            <span>Cancel All</span>
          </Button>
          {completedCount > 0 && (
            <Button
              variant="outline"
              size="sm"
              className="h-8 gap-1.5 cursor-pointer"
              onClick={handleClearCompleted}
            >
              <CheckCircle2 className="size-3.5" />
              <span>Clear Completed</span>
            </Button>
          )}
        </div>
      </div>

      {/* Main TanStack Table Area */}
      {loadError && downloads.length === 0 ? (
        <Card className="min-h-[300px] items-center justify-center border-destructive/30 text-center">
          <CardHeader className="items-center">
            <AlertCircle className="size-8 text-destructive" />
            <CardTitle>Unable to load downloads</CardTitle>
            <CardDescription>{loadError}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" onClick={fetchDownloads}>
              <RotateCcw data-icon="inline-start" />
              Try again
            </Button>
          </CardContent>
        </Card>
      ) : isLoading && downloads.length === 0 ? (
        <Card className="min-h-[300px] items-center justify-center">
          <CardHeader className="items-center text-center">
            <CardTitle>Loading download queue</CardTitle>
            <CardDescription>Retrieving durable download state.</CardDescription>
          </CardHeader>
          <CardContent className="flex w-full max-w-sm flex-col gap-3">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-4/5" />
            <Skeleton className="h-4 w-3/5" />
          </CardContent>
        </Card>
      ) : (
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
                          : flexRender(header.column.columnDef.header, header.getContext())}
                      </TableHead>
                    )
                  })}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {table.getRowModel().rows.length > 0 ? (
                table.getRowModel().rows.map((row) => (
                  <TableRow key={row.id} className="hover:bg-muted/40 transition-colors border-b border-border/50 text-sm">
                    {row.getVisibleCells().map((cell) => {
                      const size = cell.column.columnDef.size
                      return (
                        <TableCell
                          key={cell.id}
                          style={size ? { width: `${size}px`, maxWidth: `${size}px` } : undefined}
                          className="py-2.5 px-3 text-sm align-middle"
                        >
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </TableCell>
                      )
                    })}
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={columns.length} className="h-32 text-center text-sm text-muted-foreground">
                    <div className="flex flex-col items-center justify-center gap-1.5">
                      <p className="font-medium text-foreground">
                        No active downloads
                      </p>
                      <p>
                        Go to Collection and queue FASTQ, SRA, or FASTA files to begin downloading.
                      </p>
                    </div>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={isCancelAllDialogOpen} onOpenChange={setIsCancelAllDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancel all incomplete downloads?</DialogTitle>
            <DialogDescription>
              This cancels and removes every queued, paused, active, or failed task from the queue.
              Their partial download files are removed; completed files are kept.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCancelAllDialogOpen(false)}>
              Keep downloads
            </Button>
            <Button variant="destructive" onClick={confirmCancelAll}>
              <XCircle data-icon="inline-start" />
              Cancel and remove tasks
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
