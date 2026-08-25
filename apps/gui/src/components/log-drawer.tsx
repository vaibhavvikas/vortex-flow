import * as React from "react"
import { Terminal, Trash2, ChevronDown, Search } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"

import { logService, type LogEntry } from "@/services/log-service"

interface LogDrawerProps {
  isOpen: boolean
  onClose: () => void
}

export function LogDrawer({ isOpen, onClose }: LogDrawerProps) {
  const [filter, setFilter] = React.useState("")
  const [logs, setLogs] = React.useState<LogEntry[]>([])
  const logContainerRef = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    let isMounted = true

    logService.fetchInitialLogs().then((initial) => {
      if (isMounted && initial.length > 0) {
        setLogs(initial)
      }
    })

    const unsubscribe = logService.connectStream((newEntry) => {
      if (isMounted) {
        setLogs((prev) => {
          if (prev.some((e) => e.id === newEntry.id)) return prev
          return [...prev, newEntry]
        })
      }
    })

    return () => {
      isMounted = false
      unsubscribe()
    }
  }, [])

  React.useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight
    }
  }, [logs])

  if (!isOpen) return null

  const filteredLogs = logs.filter(
    (log) =>
      log.message.toLowerCase().includes(filter.toLowerCase()) ||
      log.source.toLowerCase().includes(filter.toLowerCase())
  )

  return (
    <div className="border-t border-border bg-card flex flex-col h-48 w-full shrink-0 font-mono text-xs">
      <div className="px-4 py-2 border-b border-border flex items-center justify-between bg-card/80 font-sans">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 font-semibold text-xs text-foreground">
            <Terminal className="size-4 text-primary" />
            <span>Execution Terminal & Logs</span>
          </div>
          <Badge variant="outline" className="text-[10px]">
            {filteredLogs.length} events
          </Badge>
        </div>

        <div className="flex items-center gap-2">
          <div className="relative w-48">
            <Input
              placeholder="Filter logs..."
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="h-7 text-xs pr-7"
            />
            <Search className="size-3.5 absolute right-2 top-2 text-muted-foreground" />
          </div>

          <Button
            variant="ghost"
            size="icon-xs"
            onClick={() => setLogs([])}
            title="Clear Terminal Logs"
          >
            <Trash2 className="size-3.5" />
          </Button>

          <Button
            variant="ghost"
            size="icon-xs"
            onClick={onClose}
            title="Minimize Log Drawer"
          >
            <ChevronDown className="size-3.5" />
          </Button>
        </div>
      </div>

      <div ref={logContainerRef} className="flex-1 overflow-y-auto p-3 space-y-1 bg-background/50">
        {filteredLogs.length === 0 ? (
          <div className="text-muted-foreground text-center py-4 font-sans">No matching log entries found</div>
        ) : (
          filteredLogs.map((log) => (
            <div key={log.id} className="flex items-start gap-2 leading-relaxed">
              <span className="text-muted-foreground shrink-0">[{log.timestamp}]</span>
              <Badge
                variant={
                  log.level === "error"
                    ? "destructive"
                    : log.level === "warn"
                    ? "secondary"
                    : "outline"
                }
                className="text-[10px] px-1 py-0 uppercase shrink-0"
              >
                {log.level}
              </Badge>
              <span className="font-semibold text-primary/90 shrink-0">[{log.source}]</span>
              <span className="text-foreground">{log.message}</span>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
