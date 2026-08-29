import * as React from "react"
import { FolderOpen, CircleHelp } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip"
import { WorkflowSelect } from "../workflow-select"
import { WorkflowNumberInput } from "../workflow-number-input"
import { cn } from "@/lib/utils"

/**
 * Base field container with uniform horizontal/vertical rhythm and contextual CircleHelp tooltip
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
          <div className="flex items-center gap-1.5 min-w-0">
            <Label className="text-xs font-medium text-foreground tracking-tight select-none truncate">
              {label}
              {required && <span className="text-destructive ml-0.5">*</span>}
            </Label>
            {description && (
              <Tooltip>
                <TooltipTrigger
                  render={
                    <button
                      type="button"
                      className="inline-flex size-3.5 items-center justify-center text-muted-foreground/60 hover:text-foreground transition-colors cursor-help shrink-0 nodrag"
                    >
                      <CircleHelp className="size-3" />
                    </button>
                  }
                />
                <TooltipContent side="right" className="max-w-xs text-xs font-normal leading-relaxed flex flex-col gap-1">
                  <p>{description}</p>
                  {cliFlag && (
                    <span className="font-mono text-[10px] text-primary bg-primary/10 px-1 py-0.5 rounded w-fit">
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
          className="text-xs font-medium text-foreground cursor-pointer select-none leading-none truncate"
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
                  <CircleHelp className="size-3" />
                </button>
              }
            />
            <TooltipContent side="right" className="max-w-xs text-xs font-normal leading-relaxed flex flex-col gap-1">
              <p>{description}</p>
              {cliFlag && (
                <span className="font-mono text-[10px] text-primary bg-primary/10 px-1 py-0.5 rounded w-fit">
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
          className="h-8 rounded-lg bg-background border border-border/80 text-xs md:text-xs placeholder:text-xs px-3 shadow-xs font-mono"
        />
        {onBrowse && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onBrowse}
            disabled={disabled}
            className="h-8 px-2.5 rounded-lg shrink-0 cursor-pointer shadow-xs"
            title={browseTitle}
          >
            <FolderOpen className="size-3.5" />
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
