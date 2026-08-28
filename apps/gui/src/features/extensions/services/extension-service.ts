import { apiFetch } from "@/lib/api-client"
import type { ToolManifest, ExtensionItem } from "../types"

interface ExtensionStatusDto {
  manifest: ToolManifest
  is_installed: boolean
}

export const extensionService = {
  async getExtensions(): Promise<ExtensionItem[]> {
    try {
      const list = await apiFetch<ExtensionStatusDto[]>("/api/manifests")
      return list.map((item) => ({
        manifest: item.manifest,
        isInstalled: item.is_installed,
      }))
    } catch (e) {
      console.error("Failed to load extensions:", e)
      return []
    }
  },

  async installExtension(id: string): Promise<boolean> {
    try {
      const res = await apiFetch<{ success: boolean; message: string }>(`/api/manifests/${id}/install`, {
        method: "POST",
      })
      return res.success
    } catch (e) {
      console.error(`Failed to install extension ${id}:`, e)
      return false
    }
  },

  async getExtensionStatus(id: string): Promise<boolean> {
    try {
      const res = await apiFetch<ExtensionStatusDto>(`/api/manifests/${id}/status`)
      return res.is_installed
    } catch (e) {
      return false
    }
  },

  async uninstallExtension(id: string): Promise<boolean> {
    try {
      const res = await apiFetch<{ success: boolean; message: string }>(`/api/manifests/${id}/uninstall`, {
        method: "POST",
      })
      return res.success
    } catch (e) {
      console.error(`Failed to uninstall extension ${id}:`, e)
      return false
    }
  },

  async getLogs(id: string): Promise<{ logs: string[]; isInstalled: boolean }> {
    try {
      const res = await apiFetch<{ tool_id: string; is_installed: boolean; logs: string[] }>(`/api/manifests/${id}/logs`)
      return { logs: res.logs || [], isInstalled: res.is_installed }
    } catch (e) {
      return { logs: [], isInstalled: false }
    }
  },
}
