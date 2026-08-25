import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { Cpu, HardDrive, Save, Sun, Moon, Laptop } from "lucide-react"
import { useTheme } from "@/components/theme-provider"

export function SettingsView() {
  const { theme, setTheme } = useTheme()

  return (
    <div className="p-6 space-y-6 max-w-4xl mx-auto w-full">
      <div>
        <h2 className="text-xl font-bold tracking-tight">VortexFlow Settings</h2>
        <p className="text-xs text-muted-foreground">
          Configure engine compute limits, interface theme, tool binary paths, and environment defaults
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
            <p className="text-xs text-muted-foreground">
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

        {/* Compute Allocations */}
        <div className="space-y-3">
          <div className="space-y-1">
            <h3 className="text-base font-semibold flex items-center gap-2">
              <Cpu className="size-4 text-primary" /> Compute & Thread Allocations
            </h3>
            <p className="text-xs text-muted-foreground">Configure global hardware thread utilization limit</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-xs font-medium">Max Parallel CPU Threads</label>
              <Input type="number" defaultValue="32" />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium">Max RAM Budget (GB)</label>
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
            <p className="text-xs text-muted-foreground">Paths to underlying CLI binaries (BWA, GATK, Samtools, FastQC)</p>
          </div>

          <div className="space-y-3">
            <div className="space-y-1">
              <label className="text-xs font-medium">Samtools Binary Path</label>
              <Input defaultValue="/usr/local/bin/samtools" />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium">BWA-MEM2 Binary Path</label>
              <Input defaultValue="/usr/local/bin/bwa-mem2" />
            </div>
          </div>
        </div>

        <div className="pt-2 flex justify-end">
          <Button size="sm">
            <Save className="size-4 mr-2" />
            Save Configuration
          </Button>
        </div>
      </Card>
    </div>
  )
}
