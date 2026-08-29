import * as React from "react"
import { Dna, FileSpreadsheet, Eye, Filter, Sparkles, Activity, CheckCircle2, ShieldAlert } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { GenericNodeCard } from "./base-node-card"
import {
  NodeCheckboxField,
  NodeInputField,
  NodeSelectField,
  NodeNumberField,
  NodeSection,
} from "./node-form-fields"
import type { WorkflowNodeData } from "../../types"
import type { ToolManifest, NodeDefinition, ParameterDef } from "@/features/extensions/types"
import { cn } from "@/lib/utils"

interface DynamicToolNodeProps {
  data: WorkflowNodeData & {
    manifest?: ToolManifest
    nodeDef?: NodeDefinition
    nodeIndex?: number
  }
  selected?: boolean
}

export const DynamicToolNode = React.memo(function DynamicToolNode({ data, selected }: DynamicToolNodeProps) {
  const manifest = data.manifest
  const nodeDef = data.nodeDef
  const inputs = data.inputs || []
  const outputs = data.outputs || []
  const params: ParameterDef[] = nodeDef?.params || manifest?.params || []

  const isViewer = data.node_type === "viewer" || nodeDef?.node_type === "viewer" || data.node_id?.includes("visualizer")
  const results = (data.results || {}) as Record<string, any>

  // Extract parsed datasets from node results or incoming inputs
  const rawPhenotypes = (results.phenotype_profile || results.phenotypes || results.results || []) as any[]
  const rawGenes = (results.amr_genes || results.genes || []) as any[]
  const rawMutations = (results.point_mutations || results.mutations || []) as any[]

  const phenotypes = Array.isArray(rawPhenotypes) ? rawPhenotypes : []
  const amrGenes = Array.isArray(rawGenes) ? rawGenes : []
  const pointMutations = Array.isArray(rawMutations) ? rawMutations : []

  const viewMode = (data.params?.view_mode as string) || "antibiogram_matrix"

  // Dynamic node icon depending on role in tool suite
  let NodeIcon = Dna
  if (data.node_type === "parser" || nodeDef?.node_type === "parser") {
    NodeIcon = FileSpreadsheet
  } else if (isViewer) {
    NodeIcon = Eye
  } else if (data.node_type === "transformer" || nodeDef?.node_type === "transformer") {
    NodeIcon = Filter
  }

  const hasData = phenotypes.length > 0 || amrGenes.length > 0 || pointMutations.length > 0

  return (
    <GenericNodeCard
      data={data}
      icon={NodeIcon}
      title={data.title || nodeDef?.name || manifest?.name || "Bioinformatics Tool"}
      description={nodeDef?.description || manifest?.description || "Executes analysis algorithm on input sequencing reads."}
      selected={selected}
      inputs={inputs}
      outputs={outputs}
      className={isViewer ? "w-84 sm:w-96" : undefined}
    >
      {/* Dynamically Rendered Parameter Controls from Manifest */}
      {params.map((param) => {
        const val = data.params?.[param.id] ?? param.default

        if (param.type === "select") {
          const currentVal = String(val ?? param.options?.[0] ?? "other")
          return (
            <NodeSelectField
              key={param.id}
              label={param.name}
              description={param.description}
              cliFlag={param.cli_flag}
              value={currentVal}
              options={param.options || []}
              placeholder={`Select ${param.name}`}
              onChange={(newVal) => data.onParamChange?.(param.id, newVal)}
            />
          )
        }

        if (param.type === "boolean" || typeof param.default === "boolean") {
          const isChecked = Boolean(val)
          const paramUniqueId = `${data.id}_${param.id}`
          return (
            <NodeCheckboxField
              key={param.id}
              id={paramUniqueId}
              label={param.name}
              description={param.description}
              cliFlag={param.cli_flag}
              checked={isChecked}
              onChange={(checked) => data.onParamChange?.(param.id, checked)}
            />
          )
        }

        if (param.type === "number" || typeof param.default === "number") {
          const numVal = typeof val === "number" ? val : parseFloat(val) || 0
          return (
            <NodeNumberField
              key={param.id}
              label={param.name}
              description={param.description}
              cliFlag={param.cli_flag}
              value={numVal}
              min={param.min ?? 0}
              max={param.max ?? 1000}
              step={param.step ?? 1}
              placeholder={String(param.default || 0)}
              onChange={(newVal) => data.onParamChange?.(param.id, newVal)}
            />
          )
        }

        // Standard Text Input
        return (
          <NodeInputField
            key={param.id}
            label={param.name}
            description={param.description}
            cliFlag={param.cli_flag}
            value={String(val || "")}
            placeholder={param.description || param.name}
            onChange={(newVal) => data.onParamChange?.(param.id, newVal)}
          />
        )
      })}

      {/* Interactive Visualizer Section for Viewer Nodes (Antibiogram Card) */}
      {isViewer && (
        <NodeSection
          title="AMR Clinical Heatmap"
          icon={Activity}
          badge={
            hasData ? (
              <Badge variant="outline" className="text-[10px] px-2 py-0.5 bg-emerald-500/10 text-emerald-500 border-emerald-500/20 font-medium">
                {phenotypes.length > 0 ? phenotypes.length : amrGenes.length} Antimicrobials Screened
              </Badge>
            ) : undefined
          }
        >
          {!hasData ? (
            <div className="p-4 rounded-xl bg-muted/20 border border-dashed border-border/70 flex flex-col items-center justify-center text-center gap-2 text-xs text-muted-foreground my-1">
              <Sparkles className="size-4 text-muted-foreground/60 animate-pulse" />
              <p className="text-[11px] leading-tight font-medium text-foreground/80">Awaiting Pipeline Execution</p>
              <p className="text-[10px] text-muted-foreground/80 leading-normal max-w-[260px]">
                Connect to ResFinder Parser and click Run Pipeline to render live antibiogram.
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-2.5 my-1">
              {/* Summary Stats Row */}
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="p-2 rounded-lg bg-rose-500/10 border border-rose-500/20 flex flex-col justify-center">
                  <span className="text-[10px] text-rose-500 font-medium uppercase tracking-wider">Resistant</span>
                  <span className="text-sm font-bold text-rose-500 mt-0.5">
                    {phenotypes.length > 0 ? phenotypes.filter((p) => p.resistant).length : amrGenes.length}
                  </span>
                </div>
                <div className="p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex flex-col justify-center">
                  <span className="text-[10px] text-emerald-500 font-medium uppercase tracking-wider">Susceptible</span>
                  <span className="text-sm font-bold text-emerald-500 mt-0.5">
                    {phenotypes.filter((p) => !p.resistant).length}
                  </span>
                </div>
                <div className="p-2 rounded-lg bg-amber-500/10 border border-amber-500/20 flex flex-col justify-center">
                  <span className="text-[10px] text-amber-500 font-medium uppercase tracking-wider">AMR Genes</span>
                  <span className="text-sm font-bold text-amber-500 mt-0.5">
                    {amrGenes.length}
                  </span>
                </div>
              </div>

              {/* View 1: Antibiogram Clinical Susceptibility Matrix */}
              {viewMode === "antibiogram_matrix" && (
                <div
                  onWheel={(e) => e.stopPropagation()}
                  className="nowheel nodrag"
                >
                  <ScrollArea className="h-48 rounded-lg bg-muted/20 border border-border/70 p-2 nowheel nodrag">
                    <div className="flex flex-col gap-1.5 pr-1">
                      {phenotypes.length > 0 ? (
                        phenotypes.map((item, idx) => {
                          const isRes = item.resistant ?? true
                          return (
                            <div
                              key={idx}
                              className={cn(
                                "flex items-center justify-between p-2 rounded-lg border text-xs transition-colors",
                                isRes
                                  ? "bg-rose-500/5 border-rose-500/20 text-rose-400"
                                  : "bg-emerald-500/5 border-emerald-500/20 text-emerald-400"
                              )}
                            >
                              <div className="flex flex-col min-w-0 pr-2">
                                <span className="font-semibold text-foreground truncate text-[11px]">
                                  {item.antimicrobial}
                                </span>
                                <span className="text-[10px] text-muted-foreground truncate">
                                  {item.class || "Antibiotic Class"}
                                </span>
                              </div>

                              <div className="flex items-center gap-1.5 shrink-0">
                                {isRes ? (
                                  <Badge className="bg-rose-500/20 text-rose-400 hover:bg-rose-500/30 text-[10px] py-0.5 px-2 gap-1 border-rose-500/30 font-medium">
                                    <ShieldAlert className="size-3" />
                                    <span>Resistant</span>
                                  </Badge>
                                ) : (
                                  <Badge className="bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 text-[10px] py-0.5 px-2 gap-1 border-emerald-500/30 font-medium">
                                    <CheckCircle2 className="size-3" />
                                    <span>Susceptible</span>
                                  </Badge>
                                )}
                              </div>
                            </div>
                          )
                        })
                      ) : (
                        amrGenes.map((gene, idx) => (
                          <div
                            key={idx}
                            className="flex items-center justify-between p-2 rounded-lg bg-rose-500/5 border border-rose-500/20 text-xs"
                          >
                            <span className="font-semibold text-foreground font-mono text-[11px]">{gene.gene}</span>
                            <Badge className="bg-rose-500/20 text-rose-400 text-[10px] py-0.5 px-2 border-rose-500/30">
                              {gene.identity}% id
                            </Badge>
                          </div>
                        ))
                      )}
                    </div>
                  </ScrollArea>
                </div>
              )}

              {/* View 2: Identified AMR Genes Table */}
              {viewMode === "gene_table" && (
                <div
                  onWheel={(e) => e.stopPropagation()}
                  className="nowheel nodrag"
                >
                  <ScrollArea className="h-48 rounded-lg bg-muted/20 border border-border/70 p-2 nowheel nodrag">
                    <div className="flex flex-col gap-1.5 pr-1 text-xs">
                      {amrGenes.map((gene, idx) => (
                        <div key={idx} className="p-2 rounded-lg bg-card border border-border/60 flex flex-col gap-1 shadow-xs">
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-foreground font-mono text-[11px]">{gene.gene}</span>
                            <span className="text-[10px] text-muted-foreground">{gene.phenotype}</span>
                          </div>
                          <div className="flex items-center gap-3 text-muted-foreground text-[10px]">
                            <span>Identity: <strong className="text-foreground">{gene.identity}%</strong></span>
                            <span>Coverage: <strong className="text-foreground">{gene.coverage}%</strong></span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                </div>
              )}

              {/* View 3: Phenotype Summary */}
              {viewMode === "phenotype_summary" && (
                <div className="p-3 rounded-lg bg-muted/20 border border-border/60 text-xs flex flex-col gap-2 text-muted-foreground">
                  <div className="flex justify-between items-center py-0.5 border-b border-border/40">
                    <span>Acquired AMR Genes:</span>
                    <strong className="text-foreground font-semibold">{amrGenes.length}</strong>
                  </div>
                  <div className="flex justify-between items-center py-0.5 border-b border-border/40">
                    <span>Point Mutations:</span>
                    <strong className="text-foreground font-semibold">{pointMutations.length}</strong>
                  </div>
                  <div className="flex justify-between items-center py-0.5">
                    <span>Tested Antimicrobials:</span>
                    <strong className="text-foreground font-semibold">{phenotypes.length}</strong>
                  </div>
                </div>
              )}
            </div>
          )}
        </NodeSection>
      )}
    </GenericNodeCard>
  )
})
