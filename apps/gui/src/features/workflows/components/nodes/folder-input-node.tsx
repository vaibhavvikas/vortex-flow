import * as React from "react"
import { FolderInput } from "lucide-react"
import { GenericNodeCard } from "./base-node-card"
import { NodeInputField } from "./node-form-fields"
import { workflowService } from "../../services/workflow-service"
import type { WorkflowNodeData } from "../../types"

interface FolderInputNodeProps {
  data: WorkflowNodeData
  selected?: boolean
}

export const FolderInputNode = React.memo(function FolderInputNode({ data, selected }: FolderInputNodeProps) {
  const dirPath = (data.params?.directory_path as string) || ""
  const pattern = (data.params?.file_pattern as string) || "*.fasta,*.fna,*.fa,*.fastq"

  const handlePickDirectory = async () => {
    const selectedPath = await workflowService.pickFolder()
    if (selectedPath) {
      data.onParamChange?.("directory_path", selectedPath)
    }
  }

  return (
    <GenericNodeCard
      data={data}
      icon={FolderInput}
      title={data.title || "Folder Input"}
      description="Ingests sequencing files (.fastq, .fasta, .fna) from a local directory."
      selected={selected}
      inputs={[]}
      outputs={data.outputs || [
        {
          id: "sequence_files",
          name: "Sequence Files",
          socket_type: "sequence_folder",
          direction: "output",
        },
      ]}
    >
      <NodeInputField
        label="Directory Path"
        required
        description="Local directory path containing raw sequence reads"
        value={dirPath}
        onChange={(val) => data.onParamChange?.("directory_path", val)}
        onBrowse={handlePickDirectory}
        placeholder="/path/to/sequences"
      />

      <NodeInputField
        label="File Match Filter"
        description="Glob filter pattern for matching files"
        value={pattern}
        onChange={(val) => data.onParamChange?.("file_pattern", val)}
        placeholder="*.fasta,*.fna,*.fastq"
      />
    </GenericNodeCard>
  )
})
