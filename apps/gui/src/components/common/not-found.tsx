import { Link } from "@tanstack/react-router"
import { Button } from "@/components/ui/button"
import { FileQuestion, ArrowLeft } from "lucide-react"

export function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[70vh] text-center p-8 space-y-5 animate-in fade-in duration-300">
      <div className="relative flex items-center justify-center">
        <div className="size-20 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center shadow-inner">
          <FileQuestion className="size-9 text-primary" />
        </div>
        <span className="absolute -top-1 -right-1 flex size-3">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary/40 opacity-75" />
          <span className="relative inline-flex rounded-full size-3 bg-primary" />
        </span>
      </div>

      <div className="space-y-1.5 max-w-sm">
        <h3 className="text-xl font-bold tracking-tight">404 - Page Not Found</h3>
        <p className="text-sm text-muted-foreground leading-relaxed">
          The requested route does not exist or has been moved within VortexFlow.
        </p>
      </div>

      <div className="pt-2">
        <Button
          variant="default"
          size="sm"
          className="gap-2 font-semibold px-4 h-9 cursor-pointer shadow-md transition-all hover:shadow-lg"
          render={<Link to="/explore/search" />}
        >
          <ArrowLeft className="size-3.5" />
          <span>Return to Explorer</span>
        </Button>
      </div>
    </div>
  )
}
