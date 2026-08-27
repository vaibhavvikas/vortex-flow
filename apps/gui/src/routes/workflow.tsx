import { createFileRoute } from "@tanstack/react-router"
import { WorkflowCanvas } from "@/features/workflows"

export const Route = createFileRoute("/workflow")({
  component: WorkflowRouteComponent,
})

function WorkflowRouteComponent() {
  return <WorkflowCanvas />
}
