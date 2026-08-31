import * as React from "react"
import { Search, Blocks, CheckCircle2, Download, Terminal, Database, Loader2, Copy, Check, Trash2, RotateCw } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { toast } from "sonner"
import { extensionService } from "../services/extension-service"
import type { ExtensionItem } from "../types"

export function ExtensionsView() {
  const [extensions, setExtensions] = React.useState<ExtensionItem[]>([])
  const [searchQuery, setSearchQuery] = React.useState("")
  const [selectedCategory, setSelectedCategory] = React.useState<string>("all")
  const [installingIds, setInstallingIds] = React.useState<Set<string>>(new Set())
  const [uninstallingIds, setUninstallingIds] = React.useState<Set<string>>(new Set())
  const [sessionActiveIds, setSessionActiveIds] = React.useState<Set<string>>(new Set())
  const [isRefreshing, setIsRefreshing] = React.useState(false)

  // Log Console Dialog State
  const [logDialogOpen, setLogDialogOpen] = React.useState(false)
  const [activeToolId, setActiveToolId] = React.useState<string | null>(null)
  const [activeToolName, setActiveToolName] = React.useState<string>("")
  const [liveLogs, setLiveLogs] = React.useState<string[]>([])
  const [hasCopied, setHasCopied] = React.useState(false)
  const logScrollRef = React.useRef<HTMLDivElement>(null)

  const loadExtensions = React.useCallback(async () => {
    const list = await extensionService.getExtensions()
    setExtensions(list)
  }, [])

  React.useEffect(() => {
    loadExtensions()
  }, [loadExtensions])

  const handleRefresh = async () => {
    setIsRefreshing(true)
    await loadExtensions()
    setIsRefreshing(false)
    toast.success("Extensions refreshed")
  }

  // Poll logs if console dialog is open
  React.useEffect(() => {
    if (!logDialogOpen || !activeToolId) return

    let isMounted = true
    const fetchLogs = async () => {
      const res = await extensionService.getLogs(activeToolId)
      if (isMounted) {
        setLiveLogs(res.logs)
      }
    }

    fetchLogs()
    const interval = setInterval(fetchLogs, 1500)
    return () => {
      isMounted = false
      clearInterval(interval)
    }
  }, [logDialogOpen, activeToolId])

  // Auto-scroll logs to bottom
  React.useEffect(() => {
    if (logScrollRef.current) {
      logScrollRef.current.scrollTop = logScrollRef.current.scrollHeight
    }
  }, [liveLogs])

  const openLogConsole = (toolId: string, toolName: string) => {
    setActiveToolId(toolId)
    setActiveToolName(toolName)
    setLogDialogOpen(true)
  }

  const handleCopyLogs = () => {
    navigator.clipboard.writeText(liveLogs.join("\n"))
    setHasCopied(true)
    setTimeout(() => setHasCopied(false), 2000)
    toast.success("Logs copied")
  }

  const categories = React.useMemo(() => {
    const cats = new Set<string>()
    extensions.forEach((e) => {
      if (e.manifest.category) cats.add(e.manifest.category)
    })
    const sortedCats = Array.from(cats).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }))
    return ["all", ...sortedCats]
  }, [extensions])

  const filteredExtensions = React.useMemo(() => {
    return extensions
      .filter((ext) => {
        const m = ext.manifest
        const matchCat = selectedCategory === "all" || m.category.toLowerCase() === selectedCategory.toLowerCase()
        const query = searchQuery.toLowerCase()
        const matchQuery =
          !query ||
          m.name.toLowerCase().includes(query) ||
          m.id.toLowerCase().includes(query) ||
          m.description.toLowerCase().includes(query)
        return matchCat && matchQuery
      })
      .sort((a, b) => (a.manifest.name || "").localeCompare(b.manifest.name || "", undefined, { sensitivity: "base" }))
  }, [extensions, selectedCategory, searchQuery])

  const handleInstall = async (toolId: string, toolName: string) => {
    setInstallingIds((prev) => new Set(prev).add(toolId))
    setSessionActiveIds((prev) => new Set(prev).add(toolId))
    openLogConsole(toolId, toolName)
    toast.info(`Installing ${toolName}`)

    const started = await extensionService.installExtension(toolId)
    if (!started) {
      toast.error(`Install failed for ${toolName}`)
      setInstallingIds((prev) => {
        const next = new Set(prev)
        next.delete(toolId)
        return next
      })
      return
    }

    // Poll status until ready
    let attempts = 0
    const interval = setInterval(async () => {
      attempts++
      const isReady = await extensionService.getExtensionStatus(toolId)
      if (isReady || attempts > 120) {
        clearInterval(interval)
        setInstallingIds((prev) => {
          const next = new Set(prev)
          next.delete(toolId)
          return next
        })
        if (isReady) {
          toast.success(`Installed ${toolName}`)
          loadExtensions()
        }
      }
    }, 2000)
  }

  const handleUninstall = async (toolId: string, toolName: string) => {
    setUninstallingIds((prev) => new Set(prev).add(toolId))
    setSessionActiveIds((prev) => new Set(prev).add(toolId))
    toast.info(`Uninstalling ${toolName}`)

    const success = await extensionService.uninstallExtension(toolId)
    setUninstallingIds((prev) => {
      const next = new Set(prev)
      next.delete(toolId)
      return next
    })

    if (success) {
      toast.success(`Uninstalled ${toolName}`)
      loadExtensions()
    } else {
      toast.error(`Uninstall failed`)
    }
  }

  return (
    <div className="flex flex-col w-full h-full bg-background overflow-y-auto">
      {/* Top Header */}
      <div className="p-6 border-b border-border/60 bg-card/40 backdrop-blur-md flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="size-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
              <Blocks className="size-5" />
            </div>
            <div>
              <h1 className="text-lg font-semibold tracking-tight text-foreground">Extensions & Tool Registry</h1>
              <p className="text-xs text-muted-foreground">
                Browse and provision isolated bioinformatics tools loaded from <code className="text-primary font-mono text-[11px]">./manifests/</code> into <code className="text-muted-foreground font-mono text-[11px]">~/.vortexflow/</code>
              </p>
            </div>
          </div>

          <Badge variant="outline" className="text-xs py-1 px-2.5">
            {extensions.length} Tools Discovered
          </Badge>
        </div>

        {/* Filter Controls */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
          {/* Search bar & Refresh Button */}
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <div className="relative w-full sm:w-80">
              <Search className="absolute left-2.5 top-2.5 size-3.5 text-muted-foreground" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search extensions (e.g. resfinder, fastqc)..."
                className="h-8 pl-8 text-xs"
              />
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={handleRefresh}
              disabled={isRefreshing}
              className="h-8 px-2.5 gap-1.5 text-xs font-normal cursor-pointer shrink-0"
              title="Reload extension manifests"
            >
              <RotateCw className={`size-3.5 ${isRefreshing ? "animate-spin text-primary" : "text-muted-foreground"}`} />
              <span>Refresh</span>
            </Button>
          </div>

          {/* Categories Filter Tabs */}
          <div className="flex items-center gap-1.5 overflow-x-auto w-full sm:w-auto pb-1 sm:pb-0">
            {categories.map((cat) => (
              <Button
                key={cat}
                variant={selectedCategory === cat ? "default" : "outline"}
                size="sm"
                onClick={() => setSelectedCategory(cat)}
                className="h-7 text-xs capitalize cursor-pointer rounded-lg font-normal"
              >
                {cat}
              </Button>
            ))}
          </div>
        </div>
      </div>

      {/* Main Grid Content */}
      <div className="p-6 flex-1">
        {filteredExtensions.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-12 text-center border border-dashed rounded-xl">
            <Blocks className="size-10 text-muted-foreground/50 mb-3" />
            <h3 className="text-sm font-medium text-foreground">No extensions found</h3>
            <p className="text-xs text-muted-foreground mt-1 max-w-sm">
              Add new declarative extension manifest JSON files to <code className="text-primary font-mono text-[11px]">./manifests/</code> to register new bioinformatics tools.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {filteredExtensions.map(({ manifest, isInstalled }) => {
              const isInstalling = installingIds.has(manifest.id)
              const isUninstalling = uninstallingIds.has(manifest.id)
              const showLogsButton = isInstalling || sessionActiveIds.has(manifest.id)

              return (
                <Card
                  key={manifest.id}
                  className="flex flex-col justify-between select-none shadow-md hover:shadow-lg transition-all border-border/80 bg-card overflow-hidden"
                >
                  <div>
                    <CardHeader className="pb-3 border-b bg-muted/40">
                      <div className="flex items-start justify-between gap-2">
                        <CardTitle className="text-sm font-semibold tracking-tight text-foreground">
                          {manifest.name}
                        </CardTitle>
                        <Badge variant="secondary" className="text-[10px] shrink-0 font-medium">
                          v{manifest.version}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-2 pt-1">
                        <Badge variant="outline" className="text-[10px] uppercase py-0 h-4 font-normal">
                          {manifest.category}
                        </Badge>
                        <span className="text-[11px] text-muted-foreground truncate">
                          ID: {manifest.id}
                        </span>
                      </div>
                    </CardHeader>

                    <CardContent className="pt-3.5 pb-2 text-xs flex flex-col gap-3">
                      <p className="text-muted-foreground leading-relaxed line-clamp-3">
                        {manifest.description}
                      </p>

                      {/* Sockets & Execution summary */}
                      <div className="flex flex-col gap-1.5 p-2 rounded-lg bg-muted/30 border border-border/60 text-[11px]">
                        {manifest.nodes && manifest.nodes.length > 0 ? (
                          <div className="flex items-center justify-between text-muted-foreground">
                            <span>Extension Suite:</span>
                            <span className="text-foreground font-medium">{manifest.nodes.length} Nodes</span>
                          </div>
                        ) : (
                          <>
                            <div className="flex items-center justify-between text-muted-foreground">
                              <span>Inputs:</span>
                              <span className="text-foreground font-medium">{(manifest.inputs || []).length} Sockets</span>
                            </div>
                            <div className="flex items-center justify-between text-muted-foreground">
                              <span>Outputs:</span>
                              <span className="text-foreground font-medium">{(manifest.outputs || []).length} Sockets</span>
                            </div>
                          </>
                        )}
                        <div className="flex items-center justify-between text-muted-foreground">
                          <span>Environment:</span>
                          <span className="text-foreground font-medium truncate max-w-[150px]">
                            {manifest.install?.packages?.[0] || manifest.execution?.executable_name || "CLI"}
                          </span>
                        </div>
                      </div>

                      {/* Databases if any */}
                      {Boolean(manifest.databases && manifest.databases.length > 0) && (
                        <div className="flex items-center gap-1.5 text-muted-foreground text-[11px]">
                          <Database className="size-3 text-primary" />
                          <span>Requires {manifest.databases?.length} Companion Databases</span>
                        </div>
                      )}
                    </CardContent>
                  </div>

                  <CardFooter className="pt-2 pb-3 px-4 border-t bg-muted/30 flex items-center justify-between">
                    <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                      {manifest.install?.type === "core" ? (
                        <>
                          <CheckCircle2 className="size-3.5 text-primary" />
                          <span className="text-primary font-medium">Built-in</span>
                        </>
                      ) : isInstalled ? (
                        <>
                          <CheckCircle2 className="size-3.5 text-emerald-500" />
                          <span className="text-emerald-500 font-medium">Installed & Ready</span>
                        </>
                      ) : isInstalling ? (
                        <>
                          <Loader2 className="size-3.5 text-primary animate-spin" />
                          <span className="text-primary font-medium">Provisioning...</span>
                        </>
                      ) : (
                        <>
                          <span className="text-muted-foreground">Not installed</span>
                        </>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      {showLogsButton && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 text-xs gap-1.5 cursor-pointer px-2 text-muted-foreground hover:text-foreground font-normal"
                          onClick={() => openLogConsole(manifest.id, manifest.name)}
                          title="View Installation Logs"
                        >
                          <Terminal className="size-3" />
                          Logs
                        </Button>
                      )}

                      {manifest.install?.type !== "core" && (
                        isInstalled ? (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={isUninstalling}
                            className="h-7 text-xs gap-1.5 cursor-pointer text-destructive/80 hover:text-destructive hover:bg-destructive/10 border-destructive/20 hover:border-destructive/30 transition-colors font-normal"
                            onClick={() => handleUninstall(manifest.id, manifest.name)}
                            title="Uninstall extension environment"
                          >
                            {isUninstalling ? (
                              <>
                                <Loader2 className="size-3 animate-spin text-destructive" />
                                <span>Uninstalling...</span>
                              </>
                            ) : (
                              <>
                                <Trash2 className="size-3" />
                                <span>Uninstall</span>
                              </>
                            )}
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            variant="default"
                            disabled={isInstalling}
                            className="h-7 text-xs gap-1.5 cursor-pointer font-normal"
                            onClick={() => handleInstall(manifest.id, manifest.name)}
                          >
                            {isInstalling ? (
                              <>
                                <Loader2 className="size-3 animate-spin" />
                                <span>Installing...</span>
                              </>
                            ) : (
                              <>
                                <Download className="size-3" />
                                <span>Install Tool</span>
                              </>
                            )}
                          </Button>
                        )
                      )}
                    </div>
                  </CardFooter>
                </Card>
              )
            })}
          </div>
        )}
      </div>

      {/* Live Installation Console Dialog */}
      <Dialog open={logDialogOpen} onOpenChange={setLogDialogOpen}>
        <DialogContent className="max-w-2xl bg-zinc-950 text-zinc-100 border-zinc-800 p-0 overflow-hidden shadow-2xl">
          <DialogHeader className="p-4 border-b border-zinc-800 bg-zinc-900/80 flex flex-row items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="size-7 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
                <Terminal className="size-3.5" />
              </div>
              <DialogTitle className="text-sm font-semibold text-zinc-100">
                {activeToolName} - Installation Console
              </DialogTitle>
            </div>

            <div className="flex items-center mr-8">
              <Button
                size="sm"
                variant="ghost"
                className="h-7 text-xs gap-1.5 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 font-normal cursor-pointer"
                onClick={handleCopyLogs}
              >
                {hasCopied ? <Check className="size-3 text-emerald-400" /> : <Copy className="size-3" />}
                <span>{hasCopied ? "Copied" : "Copy"}</span>
              </Button>
            </div>
          </DialogHeader>

          {/* Terminal Body */}
          <div
            ref={logScrollRef}
            className="p-4 h-80 overflow-y-auto font-mono text-xs text-emerald-400 leading-relaxed bg-zinc-950 flex flex-col gap-1 select-text"
          >
            {liveLogs.length === 0 ? (
              <div className="flex items-center gap-2 text-zinc-500 italic py-6 justify-center">
                <Loader2 className="size-4 animate-spin text-zinc-600" />
                <span>Waiting for installation logs...</span>
              </div>
            ) : (
              liveLogs.map((log, index) => {
                const isErr = log.toLowerCase().includes("error") || log.toLowerCase().includes("failed") || log.toLowerCase().includes("warning")
                const isNotice = log.toLowerCase().includes("cloning") || log.toLowerCase().includes("solving") || log.toLowerCase().includes("using")
                const isSuccess = log.toLowerCase().includes("success") || log.toLowerCase().includes("ready") || log.toLowerCase().includes("complete")

                return (
                  <div
                    key={index}
                    className={`break-all ${
                      isErr
                        ? "text-rose-400"
                        : isSuccess
                        ? "text-emerald-300 font-semibold"
                        : isNotice
                        ? "text-cyan-300"
                        : "text-zinc-300"
                    }`}
                  >
                    {log}
                  </div>
                )
              })
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
