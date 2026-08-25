import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { BarChart3, FileSpreadsheet, CheckCircle2 } from "lucide-react"

export function ResultsView() {
  return (
    <div className="p-6 space-y-6 w-full">
      <div>
        <h2 className="text-xl font-bold tracking-tight">Analysis Results & QC Metrics</h2>
        <p className="text-xs text-muted-foreground">Genome coverage, quality distribution, and variant metrics</p>
      </div>

      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="w-full justify-start border-b border-border bg-transparent p-0">
          <TabsTrigger value="overview">Overview & Metrics</TabsTrigger>
          <TabsTrigger value="qc">FastQC Report</TabsTrigger>
          <TabsTrigger value="vcf">Variant Summary (VCF)</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4 pt-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card className="bg-card">
              <CardHeader className="p-4 pb-1">
                <CardDescription className="text-xs">Mean Coverage</CardDescription>
                <CardTitle className="text-2xl font-bold">34.2x</CardTitle>
              </CardHeader>
              <CardContent className="p-4 pt-1 text-xs text-emerald-500 flex items-center gap-1 font-medium">
                <CheckCircle2 className="size-3.5" /> High Depth (&gt;30x)
              </CardContent>
            </Card>

            <Card className="bg-card">
              <CardHeader className="p-4 pb-1">
                <CardDescription className="text-xs">Mapped Reads</CardDescription>
                <CardTitle className="text-2xl font-bold">99.4%</CardTitle>
              </CardHeader>
              <CardContent className="p-4 pt-1 text-xs text-emerald-500 flex items-center gap-1 font-medium">
                <CheckCircle2 className="size-3.5" /> BWA-MEM2 Aligned
              </CardContent>
            </Card>

            <Card className="bg-card">
              <CardHeader className="p-4 pb-1">
                <CardDescription className="text-xs">Total SNVs Called</CardDescription>
                <CardTitle className="text-2xl font-bold">4,120,490</CardTitle>
              </CardHeader>
              <CardContent className="p-4 pt-1 text-xs text-muted-foreground">
                Ti/Tv Ratio: 2.08
              </CardContent>
            </Card>

            <Card className="bg-card">
              <CardHeader className="p-4 pb-1">
                <CardDescription className="text-xs">Total InDels</CardDescription>
                <CardTitle className="text-2xl font-bold">842,110</CardTitle>
              </CardHeader>
              <CardContent className="p-4 pt-1 text-xs text-muted-foreground">
                PASS Quality: 96.8%
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="qc" className="pt-4">
          <Card className="bg-card p-6 text-center space-y-2">
            <BarChart3 className="size-10 mx-auto text-primary" />
            <h3 className="text-base font-semibold">FastQC Interactive Summary</h3>
            <p className="text-xs text-muted-foreground">Per base sequence quality Q30+ confirmed across all 24.8M reads.</p>
          </Card>
        </TabsContent>

        <TabsContent value="vcf" className="pt-4">
          <Card className="bg-card p-6 text-center space-y-2">
            <FileSpreadsheet className="size-10 mx-auto text-primary" />
            <h3 className="text-base font-semibold">VCF Variant Browser</h3>
            <p className="text-xs text-muted-foreground">Annotated with VEP & ClinVar. 12 pathogenic variants flagged for review.</p>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
