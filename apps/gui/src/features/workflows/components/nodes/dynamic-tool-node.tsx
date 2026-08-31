import * as React from "react"
import {
  Dna,
  FileSpreadsheet,
  Filter,
  Sparkles,
  Activity,
  CheckCircle2,
  ShieldAlert,
  BarChart3,
  SlidersHorizontal,
} from "lucide-react"
import { BarChart, Bar, XAxis, YAxis, CartesianGrid } from "recharts"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart"
import { GenericNodeCard } from "./base-node-card"
import {
  NodeCheckboxField,
  NodeInputField,
  NodeSelectField,
  NodeNumberField,
  NodeColumnSelectField,
  NodeSection,
} from "./node-form-fields"
import { useWorkflowStore } from "../../stores/workflow-store"
import type { WorkflowNodeData } from "../../types"
import type { ToolManifest, NodeDefinition, ParameterDef } from "@/features/extensions/types"
import { cn } from "@/lib/utils"
import { workflowService } from "../../services/workflow-service"

// ---------------------------------------------------------------------------
// Performance: static constant — allocated once at module load.
// Previously redeclared inside React.memo on every render.
// ---------------------------------------------------------------------------
const CHART_CONFIG = {
  value: { label: "Metric", color: "hsl(var(--primary))" },
} satisfies ChartConfig

interface DynamicToolNodeProps {
  id: string
  data: WorkflowNodeData & {
    manifest?: ToolManifest
    nodeDef?: NodeDefinition
    nodeIndex?: number
  }
  selected?: boolean
}

