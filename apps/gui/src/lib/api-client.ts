import { getApiConfig } from "@/lib/api-config"

export async function apiFetch<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const { baseUrl, token } = await getApiConfig()
  const res = await fetch(new URL(endpoint, baseUrl), {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options?.headers,
    },
  })

  if (!res.ok) {
    throw new Error(`API Error ${res.status}: ${res.statusText}`)
  }

  return res.json() as Promise<T>
}

/** Opens an authenticated SSE stream without exposing the API token in its URL. */
export function openApiEventStream(
  endpoint: string,
  onMessage: (data: string) => void,
  onError?: (error: unknown) => void,
): () => void {
  const controller = new AbortController()

  void (async () => {
    try {
      const { baseUrl, token } = await getApiConfig()
      const response = await fetch(new URL(endpoint, baseUrl), {
        signal: controller.signal,
        headers: {
          Accept: "text/event-stream",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      })
      if (!response.ok || !response.body) {
        throw new Error(`Event stream failed: HTTP ${response.status}`)
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ""
      try {
        while (!controller.signal.aborted) {
          const { value, done } = await reader.read()
          if (done) break
          buffer += decoder.decode(value, { stream: true })
          const events = buffer.split("\n\n")
          buffer = events.pop() ?? ""
          for (const event of events) {
            const data = event
              .split("\n")
              .filter((line) => line.startsWith("data:"))
              .map((line) => line.slice(5).trimStart())
              .join("\n")
            if (data) onMessage(data)
          }
        }
      } finally {
        await reader.cancel().catch(() => undefined)
      }
    } catch (error) {
      if (!controller.signal.aborted) onError?.(error)
    }
  })()

  return () => controller.abort()
}
