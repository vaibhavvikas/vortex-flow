import * as React from "react"
import { Dna } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
import { WorkflowSelect } from "../workflow-select"
import { WorkflowNumberInput } from "../workflow-number-input"
import { GenericNodeCard, GenericInputField } from "./base-node-card"
import type { WorkflowNodeData } from "../../types"
import type { ToolManifest, ParameterDef } from "@/features/extensions/types"

interface DynamicToolNodeProps {
  data: WorkflowNodeData & {
    manifest?: ToolManifest
    nodeIndex?: number
  }
  selected?: boolean
}

export const DynamicToolNode = React.memo(function DynamicToolNode({ data, selected }: DynamicToolNodeProps) {
  const manifest = data.manifest
  const inputs = data.inputs || []
  const outputs = data.outputs || []
  const params: ParameterDef[] = manifest?.params || []

  return (
    <GenericNodeCard
      data={data}
      icon={Dna}
      title={data.title || manifest?.name || "Bioinformatics Tool"}
      description={manifest?.description || "Executes analysis algorithm on input sequencing reads."}
      selected={selected}
      inputs={inputs}
      outputs={outputs}
    >
      {/* Dynamically Rendered Parameter Controls from Manifest */}
      {params.map((param) => {
        const val = data.params?.[param.id] ?? param.default

        if (param.type === "select") {
          const currentVal = String(val ?? param.options?.[0] ?? "other")

          return (
            <GenericInputField
              key={param.id}
              label={param.name}
              description={param.description}
            >
              <WorkflowSelect
                value={currentVal}
                options={param.options || []}
                onChange={(newVal) => data.onParamChange?.(param.id, newVal)}
                placeholder={`Select ${param.name}`}
              />
            </GenericInputField>
          )
        }

        if (param.type === "boolean" || typeof param.default === "boolean") {
          return (
            <div
              key={param.id}
              className="nodrag flex items-center justify-between h-7 px-4 py-0.5"
            >
              <label
                htmlFor={`p_${data.id}_${param.id}`}
                className="text-xs font-medium text-foreground/90 cursor-pointer"
              >
                {param.name}
              </label>
              <Checkbox
                id={`p_${data.id}_${param.id}`}
                checked={Boolean(val)}
                onCheckedChange={(checked) => data.onParamChange?.(param.id, Boolean(checked))}
                className="nodrag cursor-pointer"
              />
            </div>
          )
        }

        if (param.type === "number") {
          return (
            <GenericInputField
              key={param.id}
              label={param.name}
              description={param.description}
            >
              <WorkflowNumberInput
                min={param.min ?? 0}
                max={param.max ?? 100}
                step={param.step ?? 1}
                value={typeof val === "number" ? val : parseFloat(val) || 0}
                onChange={(newNum) => data.onParamChange?.(param.id, newNum)}
                placeholder={String(param.default ?? 0)}
              />
            </GenericInputField>
          )
        }

        return (
          <GenericInputField
            key={param.id}
            label={param.name}
            description={param.description}
          >
            <Input
              value={String(val || "")}
              onChange={(e) => data.onParamChange?.(param.id, e.target.value)}
              placeholder={param.description || param.name}
              className="nodrag h-8 rounded-lg bg-background border border-border/80 text-xs px-3 shadow-xs font-mono"
            />
          </GenericInputField>
        )
      })}
    </GenericNodeCard>
  )
})
