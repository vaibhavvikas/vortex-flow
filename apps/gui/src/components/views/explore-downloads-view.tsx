import { Download, HardDriveDownload } from "lucide-react"
import { Badge } from "@/components/ui/badge"

export function ExploreDownloadsView() {
  return (
    <div className="space-y-4">
      {/* Header Bar */}
      <div className="flex items-center justify-between bg-muted/40 p-3 rounded-lg border border-border">
        <div className="flex items-center gap-2">
          <Download className="size-4 text-primary" />
          <span className="text-xs font-semibold">Downloads</span>
          <Badge variant="secondary" className="text-[10px]">
            0 active
          </Badge>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="border border-border rounded-lg bg-card p-12 flex flex-col items-center justify-center text-center space-y-3 min-h-[300px]">
        <div className="p-3 bg-muted rounded-full text-muted-foreground">
          <HardDriveDownload className="size-8 text-muted-foreground/60" />
        </div>
        <div className="space-y-1 max-w-sm">
          <h3 className="text-sm font-semibold">Downloads</h3>
          <p className="text-xs text-muted-foreground">
            No active downloads. Queued sequence downloads and background data transfers will appear here.
          </p>
        </div>
      </div>
    </div>
  )
}
