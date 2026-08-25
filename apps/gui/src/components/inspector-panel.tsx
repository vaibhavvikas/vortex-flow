import * as React from "react"
import {
  PanelRightClose,
  Sliders,
  Info,
  Cpu,
  FileCode,
  Dna,
  Copy,
  Check,
  Tag,
  FileText,
  Building,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ScrollArea } from "@/components/ui/scroll-area"
import { cn } from "@/lib/utils"
import type { Node } from "@xyflow/react"
import type { WorkflowNodeData } from "@/components/workflow-canvas"
import type { SraRecord } from "@/services/sra-service"

interface InspectorPanelProps {
  isOpen: boolean
  onClose: () => void
  selectedNode: Node<WorkflowNodeData> | null
  selectedRecord?: { record: SraRecord; db: string } | null
}

function formatXml(xml: string): string {
  if (!xml) return ""
  let formatted = ""
  let indent = 0
  const tab = "  "
  const cleanXml = xml.replace(/>\s*</g, "><").trim()
  const tokens = cleanXml.replace(/></g, ">\n<").split("\n")

  for (let token of tokens) {
    token = token.trim()
    if (!token) continue

    if (token.startsWith("</")) {
      indent = Math.max(0, indent - 1)
      formatted += tab.repeat(indent) + token + "\n"
    } else if (token.startsWith("<") && token.endsWith("/>")) {
      formatted += tab.repeat(indent) + token + "\n"
    } else if (token.startsWith("<") && token.includes("</")) {
      formatted += tab.repeat(indent) + token + "\n"
    } else if (token.startsWith("<") && !token.startsWith("<?") && !token.startsWith("<!")) {
      formatted += tab.repeat(indent) + token + "\n"
      indent++
    } else {
      formatted += tab.repeat(indent) + token + "\n"
    }
  }

  return formatted.trim()
}

