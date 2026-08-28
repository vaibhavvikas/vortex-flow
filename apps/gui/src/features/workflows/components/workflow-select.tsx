import * as React from "react"
import { ChevronDown, Check } from "lucide-react"
import { cn } from "@/lib/utils"

interface WorkflowSelectProps {
  value: string
  options: string[] | { value: string; label: string }[]
  onChange: (value: string) => void
  placeholder?: string
  disabled?: boolean
  className?: string
}

export function WorkflowSelect({
  value,
  options,
  onChange,
  placeholder = "Select...",
  disabled = false,
  className,
}: WorkflowSelectProps) {
  const [isOpen, setIsOpen] = React.useState(false)
  const containerRef = React.useRef<HTMLDivElement>(null)

  // Normalize options to { value, label }
  const normalizedOptions = React.useMemo(() => {
    return options.map((opt) => {
      if (typeof opt === "string") {
        const label =
          opt === "other"
            ? "Other / General"
            : opt
                .split("_")
                .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
                .join(" ")
        return { value: opt, label }
      }
      return opt
    })
  }, [options])

  const selectedItem = normalizedOptions.find((o) => o.value === value)

  // Close on outside click
  React.useEffect(() => {
    if (!isOpen) return
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [isOpen])

  return (
    <div ref={containerRef} className={cn("relative w-full nodrag nopan", className)}>
      {/* Compact Trigger Button */}
      <button
        type="button"
        disabled={disabled}
        onClick={(e) => {
          e.stopPropagation()
          setIsOpen(!isOpen)
        }}
        className={cn(
          "nodrag nopan flex h-8 w-full items-center justify-between gap-2 rounded-lg border border-border/80 bg-background px-2.5 text-xs text-foreground shadow-xs transition-colors cursor-pointer outline-none select-none",
          "hover:bg-muted/40 hover:border-border",
          "focus:border-ring focus:ring-2 focus:ring-ring/20",
          disabled && "opacity-50 cursor-not-allowed",
          isOpen && "border-ring ring-2 ring-ring/20"
        )}
      >
        <span className="truncate font-normal text-foreground/90">
          {selectedItem ? selectedItem.label : placeholder}
        </span>
        <ChevronDown
          className={cn(
            "size-3.5 text-muted-foreground transition-transform duration-150 shrink-0",
            isOpen && "rotate-180 text-foreground"
          )}
        />
      </button>

      {/* Local Tree Dropdown Menu (Moves & Scales with Node Card) */}
      {isOpen && (
        <div
          className="nodrag nopan nowheel absolute left-0 right-0 top-full mt-1 z-50 max-h-52 overflow-y-auto rounded-lg border border-border bg-popover/95 p-1 text-popover-foreground shadow-lg backdrop-blur-md animate-in fade-in-0 zoom-in-95 duration-100"
          onClick={(e) => e.stopPropagation()}
        >
          {normalizedOptions.map((opt) => {
            const isSelected = opt.value === value

            return (
              <button
                key={opt.value}
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  onChange(opt.value)
                  setIsOpen(false)
                }}
                className={cn(
                  "nodrag flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-xs transition-colors cursor-pointer text-left select-none",
                  isSelected
                    ? "bg-accent text-accent-foreground font-medium"
                    : "text-popover-foreground hover:bg-accent/80 hover:text-accent-foreground"
                )}
              >
                <span className="truncate">{opt.label}</span>
                {isSelected && <Check className="size-3 text-primary shrink-0" />}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
