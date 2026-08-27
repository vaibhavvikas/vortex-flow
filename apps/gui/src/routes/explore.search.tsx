import { createFileRoute } from "@tanstack/react-router"
import { ExploreView, useCollection } from "@/features/explore"

export const Route = createFileRoute("/explore/search")({
  component: ExploreSearchComponent,
})

function ExploreSearchComponent() {
  const { addToCollection } = useCollection()
  return (
    <ExploreView
      activeSubView="search"
      onAddToCollection={addToCollection}
    />
  )
}
