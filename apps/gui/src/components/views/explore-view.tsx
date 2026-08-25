import { ExploreSearchTab, type SraRecord } from "./explore-search-tab"
import { ExploreCollectionTab } from "./explore-collection-tab"
import { ExploreDownloadsView } from "./explore-downloads-view"

interface ExploreViewProps {
  activeSubView: "search" | "collection" | "downloads"
  collection: SraRecord[]
  onAddToCollection: (records: SraRecord[]) => void
  onRemoveFromCollection: (ids: string[]) => void
  onSelectRecord?: (record: SraRecord, db: string) => void
}

export function ExploreView({
  activeSubView,
  collection,
  onAddToCollection,
  onRemoveFromCollection,
  onSelectRecord,
}: ExploreViewProps) {
  return (
    <div className="p-6 space-y-6 w-full">
      <div>
        <h2 className="text-xl font-bold tracking-tight">Genomic Dataset Explorer</h2>
        <p className="text-xs text-muted-foreground">
          Search external NCBI SRA databases, manage sequencing runs, and curate datasets for downstream pipelines
        </p>
      </div>

      <div className="w-full space-y-4">
        {activeSubView === "search" && (
          <ExploreSearchTab
            onAddToCollection={onAddToCollection}
            onSelectRecord={onSelectRecord}
          />
        )}

        {activeSubView === "collection" && (
          <ExploreCollectionTab
            collection={collection}
            onRemoveFromCollection={onRemoveFromCollection}
            onSelectRecord={onSelectRecord}
          />
        )}

        {activeSubView === "downloads" && <ExploreDownloadsView />}
      </div>
    </div>
  )
}

