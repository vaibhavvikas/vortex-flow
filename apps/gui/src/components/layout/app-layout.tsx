import * as React from "react"
import { useLocation, useNavigate, Outlet } from "@tanstack/react-router"
import { SidebarProvider, SidebarInset, SidebarTrigger } from "@/components/ui/sidebar"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import { AppSidebar, type TabId } from "@/components/layout/app-sidebar"
import { StatusBar } from "@/components/layout/status-bar"
import { InspectorPanel } from "@/components/common/inspector-panel"
import { LogDrawer } from "@/components/common/log-drawer"
import { useSearchStore } from "@/features/explore"
import type { WorkflowNodeData } from "@/features/workflows"
import type { Node } from "@xyflow/react"
import { ScrollArea } from "@/components/ui/scroll-area"

export function AppLayout() {
  const location = useLocation()
  const navigate = useNavigate()
  const [isLogDrawerOpen, setIsLogDrawerOpen] = React.useState(false)
  const [selectedNode, setSelectedNode] = React.useState<Node<WorkflowNodeData> | null>(null)
  
  const isInspectorOpen = useSearchStore((s) => s.isInspectorOpen)
  const selectedRecord = useSearchStore((s) => s.selectedRecord)
  const setIsInspectorOpen = useSearchStore((s) => s.setIsInspectorOpen)
  const setSelectedRecord = useSearchStore((s) => s.setSelectedRecord)

  // Determine active tab from URL path
  const pathname = location.pathname
  const activeTab: TabId | "not-found" = React.useMemo(() => {
    if (pathname.includes("/explore/collection")) return "collection"
    if (pathname.includes("/explore/downloads")) return "downloads"
    if (pathname.includes("/explore/search") || pathname === "/" || pathname === "/explore") return "search"
    if (pathname.includes("/workflow-v2")) return "workflow-v2"
    if (pathname.includes("/workflow")) return "workflow"
    if (pathname.includes("/extensions")) return "extensions"
    if (pathname.includes("/runs")) return "runs"
    if (pathname.includes("/results")) return "results"
    if (pathname.includes("/settings")) return "settings"
    return "not-found"
  }, [pathname])

  // Navigation handler
  const handleTabChange = (tab: TabId) => {
    switch (tab) {
      case "search":
        navigate({ to: "/explore/search" })
        break
      case "collection":
        navigate({ to: "/explore/collection" })
        break
      case "downloads":
        navigate({ to: "/explore/downloads" })
        break
      case "workflow":
        navigate({ to: "/workflow" })
        break
      case "extensions":
        navigate({ to: "/extensions" })
        break
      case "runs":
        navigate({ to: "/runs" })
        break
      case "results":
        navigate({ to: "/results" })
        break
      case "settings":
        navigate({ to: "/settings" })
        break
    }
  }

  // Auto-collapse inspector when switching tabs
  React.useEffect(() => {
    setIsInspectorOpen(false)
    setSelectedRecord(null)
    setSelectedNode(null)
  }, [activeTab, setIsInspectorOpen, setSelectedRecord])

  const isExploreTab = activeTab === "search" || activeTab === "collection" || activeTab === "downloads"

  return (
    <div className="flex flex-col flex-1 w-full min-h-0 overflow-hidden">
      {/* Middle Workspace Layout */}
      <div className="relative flex-1 flex w-full min-h-0 overflow-hidden [transform:translateZ(0)]">
        <SidebarProvider className="flex flex-1 w-full h-full min-h-0 overflow-hidden">
          <AppSidebar
            activeTab={activeTab}
            setActiveTab={handleTabChange}
          />

          <SidebarInset className="flex flex-row flex-1 min-h-0 overflow-hidden border border-border/50 shadow-sm rounded-xl my-2 mr-2 ml-0 group-data-[collapsible=icon]:ml-2">
            <main className="flex-1 h-full flex flex-col min-w-0 bg-background overflow-hidden">
              <header className="flex h-11 shrink-0 items-center justify-between gap-2 border-b border-border px-4 bg-background">
                <div className="flex items-center gap-2">
                  <SidebarTrigger className="-ml-1" />
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
                <Outlet />
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
