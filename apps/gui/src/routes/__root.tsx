import { createRootRoute } from "@tanstack/react-router"
import { AppLayout } from "@/components/layout/app-layout"
import { NotFound } from "@/components/common/not-found"

export const Route = createRootRoute({
  component: AppLayout,
  notFoundComponent: NotFound,
})
