const API_BASE_URL = import.meta.env.VITE_API_URL || "http://127.0.0.1:8080"

export async function apiFetch<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${endpoint}`, {
    headers: {
      "Content-Type": "application/json",
      ...options?.headers,
    },
    ...options,
  })

  if (!res.ok) {
    throw new Error(`API Error ${res.status}: ${res.statusText}`)
  }

  return res.json() as Promise<T>
}
