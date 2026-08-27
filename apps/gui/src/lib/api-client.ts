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
