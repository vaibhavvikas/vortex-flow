import * as React from "react"
import { FolderDown } from "lucide-react"
import { GenericNodeCard } from "./base-node-card"
import { NodeInputField } from "./node-form-fields"
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
      <NodeInputField
        label="Export Path"
        description="Local destination directory for saved pipeline outputs"
        value={destDir}
        onChange={(val) => data.onParamChange?.("destination_dir", val)}
        onBrowse={handlePickDirectory}
        placeholder="/path/to/results"
      />
    </GenericNodeCard>
  )
})
