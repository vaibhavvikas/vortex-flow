import { QueryClientProvider } from "@tanstack/react-query"
import { queryClient } from "@/lib/query-client"
import { TooltipProvider } from "@/components/ui/tooltip"
import { TitleBar } from "@/components/title-bar"
import { AppLayout } from "@/components/layout/app-layout"

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <div className="flex flex-col h-screen w-screen overflow-hidden bg-background font-sans">
          <TitleBar />
          <AppLayout />
        </div>
      </TooltipProvider>
    </QueryClientProvider>
  )
}

export default App
