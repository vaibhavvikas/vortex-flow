import { getApiConfig, getApiUrl } from "@/lib/api-config"

export interface LogEntry {
  id: string
  timestamp: string
  level: "info" | "warn" | "error" | "debug" | "trace"
  source: string
  message: string
}

export type LogListener = (entry: LogEntry) => void

class LogService {
  private eventSource: EventSource | null = null
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

    if (!this.eventSource) {
      getApiUrl("/api/logs/stream", true).then((url) => {
        if (this.eventSource || this.listeners.size === 0) return
        this.eventSource = new EventSource(url)

        this.eventSource.onmessage = (event) => {
          try {
            const entry: LogEntry = JSON.parse(event.data)
            this.listeners.forEach((listener) => listener(entry))
          } catch {
            // Ignore parse errors
          }
        }

        this.eventSource.onerror = () => {
          // Reconnect logic managed automatically by EventSource
        }
      }).catch(() => {
        // EventSource unsupported or endpoint unreachable
      })
    }

    return () => {
      this.listeners.delete(onLog)
      if (this.listeners.size === 0 && this.eventSource) {
        this.eventSource.close()
        this.eventSource = null
      }
    }
  }
}

export const logService = new LogService()
