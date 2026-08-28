import * as React from "react"
import {
  Search,
  FolderInput,
  FolderDown,
  Boxes,
  Plus,
  PanelLeftClose,
  Dna,
  GripVertical,
  ChevronRight,
  Folder,
  FolderOpen,
  ArrowRight,
  Sliders,
} from "lucide-react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { extensionService } from "@/features/extensions/services/extension-service"
import { getSocketColor } from "./nodes/base-node-card"
import type { ToolManifest } from "@/features/extensions/types"
import type { WorkflowPort } from "../types"
import { cn } from "@/lib/utils"

export interface NodePaletteItem {
  id: string
  title: string
  category: string
  description: string
  type: string
  kind: "folder_input" | "resfinder" | "output_save" | "tool"
  tool_id?: string
  manifest?: ToolManifest
  inputs: WorkflowPort[]
  outputs: WorkflowPort[]
  defaultParams: Record<string, any>
  icon: React.ComponentType<{ className?: string }>
}

const BUILTIN_NODES: NodePaletteItem[] = [
  {
    id: "folder_input",
    title: "Folder Input",
    category: "Data Ingestion",
    description: "Ingests raw FASTQ, FASTA, or FNA sequencing reads from a local directory.",
    type: "folderInput",
    kind: "folder_input",
    inputs: [],
    outputs: [
      {
        id: "sequence_files",
        name: "Sequence Files",
        socket_type: "sequence_folder",
        direction: "output",
      },
    ],
    defaultParams: {
      directory_path: "",
      file_pattern: "*.fasta,*.fna,*.fa,*.fastq",
    },
    icon: FolderInput,
  },
  {
    id: "output_save",
    title: "Output Directory Save",
    category: "Sink & Storage",
    description: "Exports pipeline analytical summaries, TSVs, and workflow run outputs.",
    type: "outputSave",
    kind: "output_save",
    inputs: [
      {
        id: "results",
        name: "Input Data / Report",
        socket_type: "any",
        direction: "input",
      },
    ],
    outputs: [],
    defaultParams: {
      destination_dir: "",
      export_format: "tsv",
      auto_open: true,
    },
    icon: FolderDown,
  },
]

interface WorkflowNodePaletteProps {
  isOpen?: boolean
  onClose?: () => void
  onAddNode?: (template: NodePaletteItem) => void
}

