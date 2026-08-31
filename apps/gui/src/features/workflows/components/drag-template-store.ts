import type { NodePaletteItem } from "./workflow-node-palette"

const templates = new Map<string, NodePaletteItem>()

export function registerDragTemplate(template: NodePaletteItem): void {
  templates.set(template.id, template)
}

export function getDragTemplate(id: string): NodePaletteItem | undefined {
  return templates.get(id)
}
