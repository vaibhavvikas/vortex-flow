import { createFileRoute } from "@tanstack/react-router"
import { ExploreView, useCollection } from "@/features/explore"

export const Route = createFileRoute("/explore/collection")({
  component: ExploreCollectionComponent,
})

function ExploreCollectionComponent() {
  const { collection, addToCollection, removeFromCollection } = useCollection()
  return (
    <ExploreView
      activeSubView="collection"
      collection={collection}
      onAddToCollection={addToCollection}
      onRemoveFromCollection={removeFromCollection}
    />
  )
}