export function WorkflowNodePalette({ isOpen = true, onClose, onAddNode }: WorkflowNodePaletteProps) {
  const [searchQuery, setSearchQuery] = React.useState("")
  const [manifestItems, setManifestItems] = React.useState<NodePaletteItem[]>([])
  const [expandedCategories, setExpandedCategories] = React.useState<Set<string>>(
    new Set(["Data Ingestion", "AMR & Resistance", "Sink & Storage", "Quality Control", "General"])
  )
  const asideRef = React.useRef<HTMLElement>(null)
  const [hoveredItem, setHoveredItem] = React.useState<{
    item: NodePaletteItem
    top: number
  } | null>(null)
  const hoverTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)

  React.useEffect(() => {
    let isMounted = true
    async function loadManifests() {
      const extensions = await extensionService.getExtensions()
      if (!isMounted) return

      // Only display installed extensions in the node palette
      const items: NodePaletteItem[] = extensions
        .filter((ext) => ext.isInstalled)
        .map(({ manifest }) => {
          const inputs: WorkflowPort[] = manifest.inputs.map((inp) => ({
            id: inp.id,
            name: inp.name,
            socket_type: (inp.socket_type as any) || "any",
            direction: "input",
          }))

          const outputs: WorkflowPort[] = manifest.outputs.map((out) => ({
            id: out.id,
            name: out.name,
            socket_type: (out.socket_type as any) || "any",
            direction: "output",
          }))

          const defaultParams: Record<string, any> = {}
          manifest.params?.forEach((p) => {
            defaultParams[p.id] = p.default
          })

          return {
            id: manifest.id,
            title: `${manifest.name} v${manifest.version}`,
            category: manifest.category || "Bioinformatics Tool",
            description: manifest.description,
            type: "dynamicTool",
            kind: "tool",
            tool_id: manifest.id,
            manifest,
            inputs,
            outputs,
            defaultParams,
            icon: Dna,
          }
        })

      setManifestItems(items)

      // Auto-expand categories with newly loaded items
      setExpandedCategories((prev) => {
        const next = new Set(prev)
        items.forEach((it) => next.add(it.category))
        return next
      })
    }

    loadManifests()
    return () => {
      isMounted = false
    }
  }, [])

  const allItems = React.useMemo(() => {
    return [...BUILTIN_NODES, ...manifestItems]
  }, [manifestItems])

  const filteredItems = React.useMemo(() => {
    const q = searchQuery.toLowerCase().trim()
    if (!q) return allItems
    return allItems.filter(
      (item) =>
        item.title.toLowerCase().includes(q) ||
        item.category.toLowerCase().includes(q) ||
        item.description.toLowerCase().includes(q)
    )
  }, [allItems, searchQuery])

  // Group items by category
  const categories = React.useMemo(() => {
    const map = new Map<string, NodePaletteItem[]>()
    filteredItems.forEach((item) => {
      const cat = item.category || "General"
      const existing = map.get(cat) || []
      existing.push(item)
      map.set(cat, existing)
    })
    return Array.from(map.entries())
  }, [filteredItems])

  const toggleCategory = (categoryName: string) => {
    setExpandedCategories((prev) => {
      const next = new Set(prev)
      if (next.has(categoryName)) {
        next.delete(categoryName)
      } else {
        next.add(categoryName)
      }
      return next
    })
  }

  const handleDragStart = (e: React.DragEvent, item: NodePaletteItem) => {
    setHoveredItem(null)
    e.dataTransfer.setData("application/reactflow/node", JSON.stringify(item))
    e.dataTransfer.effectAllowed = "move"
  }

  const handleMouseEnterItem = (e: React.MouseEvent<HTMLDivElement>, item: NodePaletteItem) => {
    if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current)
    if (!asideRef.current) return

    const asideRect = asideRef.current.getBoundingClientRect()
    const itemRect = e.currentTarget.getBoundingClientRect()
    const relativeTop = itemRect.top - asideRect.top
    const cardEstimatedHeight = 260
    const clampedTop = Math.max(8, Math.min(asideRect.height - cardEstimatedHeight - 8, relativeTop))

    hoverTimeoutRef.current = setTimeout(() => {
      setHoveredItem({
        item,
        top: clampedTop,
      })
    }, 40)
  }

  const handleMouseLeaveItem = () => {
    if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current)
    hoverTimeoutRef.current = setTimeout(() => {
      setHoveredItem(null)
    }, 100)
  }

  return (
    <aside
      ref={asideRef}
      className={cn(
        "h-full border-r bg-card/70 backdrop-blur-md flex flex-col z-20 shrink-0 select-none relative transition-all duration-300 ease-in-out overflow-visible",
        isOpen
          ? "w-64 sm:w-72 border-border/60 opacity-100 translate-x-0"
          : "w-0 border-transparent opacity-0 -translate-x-full pointer-events-none"
      )}
    >
      <div className="w-64 sm:w-72 h-full flex flex-col shrink-0 overflow-hidden">
        {/* Top Header */}
        <div className="p-3 border-b border-border/60 flex items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-2">
            <div className="size-7 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
              <Boxes className="size-3.5" />
            </div>
            <div>
              <h3 className="text-xs font-semibold text-foreground">Node Tree</h3>
              <p className="text-[10px] text-muted-foreground">Components & tools</p>
            </div>
          </div>

          {onClose && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onClose}
              className="size-7 p-0 text-muted-foreground hover:text-foreground cursor-pointer"
              title="Collapse Palette"
            >
              <PanelLeftClose className="size-3.5" />
            </Button>
          )}
        </div>

        {/* Search Input */}
        <div className="p-2.5 border-b border-border/50 shrink-0">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 size-3.5 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search nodes & tools..."
              className="h-8 pl-8 text-xs bg-background/50"
            />
          </div>
        </div>

        {/* Nodes File Tree Scroll Area */}
        <ScrollArea className="flex-1 px-2 py-2">
          <div className="flex flex-col gap-1 pb-4">
            {categories.length === 0 ? (
              <div className="flex flex-col items-center justify-center p-6 text-center text-muted-foreground">
                <Boxes className="size-8 opacity-40 mb-2" />
                <p className="text-xs">No matching nodes found</p>
              </div>
            ) : (
              categories.map(([categoryName, items]) => {
                const isExpanded = searchQuery.trim().length > 0 || expandedCategories.has(categoryName)

                return (
                  <div key={categoryName} className="flex flex-col">
                    {/* Category Folder Header Row */}
                    <button
                      type="button"
                      onClick={() => toggleCategory(categoryName)}
                      className="flex w-full items-center justify-between gap-1.5 px-2 py-1.5 rounded-md hover:bg-muted/60 text-foreground transition-colors cursor-pointer text-left group/cat"
                    >
                      <div className="flex items-center gap-1.5 min-w-0">
                        <ChevronRight
                          className={cn(
                            "size-3.5 text-muted-foreground transition-transform duration-200 shrink-0",
                            isExpanded && "rotate-90 text-foreground"
                          )}
                        />
                        {isExpanded ? (
                          <FolderOpen className="size-3.5 text-primary shrink-0" />
                        ) : (
                          <Folder className="size-3.5 text-muted-foreground shrink-0 group-hover/cat:text-foreground" />
                        )}
                        <span className="text-xs font-semibold truncate text-foreground/90">
                          {categoryName}
                        </span>
                      </div>

                      <Badge
                        variant="secondary"
                        className="text-[9px] px-1.5 py-0 h-4 font-normal text-muted-foreground group-hover/cat:text-foreground"
                      >
                        {items.length}
                      </Badge>
                    </button>

                    {/* Smooth Collapsible Leaf Items inside Folder */}
                    <div
                      className={cn(
                        "grid transition-all duration-200 ease-in-out overflow-hidden",
                        isExpanded ? "grid-rows-[1fr] opacity-100 my-0.5" : "grid-rows-[0fr] opacity-0 pointer-events-none"
                      )}
                    >
                      <div className="overflow-hidden">
                        <div className="flex flex-col pl-4 ml-2 border-l border-border/50 gap-0.5 py-0.5">
                          {items.map((item) => {
                            const IconComponent = item.icon

                            return (
                              <div
                                key={item.id}
                                draggable
                                onDragStart={(e) => handleDragStart(e, item)}
                                onDoubleClick={() => onAddNode?.(item)}
                                onMouseEnter={(e) => handleMouseEnterItem(e, item)}
                                onMouseLeave={handleMouseLeaveItem}
                                className="group/item relative flex items-center justify-between gap-2 px-2 py-1.5 rounded-md hover:bg-accent/60 hover:text-accent-foreground transition-all cursor-grab active:cursor-grabbing border border-transparent hover:border-border/80"
                              >
                                <div className="flex items-center gap-2 min-w-0">
                                  <div className="size-5 rounded-md bg-muted/80 flex items-center justify-center text-muted-foreground group-hover/item:text-primary group-hover/item:bg-primary/10 transition-colors shrink-0">
                                    <IconComponent className="size-3" />
                                  </div>
                                  <span className="text-xs font-medium truncate text-foreground/90 group-hover/item:text-foreground">
                                    {item.title}
                                  </span>
                                </div>

                                <div className="flex items-center gap-1 opacity-0 group-hover/item:opacity-100 transition-opacity">
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      onAddNode?.(item)
                                    }}
                                    className="size-5 rounded flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted cursor-pointer"
                                    title="Add node to canvas"
                                  >
                                    <Plus className="size-3" />
                                  </button>
                                  <GripVertical className="size-3 text-muted-foreground/50" />
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </ScrollArea>
      </div>

      {/* Unclipped High-Fidelity Miniature Node Preview Card */}
      {isOpen && hoveredItem && (
        <div
          style={{ top: `${hoveredItem.top}px` }}
          className="absolute left-full ml-3 w-80 z-50 rounded-xl border border-border bg-card shadow-2xl overflow-hidden pointer-events-none animate-in fade-in-0 zoom-in-95 duration-100"
        >
          {/* Card Header (Matches BaseNodeCard) */}
          <div className="flex w-full flex-col border-b border-border/80 bg-muted/20">
            <div className="flex w-full items-center justify-between gap-2 px-4 py-2.5">
              <div className="flex items-center gap-2 overflow-hidden">
                <hoveredItem.item.icon className="size-4 text-foreground/80 shrink-0" />
                <span className="text-sm font-semibold truncate text-foreground tracking-tight">
                  {hoveredItem.item.title}
                </span>
              </div>
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4">
                {hoveredItem.item.category}
              </Badge>
            </div>

            <div className="px-4 pb-2.5">
              <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2">
                {hoveredItem.item.description}
              </p>
            </div>
          </div>

          {/* Sockets Section (Inputs Left, Outputs Right) */}
          {(hoveredItem.item.inputs.length > 0 || hoveredItem.item.outputs.length > 0) && (
            <div className="flex flex-col py-1.5 border-b border-border/60 bg-muted/30 gap-1 px-4 text-xs">
              {hoveredItem.item.inputs.map((inp, idx) => {
                const color = getSocketColor(inp.socket_type, idx)
                return (
                  <div key={`in_${inp.id}`} className="flex items-center justify-between gap-2 text-foreground/90">
                    <div className="flex items-center gap-1.5">
                      <span className="size-2 rounded-full shrink-0 shadow-xs" style={{ backgroundColor: color }} />
                      <span className="font-medium">{inp.name}</span>
                    </div>
                    <span className="text-[10px] text-muted-foreground font-mono">
                      {inp.socket_type} (In)
                    </span>
                  </div>
                )
              })}

              {hoveredItem.item.outputs.map((out, idx) => {
                const color = getSocketColor(out.socket_type, idx + 2)
                return (
                  <div key={`out_${out.id}`} className="flex items-center justify-between gap-2 text-foreground/90">
                    <span className="text-[10px] text-muted-foreground font-mono">
                      (Out) {out.socket_type}
                    </span>
                    <div className="flex items-center gap-1.5">
                      <span className="font-medium">{out.name}</span>
                      <span className="size-2 rounded-full shrink-0 shadow-xs" style={{ backgroundColor: color }} />
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* Configurable Parameters Summary */}
          {Object.keys(hoveredItem.item.defaultParams || {}).length > 0 && (
            <div className="px-4 py-2 flex items-center justify-between text-xs text-muted-foreground border-b border-border/40">
              <div className="flex items-center gap-1.5">
                <Sliders className="size-3 text-muted-foreground" />
                <span>Configurable Params</span>
              </div>
              <span className="font-semibold text-foreground font-mono text-[11px]">
                {Object.keys(hoveredItem.item.defaultParams).length}
              </span>
            </div>
          )}

          {/* Card Footer */}
          <div className="px-4 py-1.5 bg-muted/50 flex items-center justify-between text-[10px] text-muted-foreground font-medium">
            <span>Drag or double-click to add to canvas</span>
            <ArrowRight className="size-3 text-primary" />
          </div>
        </div>
      )}
    </aside>
  )
}
