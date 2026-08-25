import * as React from "react"
import { SidebarProvider, SidebarInset, SidebarTrigger } from "@/components/ui/sidebar"
import { Separator } from "@/components/ui/separator"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import { AppSidebar, type TabId } from "@/components/app-sidebar"
import { StatusBar } from "@/components/status-bar"
import { WorkflowCanvas, type WorkflowNodeData } from "@/components/workflow-canvas"
import { InspectorPanel } from "@/components/inspector-panel"
import { LogDrawer } from "@/components/log-drawer"
import { ExploreView } from "@/components/views/explore-view"
import { RunsView } from "@/components/views/runs-view"
import { ResultsView } from "@/components/views/results-view"
import { SettingsView } from "@/components/views/settings-view"
import { useCollection } from "@/hooks/use-collection"
import type { Node } from "@xyflow/react"
import { ScrollArea } from "@/components/ui/scroll-area"
import type { SraRecord } from "@/services/sra-service"

export function AppLayout() {
  const [activeTab, setActiveTab] = React.useState<TabId>("search")
  const [isInspectorOpen, setIsInspectorOpen] = React.useState(false)
  const [isLogDrawerOpen, setIsLogDrawerOpen] = React.useState(false)
  const [selectedNode, setSelectedNode] = React.useState<Node<WorkflowNodeData> | null>(null)
  const [selectedRecord, setSelectedRecord] = React.useState<{ record: SraRecord; db: string } | null>(null)
  const { collection, addToCollection, removeFromCollection } = useCollection()

  const handleSelectRecord = (record: SraRecord, db: string) => {
    setSelectedRecord({ record, db })
    setIsInspectorOpen(true)
  }

  const isExploreTab = activeTab === "search" || activeTab === "collection" || activeTab === "downloads"

  return (
    <div className="flex flex-col flex-1 w-full min-h-0 overflow-hidden">
      {/* Middle Workspace Layout */}
      <div className="relative flex-1 flex w-full min-h-0 overflow-hidden [transform:translateZ(0)]">
        <SidebarProvider className="flex flex-1 w-full h-full min-h-0 overflow-hidden min-h-full">
          <AppSidebar
            activeTab={activeTab}
            setActiveTab={setActiveTab}
            collectionCount={collection.length}
          />

          <SidebarInset className="flex flex-row flex-1 min-h-0 overflow-hidden border border-border/50 shadow-sm rounded-xl my-2 mr-2 ml-0 group-data-[collapsible=icon]:ml-2">
            <main className="flex-1 h-full flex flex-col min-w-0 bg-background overflow-hidden">
              <header className="flex h-11 shrink-0 items-center justify-between gap-2 border-b border-border px-4 bg-background">
                <div className="flex items-center gap-2">
                  <SidebarTrigger className="-ml-1" />
                  <Separator orientation="vertical" className="mr-2 h-4" />
                  <Breadcrumb>
                    <BreadcrumbList>
                      <BreadcrumbItem>
                        <span className="text-xs text-muted-foreground">VortexFlow</span>
                      </BreadcrumbItem>
                      <BreadcrumbSeparator />
                      {isExploreTab ? (
                        <>
                          <BreadcrumbItem>
                            <span className="text-xs text-muted-foreground">Explore</span>
                          </BreadcrumbItem>
                          <BreadcrumbSeparator />
                          <BreadcrumbItem>
                            <BreadcrumbPage className="text-xs font-semibold capitalize">
                              {activeTab}
                            </BreadcrumbPage>
                          </BreadcrumbItem>
                        </>
                      ) : (
                        <BreadcrumbItem>
                          <BreadcrumbPage className="text-xs font-semibold capitalize">
                            {activeTab}
                          </BreadcrumbPage>
                        </BreadcrumbItem>
                      )}
                    </BreadcrumbList>
                  </Breadcrumb>
                </div>
              </header>

              <ScrollArea className="flex-1 h-full min-h-0">
                {isExploreTab && (
                  <ExploreView
                    activeSubView={activeTab as "search" | "collection" | "downloads"}
                    collection={collection}
                    onAddToCollection={addToCollection}
                    onRemoveFromCollection={removeFromCollection}
                    onSelectRecord={handleSelectRecord}
                  />
                )}
                {activeTab === "workflow" && (
                  <WorkflowCanvas onSelectNode={(node) => setSelectedNode(node)} />
                )}
                {activeTab === "runs" && <RunsView />}
                {activeTab === "results" && <ResultsView />}
                {activeTab === "settings" && <SettingsView />}
              </ScrollArea>

              <LogDrawer
                isOpen={isLogDrawerOpen}
                onClose={() => setIsLogDrawerOpen(false)}
              />
            </main>

            <InspectorPanel
              isOpen={isInspectorOpen}
              onClose={() => setIsInspectorOpen(false)}
              selectedNode={selectedNode}
              selectedRecord={selectedRecord}
            />
          </SidebarInset>
        </SidebarProvider>
      </div>

      {/* Bottom StatusBar */}
      <StatusBar
        activeTab={activeTab}
        isLogDrawerOpen={isLogDrawerOpen}
        onToggleLogDrawer={() => setIsLogDrawerOpen((prev) => !prev)}
      />
    </div>
  )
}
