import { getApiConfig, getApiUrl } from "@/lib/api-config"
import { openApiEventStream } from "@/lib/api-client"

export interface LogEntry {
  id: string
  timestamp: string
  level: "info" | "warn" | "error" | "debug" | "trace"
  source: string
  message: string
}

export type LogListener = (entry: LogEntry) => void

class LogService {
  private closeStream: (() => void) | null = null
  private listeners: Set<LogListener> = new Set()
  private initialLogs: LogEntry[] = []

  public async fetchInitialLogs(): Promise<LogEntry[]> {
    try {
      const { token } = await getApiConfig()
      const res = await fetch(await getApiUrl("/api/logs"), {
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      })
      if (res.ok) {
        this.initialLogs = await res.json()
        return this.initialLogs
      }
    } catch {
      // Backend offline
    }
    return []
  }

  public connectStream(onLog: LogListener): () => void {
    this.listeners.add(onLog)

    if (!this.closeStream) {
      this.closeStream = openApiEventStream("/api/logs/stream", (data) => {
          try {
            const entry: LogEntry = JSON.parse(data)
            this.listeners.forEach((listener) => listener(entry))
          } catch {
            // Ignore parse errors
          }
      })
    }

    return () => {
      this.listeners.delete(onLog)
      if (this.listeners.size === 0 && this.closeStream) {
        this.closeStream()
        this.closeStream = null
      }
    }
  }
}

export const logService = new LogService()
