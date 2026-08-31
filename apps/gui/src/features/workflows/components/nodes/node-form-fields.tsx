import * as React from "react"
import { FolderOpen, Info } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip"
import { WorkflowSelect } from "../workflow-select"
import { WorkflowNumberInput } from "../workflow-number-input"
import { cn } from "@/lib/utils"

/**
 * Base field container with uniform horizontal/vertical rhythm and contextual Info tooltip
 */
export function NodeField({
  label,
  description,
  cliFlag,
  required,
  children,
  className,
}: {
  label?: string
  description?: string
  cliFlag?: string
  required?: boolean
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn("px-4 py-1.5 flex flex-col gap-1.5", className)}>
      {label && (
        <div className="flex items-center justify-between gap-1.5">
          <div className="flex items-center gap-1 min-w-0">
            <Label className="text-xs font-semibold text-foreground tracking-tight select-none truncate">
              {label}
              {required && <span className="text-rose-500 font-bold ml-0.5">*</span>}
            </Label>
            {description && (
              <Tooltip>
                <TooltipTrigger
                  render={
                    <button
                      type="button"
                      className="inline-flex size-3.5 items-center justify-center text-muted-foreground/60 hover:text-foreground transition-colors cursor-help shrink-0 nodrag"
                    >
                      <Info className="size-3" />
                    </button>
                  }
                />
                <TooltipContent side="right" className="flex flex-col items-start gap-1 text-xs">
                  <p>{description}</p>
                  {cliFlag && (
                    <span className="font-mono text-[10px] text-background bg-background/20 font-semibold px-1.5 py-0.5 rounded w-fit leading-none">
                      CLI: {cliFlag}
                    </span>
                  )}
                </TooltipContent>
              </Tooltip>
            )}
          </div>
        </div>
      )}
      {children}
    </div>
  )
}

/**
 * Standard Shadcn Checkbox + Label horizontal control with CircleHelp tooltip
 */
export function NodeCheckboxField({
  id,
  label,
  description,
  cliFlag,
  checked,
  onChange,
  disabled,
  className,
}: {
  id: string
  label: string
  description?: string
  cliFlag?: string
  checked: boolean
  onChange: (checked: boolean) => void
  disabled?: boolean
  className?: string
}) {
  return (
    <div className={cn("px-4 py-1.5 flex items-center justify-between gap-2.5 nodrag", className)}>
      <div className="flex items-center gap-2 min-w-0">
        <Checkbox
          id={id}
          name={id}
          checked={checked}
          onCheckedChange={(c) => onChange(Boolean(c))}
          disabled={disabled}
          className="cursor-pointer shrink-0"
        />
        <Label
          htmlFor={id}
          className="text-xs font-semibold text-foreground cursor-pointer select-none leading-none truncate"
        >
          {label}
        </Label>
        {description && (
          <Tooltip>
            <TooltipTrigger
              render={
                <button
                  type="button"
                  className="inline-flex size-3.5 items-center justify-center text-muted-foreground/60 hover:text-foreground transition-colors cursor-help shrink-0 nodrag"
                >
                  <Info className="size-3" />
                </button>
              }
            />
            <TooltipContent side="right" className="flex flex-col items-start gap-1 text-xs">
              <p>{description}</p>
              {cliFlag && (
                <span className="font-mono text-[10px] text-background bg-background/20 font-semibold px-1.5 py-0.5 rounded w-fit leading-none">
                  CLI: {cliFlag}
                </span>
              )}
            </TooltipContent>
          </Tooltip>
        )}
      </div>
    </div>
  )
}

/**
 * Standard Text / Path Input with optional Browse Button
 */
export function NodeInputField({
  id,
  label,
  description,
  cliFlag,
  required,
  value,
  placeholder,
  onChange,
  onBrowse,
  browseTitle = "Browse",
  disabled,
  className,
}: {
  id?: string
  label?: string
  description?: string
  cliFlag?: string
  required?: boolean
  value: string
  placeholder?: string
  onChange: (val: string) => void
  onBrowse?: () => void
  browseTitle?: string
  disabled?: boolean
  className?: string
}) {
  return (
    <NodeField label={label} description={description} cliFlag={cliFlag} required={required} className={className}>
      <div className="flex items-center gap-1.5 w-full nodrag">
        <Input
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          disabled={disabled}
          className="h-8 rounded-lg bg-background border border-border/80 text-xs md:text-xs placeholder:text-xs px-3 shadow-xs font-mono flex-1 min-w-0"
        />
        {onBrowse && (
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={onBrowse}
            disabled={disabled}
            className="h-8 w-8 shrink-0 cursor-pointer shadow-xs rounded-lg"
            title={browseTitle}
          >
            <FolderOpen data-icon="inline-start" className="size-3.5" />
          </Button>
        )}
      </div>
    </NodeField>
  )
}

