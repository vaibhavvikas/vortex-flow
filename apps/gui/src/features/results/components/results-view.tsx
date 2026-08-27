import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { BarChart3, FileSpreadsheet, CheckCircle2 } from "lucide-react"

export function ResultsView() {
  return (
    <div className="flex w-full flex-col gap-6 p-6">
      <div>
        <h2 className="text-xl font-bold tracking-tight">Analysis Results & QC Metrics</h2>
        <p className="text-sm text-muted-foreground">Genome coverage, quality distribution, and variant metrics</p>
      </div>

      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="w-full justify-start border-b border-border bg-transparent p-0">
          <TabsTrigger value="overview">Overview & Metrics</TabsTrigger>
          <TabsTrigger value="qc">FastQC Report</TabsTrigger>
          <TabsTrigger value="vcf">Variant Summary (VCF)</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="pt-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card>
              <CardHeader>
                <CardDescription>Mean Coverage</CardDescription>
                <CardTitle className="text-2xl font-bold font-mono tabular-nums tracking-tight">34.2x</CardTitle>
              </CardHeader>
              <CardContent className="flex items-center gap-1 text-success font-medium">
                <CheckCircle2 className="size-3.5" /> High Depth (&gt;30x)
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardDescription>Mapped Reads</CardDescription>
                <CardTitle className="text-2xl font-bold font-mono tabular-nums tracking-tight">99.4%</CardTitle>
              </CardHeader>
              <CardContent className="flex items-center gap-1 text-success font-medium">
                <CheckCircle2 className="size-3.5" /> BWA-MEM2 Aligned
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardDescription>Total SNVs Called</CardDescription>
                <CardTitle className="text-2xl font-bold font-mono tabular-nums tracking-tight">4,120,490</CardTitle>
              </CardHeader>
              <CardContent className="text-muted-foreground font-mono text-sm tabular-nums">
                Ti/Tv Ratio: 2.08
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardDescription>Total InDels</CardDescription>
                <CardTitle className="text-2xl font-bold font-mono tabular-nums tracking-tight">842,110</CardTitle>
              </CardHeader>
              <CardContent className="text-muted-foreground font-mono text-sm tabular-nums">
                PASS Quality: 96.8%
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="qc" className="pt-4">
          <Card className="items-center text-center">
            <CardHeader className="items-center">
              <BarChart3 className="size-10 text-primary" />
              <CardTitle>FastQC Interactive Summary</CardTitle>
              <CardDescription>Per base sequence quality Q30+ confirmed across all 24.8M reads.</CardDescription>
            </CardHeader>
          </Card>
        </TabsContent>

        <TabsContent value="vcf" className="pt-4">
          <Card className="items-center text-center">
            <CardHeader className="items-center">
              <FileSpreadsheet className="size-10 text-primary" />
              <CardTitle>VCF Variant Browser</CardTitle>
              <CardDescription>Annotated with VEP & ClinVar. 12 pathogenic variants flagged for review.</CardDescription>
            </CardHeader>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
