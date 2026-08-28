import * as React from "react"
import { FolderInput, FolderOpen } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { GenericNodeCard, GenericInputField } from "./base-node-card"
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
      {/* Directory Path Field */}
      <GenericInputField
        label="Directory Path"
        required
        description="Local directory path containing raw sequence reads"
      >
        <div className="flex items-center gap-1.5 w-full">
          <Input
            value={dirPath}
            onChange={(e) => data.onParamChange?.("directory_path", e.target.value)}
            placeholder="/path/to/sequences"
            className="h-8 rounded-lg bg-background border border-border/80 text-xs px-3 shadow-xs font-mono"
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handlePickDirectory}
            className="h-8 px-2.5 rounded-lg shrink-0 cursor-pointer shadow-xs"
            title="Browse Directory"
          >
            <FolderOpen className="size-3.5" />
          </Button>
        </div>
      </GenericInputField>

      {/* File Pattern Field */}
      <GenericInputField
        label="File Match Filter"
        description="Glob filter pattern for matching files"
      >
        <Input
          value={pattern}
          onChange={(e) => data.onParamChange?.("file_pattern", e.target.value)}
          placeholder="*.fasta,*.fna,*.fastq"
          className="h-8 rounded-lg bg-background border border-border/80 text-xs px-3 font-mono shadow-xs"
        />
      </GenericInputField>
    </GenericNodeCard>
  )
})
