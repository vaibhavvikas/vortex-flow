import * as React from "react"
import {
  Search,
  Bookmark,
  Download,
  Workflow,
  Play,
  BarChart3,
  Settings,
  Dna,
} from "lucide-react"

import { NavMain, type NavMainItem } from "@/components/nav-main"
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar"

export type TabId = "search" | "collection" | "downloads" | "workflow" | "runs" | "results" | "settings"

interface AppSidebarProps extends React.ComponentProps<typeof Sidebar> {
  activeTab: TabId
  setActiveTab: (tab: TabId) => void
  collectionCount?: number
}

export function AppSidebar({
  activeTab,
  setActiveTab,
  collectionCount = 0,
  ...props
}: AppSidebarProps) {
  const exploreNavItems: NavMainItem[] = [
    {
      id: "search",
      title: "Search",
      icon: Search,
      isActive: activeTab === "search",
      onClick: () => setActiveTab("search"),
    },
    {
      id: "collection",
      title: "Collection",
      icon: Bookmark,
      isActive: activeTab === "collection",
      badge: collectionCount,
      onClick: () => setActiveTab("collection"),
    },
    {
      id: "downloads",
      title: "Downloads",
      icon: Download,
      isActive: activeTab === "downloads",
      onClick: () => setActiveTab("downloads"),
    },
  ]

  const workspaceNavItems: NavMainItem[] = [
    {
      id: "workflow",
      title: "Workflow",
      icon: Workflow,
      isActive: activeTab === "workflow",
      onClick: () => setActiveTab("workflow"),
    },
    {
      id: "runs",
      title: "Runs",
      icon: Play,
      isActive: activeTab === "runs",
      onClick: () => setActiveTab("runs"),
    },
    {
      id: "results",
      title: "Results",
      icon: BarChart3,
      isActive: activeTab === "results",
      onClick: () => setActiveTab("results"),
    },
    {
      id: "settings",
      title: "Settings",
      icon: Settings,
      isActive: activeTab === "settings",
      onClick: () => setActiveTab("settings"),
    },
  ]

  return (
    <Sidebar variant="inset" collapsible="icon" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              size="lg"
              className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
            >
              <div className="bg-primary text-primary-foreground flex aspect-square size-8 items-center justify-center rounded-lg">
                <Dna className="size-4" />
              </div>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-semibold">VortexFlow</span>
                <span className="truncate text-xs text-muted-foreground">v2.4 Pro</span>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <NavMain label="Explore" items={exploreNavItems} />
        <NavMain label="Workspace" items={workspaceNavItems} />
      </SidebarContent>

      <SidebarRail />
    </Sidebar>
  )
}