export function InspectorPanel({
  isOpen,
  onClose,
  selectedNode,
  selectedRecord,
}: InspectorPanelProps) {
  const [tab, setTab] = React.useState<"overview" | "identifiers" | "xml">("overview")
  const [copied, setCopied] = React.useState(false)
  const [copiedAcc, setCopiedAcc] = React.useState(false)

  const rec = selectedRecord?.record
  const prettifiedXml = React.useMemo(() => {
    return rec?.expxml ? formatXml(rec.expxml) : ""
  }, [rec?.expxml])

  const handleCopyXml = () => {
    if (!prettifiedXml) return
    navigator.clipboard.writeText(prettifiedXml)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleCopyAccession = () => {
    if (!rec?.accession) return
    navigator.clipboard.writeText(rec.accession)
    setCopiedAcc(true)
    setTimeout(() => setCopiedAcc(false), 2000)
  }

  return (
    <aside
      className={cn(
        "bg-background flex flex-col h-full shrink-0 transition-all duration-300 ease-in-out border-l border-border",
        isOpen
          ? "w-80 p-4 opacity-100 space-y-4"
          : "w-0 p-0 opacity-0 border-l-0 overflow-hidden pointer-events-none"
      )}
    >
      <div className="flex items-center justify-between min-w-[288px]">
        <div className="flex items-center gap-2">
          <Sliders className="size-4 text-primary" />
          <h2 className="text-sm font-semibold tracking-tight">Sequence Inspector</h2>
        </div>
        <Button variant="ghost" size="icon-sm" onClick={onClose} title="Close Inspector">
          <PanelRightClose className="size-4" />
        </Button>
      </div>

      <Separator />

      <ScrollArea className="flex-1 -mx-2 px-2 min-h-0">
        <div className="min-w-[272px] space-y-4 pr-1">
          {/* SRA Sequence Run Selected */}
          {selectedRecord && rec ? (
            <div className="space-y-4">
            {/* Hero Header Card */}
            <div className="space-y-2 bg-muted/40 p-3 rounded-xl border border-border/60">
              <div className="flex items-center justify-between">
                <button
                  onClick={handleCopyAccession}
                  className="flex items-center gap-1.5 font-mono text-xs font-bold text-primary hover:underline group"
                  title="Click to copy accession"
                >
                  <span>{rec.accession}</span>
                  {copiedAcc ? (
                    <Check className="size-3 text-emerald-400" />
                  ) : (
                    <Copy className="size-3 text-muted-foreground opacity-60 group-hover:opacity-100 transition-opacity" />
                  )}
                </button>
                <Badge variant="secondary" className="text-[10px] uppercase font-semibold">
                  {selectedRecord.db}
                </Badge>
              </div>
              <h3 className="text-xs font-semibold leading-snug line-clamp-2 text-foreground" title={rec.title}>
                {rec.title}
              </h3>
              <div className="flex flex-wrap gap-1.5 pt-1">
                {(rec.library_strategy || rec.platform) && (
                  <Badge variant="default" className="text-[10px] font-semibold bg-primary/90">
                    {rec.library_strategy || rec.platform}
                  </Badge>
                )}
                {rec.organism && (
                  <Badge variant="outline" className="text-[10px] italic">
                    {rec.organism}
                  </Badge>
                )}
                {rec.center_name && (
                  <Badge variant="outline" className="text-[10px] font-mono text-muted-foreground">
                    {rec.center_name}
                  </Badge>
                )}
              </div>
            </div>

            {/* 2x2 Key KPI Metrics Grid (Instant load from expxml!) */}
            <div className="grid grid-cols-2 gap-2">
              <div className="bg-card border border-border/60 rounded-xl p-2.5 space-y-0.5 shadow-xs">
                <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider block">Spot Count</span>
                <p className="text-sm font-bold font-mono tracking-tight text-foreground truncate">
                  {rec.total_spots || "N/A"}
                </p>
              </div>
              <div className="bg-card border border-border/60 rounded-xl p-2.5 space-y-0.5 shadow-xs">
                <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider block">Total Bases</span>
                <p className="text-sm font-bold font-mono tracking-tight text-foreground truncate">
                  {rec.total_bases || "N/A"}
                </p>
              </div>
              <div className="bg-card border border-border/60 rounded-xl p-2.5 space-y-0.5 shadow-xs">
                <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider block">Total Runs</span>
                <p className="text-sm font-bold font-mono tracking-tight text-foreground truncate">
                  {rec.total_runs || "1"}
                </p>
              </div>
              <div className="bg-card border border-border/60 rounded-xl p-2.5 space-y-0.5 shadow-xs">
                <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider block">Total Size</span>
                <p className="text-sm font-bold font-mono tracking-tight text-foreground truncate">
                  {rec.total_size || "N/A"}
                </p>
              </div>
            </div>

            {/* Segmented View Switcher */}
            <div className="flex bg-muted/50 p-1 rounded-lg border border-border/40 text-xs">
              <button
                onClick={() => setTab("overview")}
                className={cn(
                  "flex-1 py-1 text-center font-medium rounded-md transition-all cursor-pointer",
                  tab === "overview"
                    ? "bg-background text-foreground shadow-xs font-semibold"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                Overview
              </button>
              <button
                onClick={() => setTab("identifiers")}
                className={cn(
                  "flex-1 py-1 text-center font-medium rounded-md transition-all cursor-pointer",
                  tab === "identifiers"
                    ? "bg-background text-foreground shadow-xs font-semibold"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                Accessions
              </button>
              <button
                onClick={() => setTab("xml")}
                className={cn(
                  "flex-1 py-1 text-center font-medium rounded-md transition-all cursor-pointer",
                  tab === "xml"
                    ? "bg-background text-foreground shadow-xs font-semibold"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                Raw XML
              </button>
            </div>

            {/* Tab 1: Overview */}
            {tab === "overview" && (
              <div className="space-y-3 text-xs">
                {/* Sequencing & Platform Specs */}
                <div className="bg-card/50 border border-border/50 rounded-xl p-3 space-y-2">
                  <h4 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                    <Dna className="size-3 text-primary" /> Sequencing Specs
                  </h4>
                  <div className="space-y-1.5 pt-0.5">
                    <div className="flex justify-between items-center py-0.5">
                      <span className="text-muted-foreground">Instrument</span>
                      <span className="font-medium text-foreground truncate max-w-[150px]" title={rec.instrument_model || rec.platform}>
                        {rec.instrument_model || rec.platform}
                      </span>
                    </div>
                    {rec.library_layout && (
                      <div className="flex justify-between items-center py-0.5">
                        <span className="text-muted-foreground">Layout</span>
                        <span className="font-semibold text-foreground">
                          {rec.library_layout.replace(/<|\/|>/g, "").trim()}
                        </span>
                      </div>
                    )}
                    {rec.library_selection && (
                      <div className="flex justify-between items-center py-0.5">
                        <span className="text-muted-foreground">Selection</span>
                        <span className="font-medium text-foreground">{rec.library_selection}</span>
                      </div>
                    )}
                    {rec.library_source && (
                      <div className="flex justify-between items-center py-0.5">
                        <span className="text-muted-foreground">Source</span>
                        <span className="font-medium text-foreground">{rec.library_source}</span>
                      </div>
                    )}
                    {rec.release_date && (
                      <div className="flex justify-between items-center py-0.5">
                        <span className="text-muted-foreground">Created Date</span>
                        <span className="font-medium text-muted-foreground">{rec.release_date}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Submitter & Center */}
                {(rec.submitter_acc || rec.center_name) && (
                  <div className="bg-card/50 border border-border/50 rounded-xl p-3 space-y-2">
                    <h4 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                      <Building className="size-3 text-primary" /> Submitter Information
                    </h4>
                    <div className="space-y-1.5 pt-0.5">
                      {rec.center_name && (
                        <div className="flex justify-between items-center py-0.5">
                          <span className="text-muted-foreground">Center Name</span>
                          <span className="font-medium text-foreground">{rec.center_name}</span>
                        </div>
                      )}
                      {rec.submitter_acc && (
                        <div className="flex justify-between items-center py-0.5">
                          <span className="text-muted-foreground">Submitter Acc</span>
                          <span className="font-mono font-medium text-foreground">{rec.submitter_acc}</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Library Construction Protocol */}
                {rec.construction_protocol && (
                  <div className="bg-card/50 border border-border/50 rounded-xl p-3 space-y-1.5">
                    <h4 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                      <FileText className="size-3 text-primary" /> Construction Protocol
                    </h4>
                    <p className="text-[11px] text-muted-foreground leading-relaxed line-clamp-6 pt-0.5">
                      {rec.construction_protocol}
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Tab 2: Accessions */}
            {tab === "identifiers" && (
              <div className="bg-card/50 border border-border/50 rounded-xl p-3 space-y-2 text-xs">
                <h4 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                  <Tag className="size-3 text-primary" /> Database Accessions
                </h4>
                <div className="space-y-1.5 pt-1 font-mono text-[11px]">
                  <div className="flex justify-between items-center py-1 border-b border-border/40">
                    <span className="text-muted-foreground font-sans">Run Accession</span>
                    <span className="font-bold text-primary">{rec.accession}</span>
                  </div>
                  {rec.experiment_acc && (
                    <div className="flex justify-between items-center py-1 border-b border-border/40">
                      <span className="text-muted-foreground font-sans">Experiment</span>
                      <span className="font-medium text-foreground">{rec.experiment_acc}</span>
                    </div>
                  )}
                  {rec.study_id && (
                    <div className="flex justify-between items-center py-1 border-b border-border/40">
                      <span className="text-muted-foreground font-sans">SRA Study</span>
                      <span className="font-medium text-foreground">{rec.study_id}</span>
                    </div>
                  )}
                  {rec.bioproject && (
                    <div className="flex justify-between items-center py-1 border-b border-border/40">
                      <span className="text-muted-foreground font-sans">BioProject</span>
                      <span className="font-medium text-foreground">{rec.bioproject}</span>
                    </div>
                  )}
                  {rec.biosample && (
                    <div className="flex justify-between items-center py-1 border-b border-border/40">
                      <span className="text-muted-foreground font-sans">BioSample</span>
                      <span className="font-medium text-foreground">{rec.biosample}</span>
                    </div>
                  )}
                  {rec.sample_acc && (
                    <div className="flex justify-between items-center py-1">
                      <span className="text-muted-foreground font-sans">Sample Acc</span>
                      <span className="font-medium text-foreground">{rec.sample_acc}</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Tab 3: Raw XML */}
            {tab === "xml" && (
              <div className="space-y-2">
                {rec.expxml ? (
                  <div className="relative border border-border rounded-xl bg-black/90 p-3">
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={handleCopyXml}
                      className="absolute top-2 right-2 text-white hover:bg-white/20"
                      title="Copy XML"
                    >
                      {copied ? <Check className="size-3.5 text-emerald-400" /> : <Copy className="size-3.5" />}
                    </Button>
                    <pre className="text-[10.5px] font-mono text-emerald-400/95 max-h-96 whitespace-pre-wrap break-words [overflow-wrap:anywhere] font-normal pr-6 leading-relaxed select-text">
                      {prettifiedXml}
                    </pre>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground text-center py-6">No raw XML available for this record.</p>
                )}
              </div>
            )}
          </div>
        ) : selectedNode ? (
          /* Workflow Canvas Node Selected */
          <div className="space-y-4">
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground font-medium">NODE ID: #{selectedNode.id}</span>
                <Badge
                  variant={
                    selectedNode.data.status === "completed"
                      ? "default"
                      : selectedNode.data.status === "running"
                      ? "secondary"
                      : "outline"
                  }
                >
                  {selectedNode.data.status}
                </Badge>
              </div>
              <h3 className="text-base font-semibold">{selectedNode.data.label}</h3>
              <p className="text-xs text-muted-foreground">{selectedNode.data.category}</p>
            </div>

            <Card className="bg-card/50">
              <CardHeader className="p-3 pb-1">
                <CardTitle className="text-xs font-medium flex items-center gap-1.5">
                  <Cpu className="size-3.5 text-primary" /> Compute Resources
                </CardTitle>
              </CardHeader>
              <CardContent className="p-3 pt-2 space-y-3">
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground font-medium">Allocated Threads</label>
                  <Input type="number" defaultValue={selectedNode.data.threads} />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground font-medium">Memory Allocation</label>
                  <Input defaultValue={selectedNode.data.mem} />
                </div>
              </CardContent>
            </Card>

            <Card className="bg-card/50">
              <CardHeader className="p-3 pb-1">
                <CardTitle className="text-xs font-medium flex items-center gap-1.5">
                  <FileCode className="size-3.5 text-primary" /> Parameters & Flags
                </CardTitle>
              </CardHeader>
              <CardContent className="p-3 pt-2 space-y-3">
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground font-medium">Min Quality Score (-q)</label>
                  <Input defaultValue="30" />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground font-medium">Genome Reference</label>
                  <Input defaultValue="GRCh38.p13.fa" />
                </div>
              </CardContent>
            </Card>
          </div>
        ) : (
          /* General Workspace State */
          <div className="space-y-4">
            <div className="space-y-1">
              <h3 className="text-sm font-medium">Global Workflow & Dataset Inspector</h3>
              <p className="text-xs text-muted-foreground">
                Click any search result row in Explore or a node in the Workflow canvas to inspect live metadata.
              </p>
            </div>

            <Card className="bg-card/50">
              <CardHeader className="p-3 pb-1">
                <CardTitle className="text-xs font-medium flex items-center gap-1.5">
                  <Info className="size-3.5 text-primary" /> Engine Status
                </CardTitle>
              </CardHeader>
              <CardContent className="p-3 pt-2 space-y-2 text-xs">
                <div className="flex justify-between py-1 border-b border-border/50">
                  <span className="text-muted-foreground">Engine Mode</span>
                  <span className="font-medium">VortexFlow Rust Core</span>
                </div>
                <div className="flex justify-between py-1 border-b border-border/50">
                  <span className="text-muted-foreground">Entrez EFetch</span>
                  <span className="font-medium text-emerald-500">Connected (XML)</span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="text-muted-foreground">Logging Stream</span>
                  <span className="font-medium text-emerald-500">Active (SSE)</span>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
        </div>
      </ScrollArea>
    </aside>
  )
}
