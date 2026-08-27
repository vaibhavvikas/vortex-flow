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
  BarChart3,
  FlaskConical,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { cn } from "@/lib/utils"
import { Highlight, themes } from "prism-react-renderer"
import { useTheme } from "@/components/layout/theme-provider"
import type { Node } from "@xyflow/react"
import type { WorkflowNodeData } from "@/features/workflows"
import type { SraRecord } from "@/features/explore"

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
  
  // Unescape XML entities if NCBI returned encoded strings
  const unescaped = xml
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")

  const cleanXml = unescaped.replace(/>\s*</g, "><").trim()
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

function hasValue(val?: string | null): boolean {
  if (!val) return false
  const trimmed = val.trim()
  const lower = trimmed.toLowerCase()
  if (
    lower === "na" ||
    lower === "n/a" ||
    lower === "none" ||
    lower === "null" ||
    lower === "-" ||
    lower === "" ||
    lower.startsWith("0001") ||
    lower.startsWith("0000") ||
    lower.startsWith("01/01/01") ||
    lower.startsWith("01/01/0001") ||
    lower.startsWith("1/1/01") ||
    lower.startsWith("1970")
  ) {
    return false
  }
  return true
}

function formatEmDash(val?: string | null): React.ReactNode {
  if (!hasValue(val)) {
    return <span className="text-muted-foreground/60 font-normal select-none">—</span>
  }
  return val!.trim()
}

function formatDateString(val?: string | null): string | null {
  if (!hasValue(val)) return null
  const text = val!.trim()
  const clean = text.split(" ")[0].split("T")[0]
  const sep = clean.includes("/") ? "/" : clean.includes("-") ? "-" : clean.includes(".") ? "." : null
  if (sep) {
    const parts = clean.split(sep)
    if (parts.length === 3) {
      let y = parts[0]
      let m = parts[1]
      let d = parts[2]
      if (d.length === 4) {
        const temp = y
        y = d
        d = temp
      }
      const yearNum = parseInt(y, 10)
      if (yearNum >= 1970 && yearNum < 2100) {
        return `${d.padStart(2, "0")}/${m.padStart(2, "0")}/${yearNum}`
      }
    }
  }
  return clean
}

function MetaRow({
  label,
  value,
  isMono = false,
  isPrimary = false,
}: {
  label: string
  value?: string | null
  isMono?: boolean
  isPrimary?: boolean
}) {
  if (!hasValue(value)) return null
  return (
    <div className="flex justify-between items-center py-1 border-b border-border/30 last:border-b-0">
      <span className="text-muted-foreground font-sans">{label}</span>
      <span
        className={cn(
          "font-medium text-foreground truncate max-w-[160px]",
          isMono && "font-mono tabular-nums",
          isPrimary && "font-bold text-primary"
        )}
        title={value!}
      >
        {value!.trim()}
      </span>
    </div>
  )
}

function extractStatFromXml(xml: string, category: string): string | null {
  if (!xml) return null
  const lower = xml.toLowerCase()
  const catPattern = `category="${category.toLowerCase()}"`
  const pos = lower.indexOf(catPattern)
  if (pos === -1) return null
  const after = xml.slice(pos)
  const tagEnd = after.indexOf(">")
  if (tagEnd === -1) return null
  const content = after.slice(tagEnd + 1)
  const closeIdx = content.indexOf("</")
  if (closeIdx === -1) return null
  const val = content.slice(0, closeIdx).trim()
  return val || null
}

