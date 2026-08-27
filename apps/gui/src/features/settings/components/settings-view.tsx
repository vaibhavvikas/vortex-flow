import * as React from "react"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { Cpu, HardDrive, Save, Sun, Moon, Laptop, Folder, FolderOpen, Check } from "lucide-react"
import { useTheme } from "@/components/layout/theme-provider"

export function SettingsView() {
  const { theme, setTheme } = useTheme()
  const [downloadPath, setDownloadPath] = React.useState(() => {
    return localStorage.getItem("vortexflow_download_path") || "~/.vortexflow/downloads"
  })
  const [saved, setSaved] = React.useState(false)

  const handleSave = () => {
    localStorage.setItem("vortexflow_download_path", downloadPath)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const handleBrowseFolder = async () => {
    if (typeof window !== "undefined" && (window as any).electron?.showOpenDialog) {
      try {
        const result = await (window as any).electron.showOpenDialog({ properties: ["openDirectory"] })
        if (!result.canceled && result.filePaths?.length > 0) {
          setDownloadPath(result.filePaths[0])
        }
      } catch (e) {
        console.error("Error opening directory dialog:", e)
      }
    }
  }

  return (
    <div className="p-6 space-y-6 max-w-4xl mx-auto w-full">
      <div>
        <h2 className="text-xl font-bold tracking-tight">VortexFlow Settings</h2>
        <p className="text-sm text-muted-foreground">
          Configure engine compute limits, interface theme, download directories, and environment defaults
        </p>
      </div>

      <Card className="bg-card space-y-6 p-6">
        {/* Appearance & Theme Section */}
        <div className="space-y-3">
          <div className="space-y-1">
            <h3 className="text-base font-semibold flex items-center gap-2">
              <Sun className="size-4 text-primary dark:hidden" />
              <Moon className="size-4 text-primary hidden dark:block" />
              Appearance & Theme
            </h3>
            <p className="text-sm text-muted-foreground">
              Choose your preferred interface theme (Light, Dark, or System preference)
            </p>
          </div>

          <div className="grid grid-cols-3 gap-3 max-w-md">
            <Button
              variant={theme === "light" ? "default" : "outline"}
              className="flex flex-col items-center gap-1.5 h-auto py-3 justify-center"
              onClick={() => setTheme("light")}
            >
              <Sun className="size-4" />
              <span className="text-xs font-medium">Light</span>
            </Button>

            <Button
              variant={theme === "dark" ? "default" : "outline"}
              className="flex flex-col items-center gap-1.5 h-auto py-3 justify-center"
              onClick={() => setTheme("dark")}
            >
              <Moon className="size-4" />
              <span className="text-xs font-medium">Dark</span>
            </Button>

            <Button
              variant={theme === "system" ? "default" : "outline"}
              className="flex flex-col items-center gap-1.5 h-auto py-3 justify-center"
              onClick={() => setTheme("system")}
            >
              <Laptop className="size-4" />
              <span className="text-xs font-medium">System</span>
            </Button>
          </div>
        </div>

        <Separator />

        {/* Download Storage Location Section */}
        <div className="space-y-3">
          <div className="space-y-1">
            <h3 className="text-base font-semibold flex items-center gap-2">
              <Folder className="size-4 text-primary" /> Download Storage Location
            </h3>
            <p className="text-sm text-muted-foreground">
              Local filesystem directory where SRA runs, FASTQ reads, and dataset archives are downloaded
            </p>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Download Destination Path</label>
            <div className="flex gap-2">
              <Input
                value={downloadPath}
                onChange={(e) => setDownloadPath(e.target.value)}
                placeholder="~/.vortexflow/downloads"
                className="font-mono text-sm flex-1"
              />
              <Button variant="outline" size="sm" onClick={handleBrowseFolder} className="shrink-0">
                <FolderOpen className="size-4 mr-1.5" />
                Browse
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Default storage location: <code className="font-mono bg-muted px-1.5 py-0.5 rounded text-xs">~/.vortexflow/downloads</code>
            </p>
          </div>
        </div>

        <Separator />

        {/* Compute Allocations */}
        <div className="space-y-3">
          <div className="space-y-1">
            <h3 className="text-base font-semibold flex items-center gap-2">
              <Cpu className="size-4 text-primary" /> Compute & Thread Allocations
            </h3>
            <p className="text-sm text-muted-foreground">Configure global hardware thread utilization limit</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-sm font-medium">Max Parallel CPU Threads</label>
              <Input type="number" defaultValue="32" />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Max RAM Budget (GB)</label>
              <Input type="number" defaultValue="64" />
            </div>
          </div>
        </div>

        <Separator />

        {/* Executable Paths */}
        <div className="space-y-3">
          <div className="space-y-1">
            <h3 className="text-base font-semibold flex items-center gap-2">
              <HardDrive className="size-4 text-primary" /> Executable Tool Paths
            </h3>
            <p className="text-sm text-muted-foreground">Paths to underlying CLI binaries (BWA, GATK, Samtools, FastQC)</p>
          </div>

          <div className="space-y-3">
            <div className="space-y-1">
              <label className="text-sm font-medium">Samtools Binary Path</label>
              <Input defaultValue="/usr/local/bin/samtools" />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">BWA-MEM2 Binary Path</label>
              <Input defaultValue="/usr/local/bin/bwa-mem2" />
            </div>
          </div>
        </div>

        <div className="pt-2 flex justify-end">
          <Button size="sm" onClick={handleSave}>
            {saved ? <Check className="size-4 mr-2 text-emerald-500" /> : <Save className="size-4 mr-2" />}
            {saved ? "Saved Configuration" : "Save Configuration"}
          </Button>
        </div>
      </Card>
    </div>
  )
}
