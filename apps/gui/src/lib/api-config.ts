export interface ApiConfig {
  baseUrl: string
  token?: string
}

declare global {
  interface Window {
    vortexflow?: {
      getApiConfig: () => Promise<ApiConfig>
    }
  }
}

const defaultConfig: ApiConfig = {
  baseUrl: import.meta.env.VITE_API_URL || "http://127.0.0.1:8080",
}

let configPromise: Promise<ApiConfig> | undefined

export function getApiConfig(): Promise<ApiConfig> {
  configPromise ??= window.vortexflow?.getApiConfig().catch(() => defaultConfig) ?? Promise.resolve(defaultConfig)
  return configPromise
}

export async function getApiUrl(endpoint: string): Promise<string> {
  const { baseUrl } = await getApiConfig()
  return new URL(endpoint, baseUrl).toString()
}
