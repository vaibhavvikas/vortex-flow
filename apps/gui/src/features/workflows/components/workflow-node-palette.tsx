import * as React from "react"
import {
  Dna,
  Search,
  Sparkles,
  Layers,
  ChevronRight,
  FileSpreadsheet,
  Eye,
  Filter,
  FolderInput,
  FolderDown,
} from "lucide-react"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { extensionService } from "@/features/extensions/services/extension-service"
import { getSocketColor, formatPortType } from "./nodes/base-node-card"
import type { ToolManifest, NodeDefinition, NodeType } from "@/features/extensions/types"
import type { InputPort, OutputPort } from "../types"
import { cn } from "@/lib/utils"
import { registerDragTemplate } from "./drag-template-store"

export interface NodePaletteItem {
  id: string
  title: string
  category: string
  description: string
  type: string
  kind: string
  tool_id?: string
  node_id?: string
  node_type?: NodeType
  manifest?: ToolManifest
  nodeDef?: NodeDefinition
  inputs: InputPort[]
  outputs: OutputPort[]
  defaultParams: Record<string, any>
  icon: React.ComponentType<{ className?: string }>
}

interface WorkflowNodePaletteProps {
  isOpen?: boolean
  onClose?: () => void
  onAddNode?: (template: NodePaletteItem) => void
}