function renderAssemblyOverview(rec: SraRecord) {
  const meta = rec.expxml || ""
  const contigCount = extractStatFromXml(meta, "contig_count")
  const contigN50 = extractStatFromXml(meta, "contig_n50")
  const contigL50 = extractStatFromXml(meta, "contig_l50")
  const chromosomeCount = extractStatFromXml(meta, "chromosome_count")
  const scaffoldCount = extractStatFromXml(meta, "scaffold_count")
  const gcPercent = extractStatFromXml(meta, "gc_percent")
  const hasStats = !!(contigCount || contigN50 || chromosomeCount || scaffoldCount || gcPercent)
  const hasSubmitter = hasValue(rec.center_name) || hasValue(rec.submitter_acc)

  return (
    <Accordion
      key={`${rec.accession}-assembly-overview`}
      multiple
      defaultValue={["assembly_specs", "assembly_stats", "submitter"]}
      className="space-y-2.5 text-xs"
    >
      {/* Assembly Specifications */}
      <AccordionItem value="assembly_specs" className="bg-card/50 border border-border/50 rounded-xl px-3 border-b-0">
        <AccordionTrigger className="py-2.5 hover:no-underline cursor-pointer">
          <h4 className="text-xs font-semibold text-foreground flex items-center gap-1.5">
            <Dna className="size-3 text-primary" /> Assembly Specifications
          </h4>
        </AccordionTrigger>
        <AccordionContent className="pb-2.5 pt-0">
          <div className="pt-1.5 font-sans text-xs">
            <MetaRow label="Assembly Level" value={rec.library_layout || rec.platform} />
            <MetaRow label="Assembly Name" value={rec.instrument_model} isMono />
            <MetaRow label="RefSeq Category" value={rec.total_spots} />
            <MetaRow label="Taxonomy" value={rec.study_id} isMono />
            <MetaRow label="Source Database" value={rec.library_selection} />
            <MetaRow label="Release Date" value={formatDateString(rec.release_date)} isMono />
          </div>
        </AccordionContent>
      </AccordionItem>

      {/* Assembly Quality & Contig Stats */}
      {hasStats && (
        <AccordionItem value="assembly_stats" className="bg-card/50 border border-border/50 rounded-xl px-3 border-b-0">
          <AccordionTrigger className="py-2.5 hover:no-underline cursor-pointer">
            <h4 className="text-xs font-semibold text-foreground flex items-center gap-1.5">
              <BarChart3 className="size-3 text-primary" /> Assembly Quality & Stats
            </h4>
          </AccordionTrigger>
          <AccordionContent className="pb-2.5 pt-0">
            <div className="pt-1.5 font-mono tabular-nums text-xs">
              <MetaRow label="Chromosomes" value={chromosomeCount} isMono />
              <MetaRow label="Contig Count" value={contigCount} isMono />
              <MetaRow label="Contig N50" value={contigN50 ? `${Number(contigN50).toLocaleString()} bp` : null} isMono />
              <MetaRow label="Contig L50" value={contigL50} isMono />
              <MetaRow label="Scaffold Count" value={scaffoldCount} isMono />
              <MetaRow label="GC Content" value={gcPercent ? `${gcPercent}%` : null} isMono />
            </div>
          </AccordionContent>
        </AccordionItem>
      )}

      {/* Submitter Organization */}
      {hasSubmitter && (
        <AccordionItem value="submitter" className="bg-card/50 border border-border/50 rounded-xl px-3 border-b-0">
          <AccordionTrigger className="py-2.5 hover:no-underline cursor-pointer">
            <h4 className="text-xs font-semibold text-foreground flex items-center gap-1.5">
              <Building className="size-3 text-primary" /> Submitter Information
            </h4>
          </AccordionTrigger>
          <AccordionContent className="pb-2.5 pt-0">
            <div className="pt-1.5 font-sans text-xs">
              <MetaRow label="Organization" value={rec.center_name} />
              <MetaRow label="Submitter Acc" value={rec.submitter_acc} isMono />
            </div>
          </AccordionContent>
        </AccordionItem>
      )}
    </Accordion>
  )
}

function renderAccessions(rec: SraRecord, isAssembly: boolean) {
  return (
    <Accordion
      key={`${rec.accession}-identifiers`}
      multiple
      defaultValue={["accessions"]}
      className="space-y-2.5 text-xs"
    >
      <AccordionItem value="accessions" className="bg-card/50 border border-border/50 rounded-xl px-3 border-b-0">
        <AccordionTrigger className="py-2.5 hover:no-underline cursor-pointer">
          <h4 className="text-xs font-semibold text-foreground flex items-center gap-1.5">
            <Tag className="size-3 text-primary" /> Database Accessions
          </h4>
        </AccordionTrigger>
        <AccordionContent className="pb-2.5 pt-0">
          <div className="pt-1.5 font-mono tabular-nums text-xs">
            <MetaRow
              label={isAssembly ? "Assembly Accession" : "Run Accession"}
              value={rec.accession}
              isMono
              isPrimary
            />
            {!isAssembly && <MetaRow label="Experiment" value={rec.experiment_acc} isMono />}
            {!isAssembly && <MetaRow label="SRA Study" value={rec.study_id} isMono />}
            {isAssembly && <MetaRow label="Taxonomy ID" value={rec.study_id} isMono />}
            <MetaRow label="BioProject" value={rec.bioproject} isMono />
            <MetaRow label="BioSample" value={rec.biosample} isMono />
            {!isAssembly && <MetaRow label="Sample Acc" value={rec.sample_acc} isMono />}
          </div>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  )
}

