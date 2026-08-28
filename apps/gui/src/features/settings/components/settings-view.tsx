import * as React from "react"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs"
import { WorkflowNumberInput } from "@/features/workflows/components/workflow-number-input"
import {
  Sun,
  Moon,
  Laptop,
  Folder,
  FolderOpen,
  Cpu,
  HardDrive,
  ShieldCheck,
  Zap,
  Terminal,
  Layers,
} from "lucide-react"
import { useTheme } from "@/components/layout/theme-provider"
import { toast } from "sonner"

export function SettingsView() {
  const { theme, setTheme } = useTheme()
  const [downloadPath, setDownloadPath] = React.useState(() => {
    return localStorage.getItem("vortexflow_download_path") || "~/.vortexflow/downloads"
  })
  const [scratchPath, setScratchPath] = React.useState(() => {
    return localStorage.getItem("vortexflow_scratch_path") || "/tmp/vortexflow"
  })
  const [maxThreads, setMaxThreads] = React.useState(() => {
    return parseInt(localStorage.getItem("vortexflow_max_threads") || "32", 10)
  })
  const [maxMemory, setMaxMemory] = React.useState(() => {
    return parseInt(localStorage.getItem("vortexflow_max_memory") || "64", 10)
  })

  const handleSave = () => {
    localStorage.setItem("vortexflow_download_path", downloadPath)
    localStorage.setItem("vortexflow_scratch_path", scratchPath)
    localStorage.setItem("vortexflow_max_threads", String(maxThreads))
    localStorage.setItem("vortexflow_max_memory", String(maxMemory))
    toast.success("Settings saved successfully")
  }

  const handleBrowseFolder = async (setter: (val: string) => void) => {
    if (typeof window !== "undefined" && (window as any).electron?.showOpenDialog) {
      try {
        const result = await (window as any).electron.showOpenDialog({
          properties: ["openDirectory"],
        })
        if (!result.canceled && result.filePaths?.length > 0) {
          setter(result.filePaths[0])
        }
      } catch (e) {
        console.error("Error opening directory dialog:", e)
      }
    }
  }

  return (
    <div className="p-8 max-w-5xl mx-auto w-full space-y-6">
      {/* Settings Header */}
      <div>
        <h2 className="text-xl font-bold tracking-tight text-foreground">
          Settings & Preferences
        </h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          Manage your runtime engine, storage paths, hardware compute limits, and interface theme
        </p>
      </div>

      {/* ReUI c-tabs-4 Pattern: Vertical Tabs with Line Indicator */}
      <Tabs defaultValue="general" orientation="vertical" className="w-full gap-8 items-start">
        {/* Left Vertical Tab Navigation */}
        <TabsList variant="line" className="w-56 shrink-0 flex-col items-stretch gap-1">
          <TabsTrigger value="general">
            <Sun className="size-4 shrink-0 text-primary dark:hidden" />
            <Moon className="size-4 shrink-0 text-primary hidden dark:block" />
            <span>Appearance & Theme</span>
          </TabsTrigger>

          <TabsTrigger value="storage">
            <Folder className="size-4 shrink-0 text-primary" />
            <span>Storage & Paths</span>
          </TabsTrigger>

          <TabsTrigger value="compute">
            <Cpu className="size-4 shrink-0 text-primary" />
            <span>Compute & Hardware</span>
          </TabsTrigger>

          <TabsTrigger value="tools">
            <HardDrive className="size-4 shrink-0 text-primary" />
            <span>Executable Tools</span>
          </TabsTrigger>

          <TabsTrigger value="system">
            <Layers className="size-4 shrink-0 text-primary" />
            <span>Engine & About</span>
          </TabsTrigger>
        </TabsList>

        {/* Right Content Panels */}
        <div className="flex-1 w-full min-w-0">
          {/* 1. General & Theme */}
          <TabsContent value="general" className="mt-0">
            <Card className="shadow-xs bg-card border-border/80">
              <CardHeader className="pb-4">
                <CardTitle className="text-base font-semibold">Appearance & Theme</CardTitle>
                <CardDescription className="text-xs">
                  Customize the interface theme and visual mode of the VortexFlow application.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-3">
                  <Label className="text-xs font-medium text-foreground/90">
                    Interface Theme Mode
                  </Label>
                  <div className="grid grid-cols-3 gap-3 max-w-md">
                    <Button
                      type="button"
                      variant={theme === "light" ? "default" : "outline"}
                      className="flex flex-col items-center gap-2 h-auto py-3.5 justify-center cursor-pointer rounded-xl border-border/80"
                      onClick={() => setTheme("light")}
                    >
                      <Sun className="size-4" />
                      <span className="text-xs font-medium">Light</span>
                    </Button>

                    <Button
                      type="button"
                      variant={theme === "dark" ? "default" : "outline"}
                      className="flex flex-col items-center gap-2 h-auto py-3.5 justify-center cursor-pointer rounded-xl border-border/80"
                      onClick={() => setTheme("dark")}
                    >
                      <Moon className="size-4" />
                      <span className="text-xs font-medium">Dark</span>
                    </Button>

                    <Button
                      type="button"
                      variant={theme === "system" ? "default" : "outline"}
                      className="flex flex-col items-center gap-2 h-auto py-3.5 justify-center cursor-pointer rounded-xl border-border/80"
                      onClick={() => setTheme("system")}
                    >
                      <Laptop className="size-4" />
                      <span className="text-xs font-medium">System</span>
                    </Button>
                  </div>
                  <p className="text-[11px] text-muted-foreground pt-1">
                    Theme changes are applied instantly across all views and canvas nodes.
                  </p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* 2. Storage & Paths */}
          <TabsContent value="storage" className="mt-0">
            <Card className="shadow-xs bg-card border-border/80">
              <CardHeader className="pb-4">
                <CardTitle className="text-base font-semibold">Storage & Paths</CardTitle>
                <CardDescription className="text-xs">
                  Configure local filesystem directories for datasets, downloads, and temporary execution scratch.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="space-y-2">
                  <Label htmlFor="download-dir" className="text-xs font-medium">
                    Download Destination Directory
                  </Label>
                  <div className="flex gap-2">
                    <Input
                      id="download-dir"
                      value={downloadPath}
                      onChange={(e) => setDownloadPath(e.target.value)}
                      placeholder="~/.vortexflow/downloads"
                      className="font-mono text-xs flex-1 h-9 rounded-lg"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => handleBrowseFolder(setDownloadPath)}
                      className="shrink-0 h-9 gap-1.5 cursor-pointer"
                    >
                      <FolderOpen className="size-3.5" />
                      Browse
                    </Button>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Where SRA fastq reads, genomic assemblies, and reference databases are saved.
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="scratch-dir" className="text-xs font-medium">
                    Temporary Scratch Directory
                  </Label>
                  <div className="flex gap-2">
                    <Input
                      id="scratch-dir"
                      value={scratchPath}
                      onChange={(e) => setScratchPath(e.target.value)}
                      placeholder="/tmp/vortexflow"
                      className="font-mono text-xs flex-1 h-9 rounded-lg"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => handleBrowseFolder(setScratchPath)}
                      className="shrink-0 h-9 gap-1.5 cursor-pointer"
                    >
                      <FolderOpen className="size-3.5" />
                      Browse
                    </Button>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    High-speed disk space utilized by active pipeline subprocesses during analysis.
                  </p>
                </div>
              </CardContent>
              <CardFooter className="pt-2 border-t border-border/60 justify-end">
                <Button size="sm" onClick={handleSave} className="cursor-pointer">
                  Save Changes
                </Button>
              </CardFooter>
            </Card>
          </TabsContent>

          {/* 3. Compute Resources */}
          <TabsContent value="compute" className="mt-0">
            <Card className="shadow-xs bg-card border-border/80">
              <CardHeader className="pb-4">
                <CardTitle className="text-base font-semibold">Compute & Hardware Allocations</CardTitle>
                <CardDescription className="text-xs">
                  Set thread utilization caps and memory budgets to prevent system lockups during large runs.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  <div className="space-y-2">
                    <Label className="text-xs font-medium">Max Parallel CPU Threads</Label>
                    <WorkflowNumberInput
                      value={maxThreads}
                      min={1}
                      max={128}
                      step={1}
                      onChange={setMaxThreads}
                      placeholder="32"
                    />
                    <p className="text-[11px] text-muted-foreground">
                      Maximum threads allocated across simultaneous node executions.
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-xs font-medium">Max RAM Budget (GB)</Label>
                    <WorkflowNumberInput
                      value={maxMemory}
                      min={4}
                      max={512}
                      step={4}
                      onChange={setMaxMemory}
                      placeholder="64"
                    />
                    <p className="text-[11px] text-muted-foreground">
                      Upper RAM allocation ceiling for memory-heavy aligners and assemblers.
                    </p>
                  </div>
                </div>
              </CardContent>
              <CardFooter className="pt-2 border-t border-border/60 justify-end">
                <Button size="sm" onClick={handleSave} className="cursor-pointer">
                  Save Changes
                </Button>
              </CardFooter>
            </Card>
          </TabsContent>

          {/* 4. Executable Tools */}
          <TabsContent value="tools" className="mt-0">
            <Card className="shadow-xs bg-card border-border/80">
              <CardHeader className="pb-4">
                <CardTitle className="text-base font-semibold">Executable Tool Environments</CardTitle>
                <CardDescription className="text-xs">
                  Active binary paths discovered in your local environment and extension directories.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="rounded-lg border border-border/70 p-3 space-y-3 bg-muted/20">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Terminal className="size-4 text-primary" />
                      <span className="text-xs font-semibold text-foreground">ResFinder v4.4.2</span>
                    </div>
                    <Badge variant="outline" className="text-[10px] text-emerald-500 border-emerald-500/30">
                      Installed
                    </Badge>
                  </div>
                  <p className="font-mono text-xs text-muted-foreground bg-background px-2.5 py-1.5 rounded border border-border/60">
                    run_resfinder.py (PointFinder + ResFinder DB v2.0)
                  </p>
                </div>

                <div className="rounded-lg border border-border/70 p-3 space-y-3 bg-muted/20">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Terminal className="size-4 text-muted-foreground" />
                      <span className="text-xs font-semibold text-foreground">FastQC Read Quality</span>
                    </div>
                    <Badge variant="outline" className="text-[10px] text-muted-foreground">
                      Ready
                    </Badge>
                  </div>
                  <p className="font-mono text-xs text-muted-foreground bg-background px-2.5 py-1.5 rounded border border-border/60">
                    /usr/local/bin/fastqc
                  </p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* 5. Engine & About */}
          <TabsContent value="system" className="mt-0">
            <Card className="shadow-xs bg-card border-border/80">
              <CardHeader className="pb-4">
                <CardTitle className="text-base font-semibold">System & Architecture</CardTitle>
                <CardDescription className="text-xs">
                  Technical specifications and runtime diagnostics for VortexFlow.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div className="p-3 rounded-lg border border-border/60 bg-muted/20 space-y-1">
                    <span className="text-muted-foreground text-[11px]">Core Architecture</span>
                    <div className="font-semibold text-foreground flex items-center gap-1.5">
                      <Zap className="size-3.5 text-amber-500" />
                      Rust Native Multi-Threaded Engine
                    </div>
                  </div>

                  <div className="p-3 rounded-lg border border-border/60 bg-muted/20 space-y-1">
                    <span className="text-muted-foreground text-[11px]">Database Layer</span>
                    <div className="font-semibold text-foreground flex items-center gap-1.5">
                      <ShieldCheck className="size-3.5 text-emerald-500" />
                      SQLite WAL Persistent Store
                    </div>
                  </div>

                  <div className="p-3 rounded-lg border border-border/60 bg-muted/20 space-y-1">
                    <span className="text-muted-foreground text-[11px]">VortexFlow Version</span>
                    <div className="font-semibold text-foreground">v2.4.0 Pro</div>
                  </div>

                  <div className="p-3 rounded-lg border border-border/60 bg-muted/20 space-y-1">
                    <span className="text-muted-foreground text-[11px]">API Host</span>
                    <div className="font-mono font-medium text-foreground">http://127.0.0.1:8080</div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </div>
      </Tabs>
    </div>
  )
}