/**
 * Standard Select Dropdown control
 */
export function NodeSelectField({
  label,
  description,
  cliFlag,
  required,
  value,
  options,
  placeholder,
  onChange,
  disabled,
  className,
}: {
  label?: string
  description?: string
  cliFlag?: string
  required?: boolean
  value: string
  options: string[]
  placeholder?: string
  onChange: (val: string) => void
  disabled?: boolean
  className?: string
}) {
  return (
    <NodeField label={label} description={description} cliFlag={cliFlag} required={required} className={className}>
      <div className="nodrag">
        <WorkflowSelect
          value={value}
          options={options}
          placeholder={placeholder}
          onChange={onChange}
          disabled={disabled}
        />
      </div>
    </NodeField>
  )
}

/**
 * Standard Number Input control
 */
export function NodeNumberField({
  label,
  description,
  cliFlag,
  required,
  value,
  min = 0,
  max = 1000,
  step = 1,
  placeholder,
  onChange,
  className,
}: {
  label?: string
  description?: string
  cliFlag?: string
  required?: boolean
  value: number
  min?: number
  max?: number
  step?: number
  placeholder?: string
  onChange: (val: number) => void
  disabled?: boolean
  className?: string
}) {
  return (
    <NodeField label={label} description={description} cliFlag={cliFlag} required={required} className={className}>
      <div className="nodrag">
        <WorkflowNumberInput
          value={value}
          min={min}
          max={max}
          step={step}
          placeholder={placeholder}
          onChange={onChange}
        />
      </div>
    </NodeField>
  )
}

/**
 * Standard Section Divider for visualizer / results areas
 */
export function NodeSection({
  title,
  badge,
  icon: Icon,
  children,
  className,
}: {
  title: string
  badge?: React.ReactNode
  icon?: React.ComponentType<{ className?: string }>
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn("mt-2.5 pt-3 px-4 pb-1 border-t border-border/60 flex flex-col gap-2.5", className)}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-[11px] font-semibold text-foreground select-none">
          {Icon && <Icon className="size-3.5 text-primary" />}
          <span>{title}</span>
        </div>
        {badge}
      </div>
      {children}
    </div>
  )
}

/**
 * Dynamic Column Select field for picking columns from an input tabular file
 */
export function NodeColumnSelectField({
  label,
  description,
  cliFlag,
  required,
  value,
  multiple = false,
  availableColumns = [],
  onChange,
  className,
}: {
  label?: string
  description?: string
  cliFlag?: string
  required?: boolean
  value: string | string[]
  multiple?: boolean
  availableColumns?: string[]
  onChange: (val: any) => void
  disabled?: boolean
  className?: string
}) {
  const selectedValues = Array.isArray(value) ? value : value ? [String(value)] : []

  const toggleColumn = (col: string) => {
    if (multiple) {
      if (selectedValues.includes(col)) {
        onChange(selectedValues.filter((c) => c !== col))
      } else {
        onChange([...selectedValues, col])
      }
    } else {
      onChange(col)
    }
  }

  return (
    <NodeField label={label} description={description} cliFlag={cliFlag} required={required} className={className}>
      <div className="flex flex-col gap-1.5 nodrag">
        {availableColumns.length > 0 ? (
          <div className="flex flex-wrap gap-1 max-h-32 overflow-y-auto p-1.5 rounded-lg border border-border/80 bg-background/50">
            {availableColumns.map((col) => {
              const isSelected = selectedValues.includes(col)
              return (
                <button
                  key={col}
                  type="button"
                  onClick={() => toggleColumn(col)}
                  className={cn(
                    "px-2 py-0.5 rounded text-[11px] font-mono transition-all cursor-pointer select-none",
                    isSelected
                      ? "bg-primary text-primary-foreground font-semibold shadow-xs"
                      : "bg-muted text-muted-foreground hover:text-foreground hover:bg-muted/80"
                  )}
                >
                  {col}
                </button>
              )
            })}
          </div>
        ) : (
          <div className="p-2 rounded-lg border border-dashed border-border text-center text-[10px] text-muted-foreground">
            Connect input file to populate columns
          </div>
        )}
      </div>
    </NodeField>
  )
}

