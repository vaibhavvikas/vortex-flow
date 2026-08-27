import { createFileRoute } from "@tanstack/react-router"
import { RunsView } from "@/features/runs"

export const Route = createFileRoute("/runs")({
  component: RunsView,
})
