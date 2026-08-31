import * as React from "react"
import { FolderDown } from "lucide-react"
import { GenericNodeCard } from "./base-node-card"
import { NodeInputField, NodeCheckboxField } from "./node-form-fields"
import { workflowService } from "../../services/workflow-service"
import type { InputPort, WorkflowNodeData } from "../../types"

interface OutputSaveNodeProps {
  id: string
  data: WorkflowNodeData
  selected?: boolean
}

export const OutputSaveNode = React.memo(function OutputSaveNode({ id, data, selected }: OutputSaveNodeProps) {
  const destDir = (data.params?.destination_dir as string) || ""
  const openFolder = Boolean(data.params?.open_folder ?? true)

  const inputs: InputPort[] = data.inputs || [
    {
      id: "results",
      name: "Input Data / Report",
      accepted_types: [{}], // Wildcard match
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
      id={id}
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
        required
        description="Local destination directory for saved pipeline outputs"
        value={destDir}
        onChange={(val) => data.onParamChange?.("destination_dir", val)}
        onBrowse={handlePickDirectory}
        placeholder="/path/to/results"
      />

      <NodeCheckboxField
        id={`${id}_open_folder`}
        label="Open On Complete"
        description="Automatically open output folder after run completes"
        checked={openFolder}
        onChange={(val) => data.onParamChange?.("open_folder", val)}
      />
    </GenericNodeCard>
  )
})
