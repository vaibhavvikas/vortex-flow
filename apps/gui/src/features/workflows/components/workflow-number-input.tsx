import {
  NumberField,
  NumberFieldDecrement,
  NumberFieldGroup,
  NumberFieldIncrement,
  NumberFieldInput,
} from "@/components/reui/number-field"
import { cn } from "@/lib/utils"

interface WorkflowNumberInputProps {
  value: number
  min?: number
  max?: number
  step?: number
  onChange: (value: number) => void
  className?: string
  placeholder?: string
}

/**
 * WorkflowNumberInput built using ReUI Shadcn NumberField component (@reui/c-number-field-2)
 */
export function WorkflowNumberInput({
  value,
  min = 0,
  max = 100,
  step = 1,
  onChange,
  className,
}: WorkflowNumberInputProps) {
  return (
    <div className={cn("nodrag w-full", className)}>
      <NumberField
        value={value}
        onValueChange={(val) => {
          if (typeof val === "number" && !isNaN(val)) {
            onChange(val)
          }
        }}
        min={min}
        max={max}
        step={step}
        size="default"
      >
        <NumberFieldGroup className="h-8 bg-background border-border/80 shadow-xs">
          <NumberFieldDecrement />
          <NumberFieldInput className="font-mono text-xs text-foreground" />
          <NumberFieldIncrement />
        </NumberFieldGroup>
      </NumberField>
    </div>
  )
}
