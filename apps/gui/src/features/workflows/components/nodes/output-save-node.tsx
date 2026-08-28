import * as React from "react"
import { FolderDown, FolderOpen } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { GenericNodeCard, GenericInputField } from "./base-node-card"
import { workflowService } from "../../services/workflow-service"
import type { WorkflowNodeData } from "../../types"

interface OutputSaveNodeProps {
  data: WorkflowNodeData
  selected?: boolean
}

export const OutputSaveNode = React.memo(function OutputSaveNode({ data, selected }: OutputSaveNodeProps) {
  const destDir = (data.params?.destination_dir as string) || ""
  const inputs = data.inputs || [
    {
      id: "results",
      name: "Input Data / Report",
      socket_type: "any",
      direction: "input",
    },
  ]

  const handlePickDirectory = async () => {
    const selectedPath = await workflowService.pickFolder()
    if (selectedPath) {
      data.onParamChange?.("destination_dir", selectedPath)
    }
  }

  return (
    <GenericNodeCard
      data={data}
      icon={FolderDown}
      title={data.title || "Output Directory Save"}
      description="Exports analytical results, summaries, and TSV tables to disk."
      selected={selected}
      inputs={inputs}
      outputs={[]}
    >
      {/* Destination Directory Field */}
      <GenericInputField
        label="Export Path"
        description="Local destination directory for saved pipeline outputs"
      >
        <div className="flex items-center gap-1.5 w-full">
          <Input
            value={destDir}
            onChange={(e) => data.onParamChange?.("destination_dir", e.target.value)}
            placeholder="/path/to/results"
            className="nodrag h-8 rounded-lg bg-background border border-border/80 text-xs px-3 shadow-xs font-mono"
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handlePickDirectory}
            className="nodrag h-8 px-2.5 rounded-lg shrink-0 cursor-pointer shadow-xs"
            title="Browse Destination"
          >
            <FolderOpen className="size-3.5" />
          </Button>
        </div>
      </GenericInputField>
    </GenericNodeCard>
  )
})
