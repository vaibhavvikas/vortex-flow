import { createFileRoute } from "@tanstack/react-router"
import { ResultsView } from "@/features/results"

export const Route = createFileRoute("/results")({
  component: ResultsView,
})
