import { CheckCircle2, Terminal, Cpu, Activity } from "lucide-react"
import { Separator } from "@/components/ui/separator"
import { Badge } from "@/components/ui/badge"

interface StatusBarProps {
  activeTab: string
  isLogDrawerOpen: boolean
  onToggleLogDrawer: () => void
}

export function StatusBar({
  activeTab,
  isLogDrawerOpen,
  onToggleLogDrawer,
}: StatusBarProps) {
  return (
    <footer className="h-7 shrink-0 border-t border-border bg-sidebar text-sidebar-foreground flex items-center justify-between px-4 text-xs font-sans select-none z-20 w-full">
      {/* Left indicators */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1.5 text-emerald-500 font-medium">
          <CheckCircle2 className="size-3.5" />
          <span>VortexFlow Engine: Ready</span>
        </div>

        <Separator orientation="vertical" className="h-3.5 bg-sidebar-border" />

        <div className="flex items-center gap-1.5 text-muted-foreground">
          <Activity className="size-3.5 text-primary" />
          <span className="capitalize">{activeTab} Mode</span>
        </div>

        <Separator orientation="vertical" className="h-3.5 bg-sidebar-border" />

        <span className="text-muted-foreground truncate max-w-xs">
          Pipeline: WGS germline-v2
        </span>
      </div>

      {/* Right indicators & Version */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onToggleLogDrawer}
          className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
          title="Toggle Terminal Logs"
        >
          <Terminal className="size-3.5" />
          <span>Logs: {isLogDrawerOpen ? "Active" : "5 events"}</span>
        </button>

        <Separator orientation="vertical" className="h-3.5 bg-sidebar-border" />

        <div className="flex items-center gap-1.5 text-muted-foreground">
          <Cpu className="size-3.5 text-primary" />
          <span>Rust Native Core</span>
        </div>

        <Separator orientation="vertical" className="h-3.5 bg-sidebar-border" />

        <Badge variant="outline" className="text-[10px] h-4.5 px-1.5 py-0 border-sidebar-border text-muted-foreground font-mono">
          v2.4.0 Pro
        </Badge>
      </div>
    </footer>
  )
}
