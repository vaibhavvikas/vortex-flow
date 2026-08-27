import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Play, CheckCircle2, AlertTriangle, RefreshCw } from "lucide-react"

const runs = [
  { id: "RUN-1049", name: "WGS Variant Call NA12878", status: "Running", progress: "68%", duration: "12m 45s", date: "Today 09:40" },
  { id: "RUN-1048", name: "FastQC Preprocessing Cohort-A", status: "Completed", progress: "100%", duration: "04m 12s", date: "Today 08:15" },
  { id: "RUN-1047", name: "RNA-Seq Quantification Batch-2", status: "Completed", progress: "100%", duration: "18m 30s", date: "Yesterday" },
  { id: "RUN-1046", name: "Somatic Variant Calling Tumor-Normal", status: "Failed", progress: "42%", duration: "08m 05s", date: "Yesterday" },
]

export function RunsView() {
  return (
    <div className="flex w-full flex-col gap-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold tracking-tight">Pipeline Execution Runs</h2>
          <p className="text-sm text-muted-foreground">Monitor real-time engine jobs and execution history</p>
        </div>
        <Button size="sm">
          <Play className="size-4 mr-2" />
          Trigger New Run
        </Button>
      </div>

      <div className="flex flex-col gap-3">
        {runs.map((run) => (
          <Card key={run.id}>
            <CardHeader className="flex flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-primary/10 text-primary">
                  {run.status === "Running" ? (
                    <RefreshCw className="size-4 animate-spin text-primary" />
                  ) : run.status === "Completed" ? (
                    <CheckCircle2 className="size-4 text-success" />
                  ) : (
                    <AlertTriangle className="size-4 text-destructive" />
                  )}
                </div>
                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono tabular-nums font-medium text-muted-foreground">{run.id}</span>
                    <CardTitle className="text-base">{run.name}</CardTitle>
                  </div>
                  <CardDescription className="text-xs">{run.date} • Duration: {run.duration}</CardDescription>
                </div>
              </div>

              <div className="flex items-center gap-4">
                <div className="text-right">
                  <Badge
                    variant={
                      run.status === "Completed"
                        ? "default"
                        : run.status === "Running"
                        ? "secondary"
                        : "destructive"
                    }
                    className="tabular-nums font-medium text-xs"
                  >
                    {run.status} ({run.progress})
                  </Badge>
                </div>
                <Button variant="outline" size="sm">
                  View Logs
                </Button>
              </div>
            </CardHeader>
            <CardContent className="sr-only">Execution run {run.id}</CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