export function WorkflowNodePalette({ isOpen = true, onClose: _onClose, onAddNode }: WorkflowNodePaletteProps) {
  const [searchQuery, setSearchQuery] = React.useState("")
  const [manifestItems, setManifestItems] = React.useState<NodePaletteItem[]>([])
  const [expandedCategories, setExpandedCategories] = React.useState<Set<string>>(
    new Set(["Data Ingestion", "AMR & Resistance", "Data Transformation", "Visualizations", "Sink & Storage", "Quality Control", "General"])
  )
  const asideRef = React.useRef<HTMLElement>(null)
  const [hoveredItem, setHoveredItem] = React.useState<{
    item: NodePaletteItem
    top?: number
    bottom?: number
  } | null>(null)
  const hoverTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)

  React.useEffect(() => {
    let isMounted = true
    async function loadManifests() {
      const extensions = await extensionService.getExtensions()
      if (!isMounted) return

      const items: NodePaletteItem[] = []

      extensions
        .filter((ext) => ext.isInstalled)
        .forEach(({ manifest }) => {
          if (manifest.nodes && manifest.nodes.length > 0) {
            manifest.nodes.forEach((node) => {
              const inputs: InputPort[] = node.inputs || []
              const outputs: OutputPort[] = node.outputs || []

              const defaultParams: Record<string, any> = {}
              node.params?.forEach((p) => {
                defaultParams[p.id] = p.default
              })

              let IconComponent = Dna
              if (node.node_type === "parser") IconComponent = FileSpreadsheet
              else if (node.node_type === "viewer") IconComponent = Eye
              else if (node.node_type === "transformer") IconComponent = Filter
              else if (node.id === "core.folder_input" || node.id.includes("folder_input")) IconComponent = FolderInput
              else if (node.id === "core.output_save" || node.id.includes("output_save")) IconComponent = FolderDown

              let nodeType = "dynamicTool"
              let kind = "tool"
              let category = manifest.category || "Bioinformatics Tool"

              if (node.id === "core.folder_input" || node.id === "folder_input" || node.id.endsWith(".folder_input")) {
                nodeType = "folderInput"
                kind = "folder_input"
                category = "Data Ingestion"
              } else if (node.id === "core.output_save" || node.id === "output_save" || node.id.endsWith(".output_save")) {
                nodeType = "outputSave"
                kind = "output_save"
                category = "Sink & Storage"
              }

              items.push({
                id: `${manifest.id}:${node.id}`,
                title: node.name,
                category,
                description: node.description || manifest.description,
                type: nodeType,
                kind: kind,
                tool_id: manifest.id,
                node_id: node.id,
                node_type: node.node_type,
                manifest,
                nodeDef: node,
                inputs,
                outputs,
                defaultParams,
                icon: IconComponent,
              })
            })
          }
        })

      setManifestItems(items)
    }

    loadManifests()
    return () => {
      isMounted = false
    }
  }, [])

  const allTemplates = React.useMemo(() => {
    return manifestItems
  }, [manifestItems])

  const filteredTemplates = React.useMemo(() => {
    if (!searchQuery.trim()) return allTemplates
    const q = searchQuery.toLowerCase()
    return allTemplates.filter(
      (t) =>
        t.title.toLowerCase().includes(q) ||
        t.description.toLowerCase().includes(q) ||
        t.category.toLowerCase().includes(q) ||
        t.inputs.some((i) => i.name.toLowerCase().includes(q)) ||
        t.outputs.some((o) => o.name.toLowerCase().includes(q))
    )
  }, [allTemplates, searchQuery])

  const categories = React.useMemo(() => {
    const cats: Record<string, NodePaletteItem[]> = {}
    filteredTemplates.forEach((t) => {
      if (!cats[t.category]) cats[t.category] = []
      cats[t.category].push(t)
    })
    return cats
  }, [filteredTemplates])

  const toggleCategory = (cat: string) => {
    setExpandedCategories((prev) => {
      const next = new Set(prev)
      if (next.has(cat)) next.delete(cat)
      else next.add(cat)
      return next
    })
  }

  const handleMouseEnterItem = (e: React.MouseEvent<HTMLDivElement>, item: NodePaletteItem) => {
    if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current)
    const targetRect = e.currentTarget.getBoundingClientRect()
    const asideRect = asideRef.current?.getBoundingClientRect()
    const offsetTop = asideRect ? targetRect.top - asideRect.top : targetRect.top
    const offsetBottom = asideRect ? asideRect.bottom - targetRect.bottom : window.innerHeight - targetRect.bottom
    const asideHeight = asideRect ? asideRect.height : window.innerHeight

    // When hovering on items in the lower portion of the palette, anchor the preview card's bottom
    // to the item's bottom so the card expands upwards directly next to the node item.
    const isLowerPortion = offsetTop > asideHeight * 0.45 || offsetBottom < 280

    if (isLowerPortion) {
      const clampedBottom = Math.max(12, Math.min(asideHeight - 120, offsetBottom - 4))
      hoverTimeoutRef.current = setTimeout(() => {
        setHoveredItem({
          item,
          bottom: clampedBottom,
        })
      }, 140)
    } else {
      const clampedTop = Math.max(12, Math.min(asideHeight - 120, offsetTop - 4))
      hoverTimeoutRef.current = setTimeout(() => {
        setHoveredItem({
          item,
          top: clampedTop,
        })
      }, 140)
    }
  }

  const handleMouseLeaveItem = () => {
    if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current)
    hoverTimeoutRef.current = setTimeout(() => {
      setHoveredItem(null)
    }, 120)
  }

  const onDragStart = (e: React.DragEvent, template: NodePaletteItem) => {
    setHoveredItem(null)
    registerDragTemplate(template)
    e.dataTransfer.setData("application/reactflow/node", template.id)
    e.dataTransfer.effectAllowed = "move"
  }

  if (!isOpen) return null

  return (
    <aside
      ref={asideRef}
      className="relative w-64 md:w-72 bg-card/95 backdrop-blur-md border-r border-border/80 flex flex-col shrink-0 select-none shadow-sm z-20 h-full min-h-0"
    >
      {/* Header */}
      <div className="p-3 border-b border-border/60 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="size-7 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
            <Layers className="size-4" />
          </div>
          <div>
            <h2 className="text-xs font-semibold text-foreground tracking-tight leading-none">Node Palette</h2>
            <p className="text-[10px] text-muted-foreground mt-0.5">Drag onto canvas to compose</p>
          </div>
        </div>
      </div>

      {/* Search Input */}
      <div className="p-2.5 border-b border-border/60 bg-muted/20">
        <div className="relative flex items-center">
          <Search className="absolute left-2.5 size-3.5 text-muted-foreground pointer-events-none" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search nodes, ports, tools..."
            className="pl-8 h-8 rounded-lg bg-background border-border/70 text-xs placeholder:text-xs placeholder:text-muted-foreground shadow-xs"
          />
        </div>
      </div>

      {/* Category Tree / Node Items */}
      <ScrollArea className="flex-1 h-full min-h-0 px-2 py-2">
        <div className="flex flex-col gap-3">
          {Object.entries(categories).map(([category, items]) => {
            const isExpanded = expandedCategories.has(category)
            return (
              <div key={category} className="flex flex-col gap-1">
                <button
                  type="button"
                  onClick={() => toggleCategory(category)}
                  className="flex items-center justify-between px-2 py-1.5 rounded-md hover:bg-muted/50 text-[11px] font-semibold text-foreground/80 tracking-wide transition-colors cursor-pointer"
                >
                  <div className="flex items-center gap-1.5">
                    <ChevronRight
                      className={cn(
                        "size-3 text-muted-foreground transition-transform duration-200",
                        isExpanded && "rotate-90"
                      )}
                    />
                    <span>{category}</span>
                  </div>
                  <Badge variant="secondary" className="text-[9px] px-1.5 py-0 h-4 font-mono font-normal">
                    {items.length}
                  </Badge>
                </button>

                {isExpanded && (
                  <div className="flex flex-col gap-1 pl-2">
                    {items.map((item) => {
                      const Icon = item.icon
                      return (
                        <div
                          key={item.id}
                          draggable
                          onDragStart={(e) => onDragStart(e, item)}
                          onMouseEnter={(e) => handleMouseEnterItem(e, item)}
                          onMouseLeave={handleMouseLeaveItem}
                          onDoubleClick={() => onAddNode?.(item)}
                          className="group relative flex items-center gap-2.5 p-2 rounded-xl border border-border/60 bg-card hover:bg-accent/40 hover:border-primary/40 hover:shadow-xs transition-all duration-150 cursor-grab active:cursor-grabbing text-left"
                        >
                          <div className="size-7 rounded-lg bg-muted/60 group-hover:bg-primary/10 flex items-center justify-center text-muted-foreground group-hover:text-primary transition-colors shrink-0">
                            <Icon className="size-3.5" />
                          </div>

                          <div className="flex flex-col min-w-0 flex-1">
                            <div className="flex items-center justify-between gap-1">
                              <span className="text-xs font-semibold text-foreground tracking-tight truncate group-hover:text-primary transition-colors">
                                {item.title}
                              </span>
                            </div>
                            <span className="text-[10px] text-muted-foreground line-clamp-1 leading-tight mt-0.5">
                              {item.description}
                            </span>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}

          {filteredTemplates.length === 0 && (
            <div className="p-6 flex flex-col items-center justify-center text-center gap-2 text-muted-foreground">
              <Sparkles className="size-5 opacity-40" />
              <p className="text-xs font-medium">No workflow nodes found</p>
              <p className="text-[10px] max-w-[180px]">Try searching for different keywords or clear query.</p>
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Hover Floating Card */}
      {hoveredItem && (
        <div
          style={
            hoveredItem.bottom !== undefined
              ? { bottom: `${hoveredItem.bottom}px` }
              : { top: `${hoveredItem.top}px` }
          }
          onMouseEnter={() => {
            if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current)
          }}
          onMouseLeave={() => setHoveredItem(null)}
          className="absolute left-[calc(100%+8px)] w-[340px] max-h-[calc(100vh-80px)] rounded-xl border border-border/80 bg-popover/95 backdrop-blur-xl shadow-2xl z-50 animate-in fade-in zoom-in-95 duration-150 pointer-events-auto flex flex-col overflow-hidden text-popover-foreground"
        >
          {/* Card Header */}
          <div className="p-3.5 border-b border-border/60 bg-muted/20 flex flex-col gap-1.5 shrink-0">
            <div className="flex items-center gap-2 min-w-0">
              <div className="size-6 rounded-md bg-primary/10 flex items-center justify-center text-primary shrink-0">
                <hoveredItem.item.icon className="size-3.5" />
              </div>
              <h3 className="text-xs font-bold text-foreground truncate" title={hoveredItem.item.title}>
                {hoveredItem.item.title}
              </h3>
            </div>
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              {hoveredItem.item.description}
            </p>
          </div>

          {/* Sockets Section (Inputs & Outputs strictly single line) */}
          {(hoveredItem.item.inputs.length > 0 || hoveredItem.item.outputs.length > 0) && (
            <div className="flex flex-col p-3 gap-2.5 flex-1 min-h-0 overflow-y-auto">
              {/* Inputs */}
              {hoveredItem.item.inputs.length > 0 && (
                <div className="flex flex-col gap-1">
                  <div className="flex items-center justify-between text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/80 px-1">
                    <span>Inputs</span>
                    <span className="font-mono">{hoveredItem.item.inputs.length}</span>
                  </div>
                  <div className="flex flex-col gap-0.5 rounded-lg bg-muted/30 border border-border/40 p-1">
                    {hoveredItem.item.inputs.map((inp, idx) => {
                      const firstMatcher = inp.accepted_types?.[0]
                      const color = getSocketColor(firstMatcher, idx)
                      const typeLabel = formatPortType(inp)
                      return (
                        <div
                          key={`in_${inp.id}`}
                          className="flex items-center justify-between gap-2 px-1.5 py-1 rounded hover:bg-muted/50 transition-colors"
                        >
                          <div className="flex items-center gap-1.5 min-w-0 flex-1">
                            <span className="size-2 rounded-full shrink-0 shadow-xs" style={{ backgroundColor: color }} />
                            <span className="text-xs font-medium text-foreground/90 truncate" title={inp.name}>
                              {inp.name}
                            </span>
                          </div>
                          <span className="shrink-0 font-mono text-[9px] text-muted-foreground bg-background/80 border border-border/50 px-1.5 py-0.5 rounded leading-none">
                            {typeLabel}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Outputs */}
              {hoveredItem.item.outputs.length > 0 && (
                <div className="flex flex-col gap-1">
                  {hoveredItem.item.inputs.length > 0 && <Separator className="my-0.5 opacity-60" />}
                  <div className="flex items-center justify-between text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/80 px-1">
                    <span>Outputs</span>
                    <span className="font-mono">{hoveredItem.item.outputs.length}</span>
                  </div>
                  <div className="flex flex-col gap-0.5 rounded-lg bg-muted/30 border border-border/40 p-1">
                    {hoveredItem.item.outputs.map((out, idx) => {
                      const color = getSocketColor(out.socket_type, idx + 2)
                      const typeLabel = formatPortType(out)
                      return (
                        <div
                          key={`out_${out.id}`}
                          className="flex items-center justify-between gap-2 px-1.5 py-1 rounded hover:bg-muted/50 transition-colors"
                        >
                          <div className="flex items-center gap-1.5 min-w-0 flex-1">
                            <span className="size-2 rounded-full shrink-0 shadow-xs" style={{ backgroundColor: color }} />
                            <span className="text-xs font-medium text-foreground/90 truncate" title={out.name}>
                              {out.name}
                            </span>
                          </div>
                          <span className="shrink-0 font-mono text-[9px] text-muted-foreground bg-background/80 border border-border/50 px-1.5 py-0.5 rounded leading-none">
                            {typeLabel}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </aside>
  )
}
