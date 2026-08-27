import { QueryClientProvider } from "@tanstack/react-query"
import { RouterProvider } from "@tanstack/react-router"
import { queryClient } from "@/lib/query-client"
import { TooltipProvider } from "@/components/ui/tooltip"
import { TitleBar } from "@/components/layout/title-bar"
import { Toaster } from "@/components/ui/sonner"
import { router } from "@/router"

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <div className="flex flex-col h-screen w-screen overflow-hidden bg-background font-sans">
          <TitleBar />
          <RouterProvider router={router} />
          <Toaster position="bottom-right" offset={48} />
        </div>
      </TooltipProvider>
    </QueryClientProvider>
  )
}

export default App
