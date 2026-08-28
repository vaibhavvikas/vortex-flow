import { createFileRoute } from "@tanstack/react-router"
import { ExtensionsView } from "@/features/extensions/components/extensions-view"

export const Route = createFileRoute("/extensions")({
  component: ExtensionsRouteComponent,
})

function ExtensionsRouteComponent() {
  return <ExtensionsView />
}
