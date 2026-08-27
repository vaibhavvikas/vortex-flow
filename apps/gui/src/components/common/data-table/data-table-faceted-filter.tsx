"use client"

import type { Column } from "@tanstack/react-table"
import { Check, PlusCircle } from "lucide-react"
import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Separator } from "@/components/ui/separator"
import type { Option } from "./types"

interface DataTableFacetedFilterProps<TData, TValue> {
  column?: Column<TData, TValue>
  title?: string
  options: Option[]
  multiple?: boolean
}

export function DataTableFacetedFilter<TData, TValue>({
  column,
  title,
  options,
  multiple = true,
}: DataTableFacetedFilterProps<TData, TValue>) {
  const selectedValues = new Set(column?.getFilterValue() as string[])

  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button variant="outline" size="sm" className="h-8 border-dashed gap-1.5 cursor-pointer">
            <PlusCircle className="size-3.5" />
            {title}
            {selectedValues?.size > 0 && (
              <>
                <Separator orientation="vertical" className="mx-1 h-4" />
                <Badge
                  variant="secondary"
                  className="rounded-sm px-1 font-normal lg:hidden text-xs"
                >
                  {selectedValues.size}
                </Badge>
                <div className="hidden space-x-1 lg:flex">
                  {selectedValues.size > 2 ? (
                    <Badge
                      variant="secondary"
                      className="rounded-sm px-1 font-normal text-xs"
                    >
                      {selectedValues.size} selected
                    </Badge>
                  ) : (
                    options
                      .filter((option) => selectedValues.has(option.value))
                      .map((option) => (
                        <Badge
                          variant="secondary"
                          key={option.value}
                          className="rounded-sm px-1 font-normal text-xs"
                        >
                          {option.label}
                        </Badge>
                      ))
                  )}
                </div>
              </>
            )}
          </Button>
        }
      />
      <PopoverContent className="w-[200px] p-1" align="start">
        <div className="p-1 space-y-1">
          {options.map((option) => {
            const isSelected = selectedValues.has(option.value)
            return (
              <div
                key={option.value}
                onClick={() => {
                  if (!column) return
                  if (multiple) {
                    if (isSelected) {
                      selectedValues.delete(option.value)
                    } else {
                      selectedValues.add(option.value)
                    }
                    const filterValues = Array.from(selectedValues)
                    column.setFilterValue(
                      filterValues.length ? filterValues : undefined
                    )
                  } else {
                    column.setFilterValue(isSelected ? undefined : [option.value])
                  }
                }}
                className={cn(
                  "relative flex cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-accent hover:text-accent-foreground",
                  isSelected && "bg-accent text-accent-foreground font-medium"
                )}
              >
                <div
                  className={cn(
                    "mr-2 flex size-4 items-center justify-center rounded-sm border border-primary",
                    isSelected
                      ? "bg-primary text-primary-foreground"
                      : "opacity-50 [&_svg]:invisible"
                  )}
                >
                  <Check className="size-3.5" />
                </div>
                {option.icon && (
                  <option.icon className="mr-2 size-4 text-muted-foreground" />
                )}
                <span>{option.label}</span>
              </div>
            )
          })}

          {selectedValues.size > 0 && (
            <>
              <Separator className="my-1" />
              <div
                onClick={() => column?.setFilterValue(undefined)}
                className="flex cursor-pointer select-none items-center justify-center rounded-sm py-1.5 text-sm font-medium hover:bg-accent hover:text-accent-foreground"
              >
                Clear filters
              </div>
            </>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}