export const DynamicToolNode = React.memo(function DynamicToolNode({ id, data, selected }: DynamicToolNodeProps) {
  const manifest = data.manifest
  const nodeDef = data.nodeDef
  const inputs = data.inputs || []
  const outputs = data.outputs || []
  const actualNodeId = id || (typeof data.id === "string" ? data.id : "")

  // Filter out any params that are provided via input socket connections
  const inputPortIds = React.useMemo(() => new Set(inputs.map((inp) => inp.id)), [inputs])

  // Strictly use nodeDef.params if this is a specialized sub-node; otherwise fallback to manifest
  const applicableParams: ParameterDef[] = React.useMemo(() => {
    const rawParams = nodeDef?.params || (nodeDef ? [] : manifest?.params || [])
    return rawParams.filter((p) => !inputPortIds.has(p.id))
  }, [nodeDef, manifest, inputPortIds])

  const isViewer =
    data.node_type === "viewer" ||
    nodeDef?.node_type === "viewer" ||
    data.node_id?.includes("viewer") ||
    data.node_id?.includes("visualizer")
  const results = (data.results || {}) as Record<string, any>

  // Dynamic tabular dataset
  const tabularData = results.tabular_data || results.results || results
  const rawPhenotypes = (results.phenotype_profile || results.phenotypes || []) as any[]
  const rawGenes = (results.amr_genes || results.genes || []) as any[]
  const rawMutations = (results.point_mutations || results.mutations || []) as any[]

  const phenotypes = Array.isArray(rawPhenotypes) ? rawPhenotypes : []
  const amrGenes = Array.isArray(rawGenes) ? rawGenes : []
  const pointMutations = Array.isArray(rawMutations) ? rawMutations : []

  // Dynamic node icon depending on role in tool suite
  let NodeIcon = Dna
  if (data.node_type === "parser" || nodeDef?.node_type === "parser") {
    NodeIcon = FileSpreadsheet
  } else if (isViewer) {
    NodeIcon = BarChart3
  } else if (data.node_type === "transformer" || nodeDef?.node_type === "transformer") {
    NodeIcon = Filter
  }

  // Check tabular data shape for shadcn chart
  const chartData = React.useMemo(() => {
    if (tabularData && Array.isArray(tabularData.columns) && tabularData.columns.length > 0) {
      const col0 = tabularData.columns[0]
      const col1 = tabularData.columns[1] || col0
      const labels = col0.values || []
      const vals = col1.values || []
      return labels.map((lbl: any, idx: number) => ({
        category: String(lbl),
        value: typeof vals[idx] === "number" ? vals[idx] : idx + 1,
      }))
    }
    if (amrGenes.length > 0) {
      return amrGenes.map((g) => ({
        category: String(g.gene),
        value: Number(g.identity || 100),
      }))
    }
    return []
  }, [tabularData, amrGenes])

  const hasData =
    phenotypes.length > 0 || amrGenes.length > 0 || pointMutations.length > 0 || chartData.length > 0
  
  const { setInspectNodeId } = useWorkflowStore()

  // Default visible parameters:
  // 1. If required is true -> always show
  // 2. If show is boolean -> use show flag
  // 3. Otherwise -> hide by default
  const defaultVisibleIds = React.useMemo(() => {
    return applicableParams
      .filter((p) => {
        if (p.required === true) return true
        if (typeof p.show === "boolean") return p.show
        return false
      })
      .map((p) => p.id)
  }, [applicableParams])

  const visibleParamIds = data.visible_params || defaultVisibleIds

  const visibleParams = React.useMemo(() => {
    return applicableParams.filter((p) => visibleParamIds.includes(p.id))
  }, [applicableParams, visibleParamIds])

  const hiddenOptionalParams = React.useMemo(() => {
    return applicableParams.filter((p) => !visibleParamIds.includes(p.id))
  }, [applicableParams, visibleParamIds])

  const nodeTitleStr = typeof data.title === "string" ? data.title : nodeDef?.name || manifest?.name || "Tool Node"
  const nodeDescStr = typeof data.description === "string" ? data.description : nodeDef?.description || manifest?.description

  return (
    <GenericNodeCard
      id={actualNodeId}
      data={data}
      icon={NodeIcon}
      title={nodeTitleStr}
      description={nodeDescStr}
      selected={selected}
      inputs={inputs}
      outputs={outputs}
      className={isViewer ? "w-88 sm:w-96" : undefined}
    >
      {/* Parameters rendered dynamically based on component parameters visibility */}
      {visibleParams.map((param) => {
        const val = data.params?.[param.id] !== undefined ? data.params[param.id] : param.default

        if (param.id === "columns_to_keep") {
          return (
            <NodeColumnSelectField
              key={param.id}
              label={param.name}
              description={param.description}
              cliFlag={param.cli_flag}
              value={val ?? []}
              multiple={param.multiple ?? true}
              availableColumns={[]}
              onChange={(newVal) => data.onParamChange?.(param.id, newVal)}
            />
          )
        }

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

        const isDirectoryParam =
          param.id === "directory_path" ||
          param.id === "destination_dir" ||
          param.type === "directory" ||
          param.type === "folder" ||
          (param as any).param_type === "directory" ||
          (param as any).param_type === "folder" ||
          param.id.endsWith("_dir") ||
          param.id.endsWith("_folder") ||
          param.id.includes("directory")

        const handleBrowse = isDirectoryParam
          ? async () => {
              const selected = await workflowService.pickFolder()
              if (selected) {
                data.onParamChange?.(param.id, selected)
              }
            }
          : undefined

        // Standard Text Input
        return (
          <NodeInputField
            key={param.id}
            label={param.name}
            description={param.description}
            cliFlag={param.cli_flag}
            required={param.required}
            value={String(val || "")}
            placeholder={param.description || param.name}
            onChange={(newVal) => data.onParamChange?.(param.id, newVal)}
            onBrowse={handleBrowse}
          />
        )
      })}

      {/* Optional Parameters Trigger Button */}
      {hiddenOptionalParams.length > 0 && (
        <button
          type="button"
          onClick={() => actualNodeId && setInspectNodeId(actualNodeId)}
          className="mx-3.5 my-1 flex items-center justify-between px-2.5 py-1.5 rounded-lg border border-dashed border-border/70 bg-muted/20 hover:bg-muted/50 hover:border-primary/40 text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer nodrag"
        >
          <div className="flex items-center gap-1.5">
            <SlidersHorizontal className="size-3 text-primary" />
            <span className="text-[11px] font-medium">+ Add Parameters</span>
          </div>
          <Badge variant="secondary" className="text-[9px] px-1.5 py-0 h-4 font-mono font-normal">
            {hiddenOptionalParams.length} available
          </Badge>
        </button>
      )}

      {/* Interactive Visualizer Card with Shadcn Recharts Bar Chart */}
      {isViewer && (
        <NodeSection
          title="Analysis Visualizer"
          icon={Activity}
          badge={
            hasData ? (
              <Badge
                variant="outline"
                className="text-[10px] px-2 py-0.5 bg-emerald-500/10 text-emerald-500 border-emerald-500/20 font-medium"
              >
                {chartData.length > 0 ? `${chartData.length} Data Points` : "Ready"}
              </Badge>
            ) : undefined
          }
        >
          {!hasData ? (
            <div className="p-4 rounded-xl bg-muted/20 border border-dashed border-border/70 flex flex-col items-center justify-center text-center gap-2 text-xs text-muted-foreground my-1">
              <Sparkles className="size-4 text-muted-foreground/60 animate-pulse" />
              <p className="text-[11px] leading-tight font-medium text-foreground/80">
                Awaiting Pipeline Execution
              </p>
              <p className="text-[10px] text-muted-foreground/80 leading-normal max-w-[260px]">
                Connect to upstream parser and click Run Pipeline to render live visualization.
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-2.5 my-1">
              {/* Shadcn Bar Chart */}
              {chartData.length > 0 && (
                <div className="p-2 rounded-lg bg-card/60 border border-border/60">
                  <ChartContainer config={CHART_CONFIG} className="min-h-[160px] w-full">
                    <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis
                        dataKey="category"
                        tickLine={false}
                        axisLine={false}
                        tickMargin={6}
                        fontSize={10}
                      />
                      <YAxis tickLine={false} axisLine={false} fontSize={10} />
                      <ChartTooltip content={<ChartTooltipContent />} />
                      <Bar dataKey="value" fill="var(--color-value)" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ChartContainer>
                </div>
              )}

              {/* Antibiogram Clinical Matrix if available */}
              {phenotypes.length > 0 && (
                <div onWheel={(e) => e.stopPropagation()} className="nowheel nodrag">
                  <ScrollArea className="h-44 rounded-lg bg-muted/20 border border-border/70 p-2 nowheel nodrag">
                    <div className="flex flex-col gap-1.5 pr-1">
                      {phenotypes.map((item, idx) => {
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
                                <Badge className="bg-rose-500/20 text-rose-400 text-[10px] py-0.5 px-2 gap-1 border-rose-500/30 font-medium">
                                  <ShieldAlert className="size-3" />
                                  <span>Resistant</span>
                                </Badge>
                              ) : (
                                <Badge className="bg-emerald-500/20 text-emerald-400 text-[10px] py-0.5 px-2 gap-1 border-emerald-500/30 font-medium">
                                  <CheckCircle2 className="size-3" />
                                  <span>Susceptible</span>
                                </Badge>
                              )}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </ScrollArea>
                </div>
              )}
            </div>
          )}
        </NodeSection>
      )}
    </GenericNodeCard>
  )
})
