import { Tabs as TabsPrimitive } from "@base-ui/react/tabs"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

function Tabs({
  className,
  orientation = "horizontal",
  ...props
}: TabsPrimitive.Root.Props) {
  return (
    <TabsPrimitive.Root
      data-slot="tabs"
      data-orientation={orientation}
      className={cn(
        "group/tabs flex gap-6 data-horizontal:flex-col data-vertical:flex-row",
        className
      )}
      {...props}
    />
  )
}

const tabsListVariants = cva(
  "group/tabs-list inline-flex w-fit items-center justify-center rounded-lg p-[3px] text-muted-foreground group-data-horizontal/tabs:h-8 group-data-vertical/tabs:h-fit group-data-vertical/tabs:flex-col group-data-vertical/tabs:items-stretch data-[variant=line]:rounded-none",
  {
    variants: {
      variant: {
        default: "bg-muted",
        line: "gap-1 bg-transparent group-data-horizontal/tabs:border-b group-data-horizontal/tabs:border-border/60",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function TabsList({
  className,
  variant = "default",
  ...props
}: TabsPrimitive.List.Props & VariantProps<typeof tabsListVariants>) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      data-variant={variant}
      className={cn(tabsListVariants({ variant }), className)}
      {...props}
    />
  )
}

function TabsTrigger({ className, ...props }: TabsPrimitive.Tab.Props) {
  return (
    <TabsPrimitive.Tab
      data-slot="tabs-trigger"
      className={cn(
        "relative inline-flex h-[calc(100%-1px)] flex-1 items-center justify-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium whitespace-nowrap text-muted-foreground transition-all hover:text-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50 select-none cursor-pointer",
        "group-data-[variant=default]/tabs-list:data-active:bg-background group-data-[variant=default]/tabs-list:data-active:text-foreground group-data-[variant=default]/tabs-list:data-active:shadow-xs dark:group-data-[variant=default]/tabs-list:data-active:bg-input/30",
        "group-data-horizontal/tabs:group-data-[variant=line]/tabs-list:bg-transparent group-data-horizontal/tabs:group-data-[variant=line]/tabs-list:rounded-none group-data-horizontal/tabs:group-data-[variant=line]/tabs-list:-mb-px group-data-horizontal/tabs:group-data-[variant=line]/tabs-list:data-active:bg-transparent group-data-horizontal/tabs:group-data-[variant=line]/tabs-list:data-active:text-foreground group-data-horizontal/tabs:group-data-[variant=line]/tabs-list:data-active:border-b-2 group-data-horizontal/tabs:group-data-[variant=line]/tabs-list:data-active:border-primary group-data-horizontal/tabs:group-data-[variant=line]/tabs-list:pb-2",
        "group-data-vertical/tabs:justify-start group-data-vertical/tabs:h-9 group-data-vertical/tabs:w-full group-data-vertical/tabs:group-data-[variant=line]/tabs-list:-mr-px group-data-vertical/tabs:group-data-[variant=line]/tabs-list:rounded-none group-data-vertical/tabs:group-data-[variant=line]/tabs-list:data-active:bg-transparent group-data-vertical/tabs:group-data-[variant=line]/tabs-list:data-active:text-foreground group-data-vertical/tabs:group-data-[variant=line]/tabs-list:data-active:border-r-2 group-data-vertical/tabs:group-data-[variant=line]/tabs-list:data-active:border-primary group-data-vertical/tabs:group-data-[variant=line]/tabs-list:pr-3.5",
        className
      )}
      {...props}
    />
  )
}

function TabsContent({ className, ...props }: TabsPrimitive.Panel.Props) {
  return (
    <TabsPrimitive.Panel
      data-slot="tabs-content"
      className={cn("flex-1 text-sm outline-none", className)}
      {...props}
    />
  )
}

export { Tabs, TabsList, TabsTrigger, TabsContent, tabsListVariants }