function renderSraOverview(rec: SraRecord) {
  const hasSampleAttrs = hasValue(rec.cell_line) || hasValue(rec.source_name) || hasValue(rec.treatment) || hasValue(rec.antibody)
  const hasSubmitter = hasValue(rec.center_name) || hasValue(rec.submitter_acc)
  const hasProtocol = hasValue(rec.construction_protocol)

  return (
    <Accordion
      key={`${rec.accession}-sra-overview`}
      multiple
      defaultValue={["specs", "sample_attrs", "submitter", "protocol"]}
      className="space-y-2.5 text-xs"
    >
      {/* Sequencing & Platform Specs */}
      <AccordionItem value="specs" className="bg-card/50 border border-border/50 rounded-xl px-3 border-b-0">
        <AccordionTrigger className="py-2.5 hover:no-underline cursor-pointer">
          <h4 className="text-xs font-semibold text-foreground flex items-center gap-1.5">
            <Dna className="size-3 text-primary" /> Sequencing Specs
          </h4>
        </AccordionTrigger>
        <AccordionContent className="pb-2.5 pt-0">
          <div className="pt-1.5 font-sans text-xs">
            <MetaRow label="Instrument" value={rec.instrument_model || rec.platform} />
            <MetaRow label="Layout" value={rec.library_layout?.replace(/<|\/|>/g, "").trim()} />
            <MetaRow label="Strategy" value={rec.library_strategy} />
            <MetaRow label="Selection" value={rec.library_selection} />
            <MetaRow label="Source" value={rec.library_source} />
            <MetaRow label="Total Runs" value={rec.total_runs} isMono />
            <MetaRow label="Total Size" value={rec.total_size} isMono />
            <MetaRow label="Created Date" value={formatDateString(rec.release_date)} isMono />
          </div>
        </AccordionContent>
      </AccordionItem>

      {/* Biological Sample Attributes */}
      {hasSampleAttrs && (
        <AccordionItem value="sample_attrs" className="bg-card/50 border border-border/50 rounded-xl px-3 border-b-0">
          <AccordionTrigger className="py-2.5 hover:no-underline cursor-pointer">
            <h4 className="text-xs font-semibold text-foreground flex items-center gap-1.5">
              <FlaskConical className="size-3 text-primary" /> Sample Attributes
            </h4>
          </AccordionTrigger>
          <AccordionContent className="pb-2.5 pt-0">
            <div className="pt-1.5 font-sans text-xs">
              <MetaRow label="Source Name" value={rec.source_name} />
              <MetaRow label="Cell Line" value={rec.cell_line} />
              <MetaRow label="Treatment" value={rec.treatment} />
              <MetaRow label="Antibody" value={rec.antibody} />
            </div>
          </AccordionContent>
        </AccordionItem>
      )}

      {/* Submitter Information */}
      {hasSubmitter && (
        <AccordionItem value="submitter" className="bg-card/50 border border-border/50 rounded-xl px-3 border-b-0">
          <AccordionTrigger className="py-2.5 hover:no-underline cursor-pointer">
            <h4 className="text-xs font-semibold text-foreground flex items-center gap-1.5">
              <Building className="size-3 text-primary" /> Submitter Information
            </h4>
          </AccordionTrigger>
          <AccordionContent className="pb-2.5 pt-0">
            <div className="pt-1.5 font-sans text-xs">
              <MetaRow label="Center Name" value={rec.center_name} />
              <MetaRow label="Submitter Acc" value={rec.submitter_acc} isMono />
            </div>
          </AccordionContent>
        </AccordionItem>
      )}

      {/* Library Construction Protocol */}
      {hasProtocol && (
        <AccordionItem value="protocol" className="bg-card/50 border border-border/50 rounded-xl px-3 border-b-0">
          <AccordionTrigger className="py-2.5 hover:no-underline cursor-pointer">
            <h4 className="text-xs font-semibold text-foreground flex items-center gap-1.5">
              <FileText className="size-3 text-primary" /> Construction Protocol
            </h4>
          </AccordionTrigger>
          <AccordionContent className="pb-2.5 pt-0">
            <p className="text-xs text-muted-foreground leading-relaxed line-clamp-6 pt-1.5 border-t border-border/30">
              {rec.construction_protocol}
            </p>
          </AccordionContent>
        </AccordionItem>
      )}
    </Accordion>
  )
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
  const { theme } = useTheme()

  const isDark =
    theme === "dark" ||
    (theme === "system" &&
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches)
  const prismTheme = isDark ? themes.vsDark : themes.vsLight

  const rec = selectedRecord?.record
  const isAssembly = React.useMemo(() => {
    if (!rec) return false
    const db = selectedRecord?.db?.toLowerCase() || ""
    return db === "assembly" || db === "genome" || rec.accession.startsWith("GCF_") || rec.accession.startsWith("GCA_")
  }, [selectedRecord?.db, rec?.accession])

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
      role="complementary"
      aria-label="Sequence Inspector"
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
          {/* SRA / Assembly Record Selected */}
          {selectedRecord && rec ? (
            <div className="space-y-4">
              {/* Clean Hero Header */}
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <h2 className="text-base font-bold tracking-tight text-foreground truncate select-text" title={rec.accession}>
                      {rec.accession}
                    </h2>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger
                          type="button"
                          onClick={handleCopyAccession}
                          className="inline-flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
                          aria-label="Copy Accession"
                        >
                          {copiedAcc ? (
                            <Check className="size-3.5 text-success" />
                          ) : (
                            <Copy className="size-3.5" />
                          )}
                        </TooltipTrigger>
                        <TooltipContent side="top">
                          {copiedAcc ? "Copied!" : "Copy accession"}
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>

                  <Badge variant="secondary" className="text-xs uppercase font-medium shrink-0">
                    {selectedRecord.db}
                  </Badge>
                </div>

                {/* Subtitle / Description */}
                {rec.title && rec.title !== rec.accession && (
                  <p className="text-xs text-foreground font-medium leading-snug line-clamp-2" title={rec.title}>
                    {rec.title}
                  </p>
                )}

                {/* Clean Inline Metadata (Organism, Platform, Center) */}
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground pt-0.5">
                  {rec.organism && (
                    <span className="italic font-medium text-foreground/80">{rec.organism}</span>
                  )}
                  {rec.organism && (rec.platform || rec.library_strategy) && <span>•</span>}
                  {(rec.platform || rec.library_strategy) && (
                    <span>{rec.platform || rec.library_strategy}</span>
                  )}
                  {rec.center_name && (
                    <>
                      <span>•</span>
                      <span className="truncate max-w-[120px]" title={rec.center_name}>{rec.center_name}</span>
                    </>
                  )}
                </div>
              </div>

              {/* 2-Card KPI Metrics Grid */}
              <div className="grid grid-cols-2 gap-2">
                <div className="bg-card border border-border/60 rounded-xl p-2.5 space-y-0.5 shadow-xs">
                  <span className="text-xs font-medium text-muted-foreground block truncate">
                    {isAssembly ? "Category" : "Spot Count"}
                  </span>
                  <p className="text-sm font-bold font-mono tabular-nums tracking-tight text-foreground truncate">
                    {formatEmDash(rec.total_spots)}
                  </p>
                </div>
                <div className="bg-card border border-border/60 rounded-xl p-2.5 space-y-0.5 shadow-xs">
                  <span className="text-xs font-medium text-muted-foreground block truncate">
                    {isAssembly ? "Genome Size" : "Total Bases"}
                  </span>
                  <p className="text-sm font-bold font-mono tabular-nums tracking-tight text-foreground truncate">
                    {formatEmDash(rec.total_bases)}
                  </p>
                </div>
              </div>

              {/* Segmented View Switcher */}
              <div className="flex bg-muted/60 p-1 rounded-lg border border-border/40 text-xs">
                <button
                  onClick={() => setTab("overview")}
                  className={cn(
                    "flex-1 py-1 text-center font-medium rounded-md transition-all cursor-pointer",
                    tab === "overview" || (isAssembly && tab === "identifiers")
                      ? "bg-background text-foreground shadow-xs font-semibold"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  Overview
                </button>
                {!isAssembly && (
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
                )}
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
            {(tab === "overview" || (isAssembly && tab === "identifiers")) &&
              (isAssembly ? renderAssemblyOverview(rec) : renderSraOverview(rec))}

            {/* Tab 2: Accessions (SRA only) */}
            {!isAssembly && tab === "identifiers" && renderAccessions(rec, false)}

            {/* Tab 3: Raw XML */}
            {tab === "xml" && (
              <div className="space-y-2">
                {rec.expxml ? (
                  <div className="rounded-xl border border-border/80 bg-card overflow-hidden shadow-xs">
                    <div className="flex items-center justify-between px-3 py-1.5 border-b border-border/60 bg-muted/40 backdrop-blur-xs">
                      <div className="flex items-center gap-1.5">
                        <FileCode className="size-3 text-primary" />
                        <span className="text-[11px] font-mono font-medium text-foreground">
                          payload.xml
                        </span>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        onClick={handleCopyXml}
                        className="h-6 w-6 cursor-pointer hover:bg-muted"
                        title="Copy XML"
                      >
                        {copied ? <Check className="size-3.5 text-emerald-500" /> : <Copy className="size-3.5" />}
                      </Button>
                    </div>
                    <div className="p-3 max-h-[460px] overflow-auto bg-muted/10 text-xs">
                      <Highlight theme={prismTheme} code={prettifiedXml.trim()} language="xml">
                        {({ style, tokens, getLineProps, getTokenProps }) => (
                          <pre
                            className="font-mono text-xs font-normal leading-relaxed select-text whitespace-pre-wrap break-words"
                            style={{
                              ...style,
                              backgroundColor: "transparent",
                            }}
                          >
                            {tokens.map((line, i) => (
                              <div key={i} {...getLineProps({ line })}>
                                {line.map((token, key) => (
                                  <span key={key} {...getTokenProps({ token })} />
                                ))}
                              </div>
                            ))}
                          </pre>
                        )}
                      </Highlight>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-6">No raw XML available for this record.</p>
                )}
              </div>
            )}
          </div>
        ) : selectedNode ? (
          /* Workflow Canvas Node Selected */
          <div className="space-y-4">
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground font-medium">NODE ID: #{selectedNode.id}</span>
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
              <p className="text-sm text-muted-foreground">{selectedNode.data.category}</p>
            </div>

            <Card className="bg-card/50">
              <CardHeader className="p-3 pb-1">
                <CardTitle className="flex items-center gap-1.5">
                  <Cpu className="size-3.5 text-primary" /> Compute Resources
                </CardTitle>
              </CardHeader>
              <CardContent className="p-3 pt-2 space-y-3">
                <div className="space-y-1">
                  <label className="text-sm text-muted-foreground font-medium">Allocated Threads</label>
                  <Input type="number" defaultValue={selectedNode.data.threads} />
                </div>
                <div className="space-y-1">
                  <label className="text-sm text-muted-foreground font-medium">Memory Allocation</label>
                  <Input defaultValue={selectedNode.data.mem} />
                </div>
              </CardContent>
            </Card>

            <Card className="bg-card/50">
              <CardHeader className="p-3 pb-1">
                <CardTitle className="flex items-center gap-1.5">
                  <FileCode className="size-3.5 text-primary" /> Parameters & Flags
                </CardTitle>
              </CardHeader>
              <CardContent className="p-3 pt-2 space-y-3">
                <div className="space-y-1">
                  <label className="text-sm text-muted-foreground font-medium">Min Quality Score (-q)</label>
                  <Input defaultValue="30" />
                </div>
                <div className="space-y-1">
                  <label className="text-sm text-muted-foreground font-medium">Genome Reference</label>
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
              <p className="text-sm text-muted-foreground">
                Click any search result row in Explore or a node in the Workflow canvas to inspect live metadata.
              </p>
            </div>

            <Card className="bg-card/50">
              <CardHeader className="p-3 pb-1">
                <CardTitle className="flex items-center gap-1.5">
                  <Info className="size-3.5 text-primary" /> Engine Status
                </CardTitle>
              </CardHeader>
              <CardContent className="p-3 pt-2 space-y-2 text-sm">
                <div className="flex justify-between py-1 border-b border-border/50">
                  <span className="text-muted-foreground">Engine Mode</span>
                  <span className="font-medium">VortexFlow Rust Core</span>
                </div>
                <div className="flex justify-between py-1 border-b border-border/50">
                  <span className="text-muted-foreground">Entrez EFetch</span>
                  <span className="font-medium text-success">Connected (XML)</span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="text-muted-foreground">Logging Stream</span>
                  <span className="font-medium text-success">Active (SSE)</span>
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
