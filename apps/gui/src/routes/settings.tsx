import { createFileRoute } from "@tanstack/react-router"
import { SettingsView } from "@/features/settings"

export const Route = createFileRoute("/settings")({
  component: SettingsView,
})
