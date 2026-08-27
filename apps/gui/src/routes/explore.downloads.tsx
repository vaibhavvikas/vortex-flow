import { createFileRoute } from "@tanstack/react-router"
import { ExploreView } from "@/features/explore"

export const Route = createFileRoute("/explore/downloads")({
  component: ExploreDownloadsComponent,
})

function ExploreDownloadsComponent() {
  return <ExploreView activeSubView="downloads" />
}
