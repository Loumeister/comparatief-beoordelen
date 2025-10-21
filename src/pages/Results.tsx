// src/pages/Results.tsx
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArrowLeft, Download, FileSpreadsheet, FileText, CheckCircle, AlertCircle, XCircle, Link2 } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { db, Assignment } from "@/lib/db";
import { calculateBradleyTerry } from "@/lib/bradley-terry";
import { exportToCSV, exportToXLSX, exportToPDF, ExportData } from "@/lib/export";
import { useToast } from "@/hooks/use-toast";
import { isConnected } from "@/lib/graph";

const Results = () => {
  const { assignmentId } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [assignment, setAssignment] = useState<Assignment | null>(null);
  const [results, setResults] = useState<ExportData[]>([]);
  const [loading, setLoading] = useState(true);
  const [connected, setConnected] = useState<boolean | null>(null);

  useEffect(() => {
    loadResults();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assignmentId]);

  const loadResults = async () => {
    try {
      const id = parseInt(assignmentId!);
      const assign = await db.assignments.get(id);

      if (!assign) {
        toast({ title: "Opdracht niet gevonden", variant: "destructive" });
        navigate("/");
        return;
      }
      setAssignment(assign);

      const texts = await db.texts.where("assignmentId").equals(id).toArray();
      const judgements = await db.judgements.where("assignmentId").equals(id).toArray();

      if (judgements.length === 0) {
        toast({ title: "Geen beoordelingen", description: "Begin met vergelijken om resultaten te zien" });
        navigate(`/compare/${id}`);
        return;
      }

      // Connectedness check vóór BT
      const ok = isConnected(texts, judgements);
      setConnected(ok);
      if (!ok) {
        setLoading(false);
        return; // geen BT-fit zolang de grafiek niet verbonden is
      }

      // BT-fit
      const btResults = calculateBradleyTerry(texts, judgements);

      // Map naar exportformaat
      const exportData: ExportData[] = btResults.map((r) => {
        const text = texts.find((t) => t.id === r.textId)!;
        return {
          anonymizedName: text.anonymizedName,
          rank: r.rank,
          label: r.label,
          grade: r.grade,
          theta: r.theta,
          standardError: r.standardError,
          reliability: r.reliability,
        };
      });

      setResults(exportData);

      // Scores opslaan
      await db.scores.where("assignmentId").equals(id).delete();
      for (const r of btResults) {
        await db.scores.add({
          assignmentId: id,
          textId: r.textId,
          theta: r.theta,
          standardError: r.standardError,
          rank: r.rank,
          label: r.label,
          grade: r.grade,
          reliability: r.reliability,
          calculatedAt: new Date(),
        });
      }

      setLoading(false);
    } catch (error) {
      console.error("Results error:", error);
      toast({ title: "Fout bij laden resultaten", variant: "destructive" });
    }
  };

  const handleExport = (format: "csv" | "xlsx" | "pdf") => {
    if (!assignment) return;

    try {
      if (format === "csv") {
        exportToCSV(results, assignment.title);
      } else if (format === "xlsx") {
        exportToXLSX(results, assignment.title, assignment.numComparisons);
      } else {
        exportToPDF(results, assignment.title);
      }

      toast({
        title: "Export geslaagd",
        description: `Resultaten geëxporteerd als ${format.toUpperCase()}`,
      });
    } catch (error) {
      console.error("Export error:", error);
      toast({ title: "Export mislukt", variant: "destructive" });
    }
  };

  const getLabelColor = (label: string) => {
    switch (label) {
      case "Topgroep":
        return "bg-secondary text-secondary-foreground";
      case "Bovengemiddeld":
        return "bg-primary text-primary-foreground";
      case "Gemiddeld":
        return "bg-muted text-muted-foreground";
      case "Onder gemiddeld":
        return "bg-destructive/20 text-destructive";
      default:
        return "bg-muted text-muted-foreground";
    }
  };

  const getReliabilityColor = (reliability: string) => {
    if (reliability === "Resultaat betrouwbaar") return "text-secondary";
    if (reliability === "Nog enkele vergelijkingen nodig") return "text-primary";
    return "text-destructive";
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground">Berekenen van resultaten...</p>
      </div>
    );
  }

  // Niet-verbonden banner (blokkeert BT-resultaten)
  if (connected === false) {
    return (
      <div className="min-h-screen bg-background p-6">
        <div className="max-w-6xl mx-auto">
          <Button variant="ghost" onClick={() => navigate("/")} className="mb-4">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Terug naar overzicht
          </Button>

          <Card className="border-destructive">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertCircle className="w-5 h-5 text-destructive" />
                Vergelijkingsgrafiek is niet verbonden
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Sommige teksten vormen nog losse eilanden. Maak eerst één of meer <em>verbindingsparen</em> om alle
                teksten met elkaar te verbinden. Daarna kun je betrouwbare resultaten berekenen.
              </p>
              <div className="flex gap-3">
                <Button onClick={() => navigate(`/compare/${assignment?.id}`)}>
                  <Link2 className="w-4 h-4 mr-2" />
                  Plan verbindingsparen
                </Button>
                <Button variant="outline" onClick={() => navigate("/")}>
                  Terug
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  // Overall reliability
  const reliableCount = results.filter((r) => r.reliability === "Resultaat betrouwbaar").length;
  const reliabilityPercentage = (reliableCount / results.length) * 100;

  let reliabilityStatus: "insufficient" | "moderate" | "reliable";
  let reliabilityText: string;
  let reliabilityIcon: typeof CheckCircle;

  if (reliabilityPercentage < 60) {
    reliabilityStatus = "insufficient";
    reliabilityText = "Onvoldoende gegevens";
    reliabilityIcon = XCircle;
  } else if (reliabilityPercentage < 80) {
    reliabilityStatus = "moderate";
    reliabilityText = "Nog enkele vergelijkingen nodig";
    reliabilityIcon = AlertCircle;
  } else {
    reliabilityStatus = "reliable";
    reliabilityText = "Resultaat betrouwbaar";
    reliabilityIcon = CheckCircle;
  }

  const ReliabilityIcon = reliabilityIcon;

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <Button variant="ghost" onClick={() => navigate("/")} className="mb-4">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Terug naar overzicht
          </Button>

          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-4xl font-bold mb-2">{assignment?.title}</h1>
              <p className="text-muted-foreground">Resultaten van vergelijkende beoordeling</p>
            </div>

            <div className="flex gap-2">
              <Button variant="outline" onClick={() => handleExport("csv")}>
                <Download className="w-4 h-4 mr-2" />
                CSV
              </Button>
              <Button variant="outline" onClick={() => handleExport("xlsx")}>
                <FileSpreadsheet className="w-4 h-4 mr-2" />
                Excel
              </Button>
              <Button onClick={() => handleExport("pdf")}>
                <FileText className="w-4 h-4 mr-2" />
                PDF
              </Button>
            </div>
          </div>
        </div>

        {/* Overall Reliability Bar */}
        <Card className="mb-6">
          <CardContent className="p-6">
            <div className="flex items-center gap-3 mb-4">
              <ReliabilityIcon
                className={`w-5 h-5 ${
                  reliabilityStatus === "reliable"
                    ? "text-secondary"
                    : reliabilityStatus === "moderate"
                      ? "text-primary"
                      : "text-destructive"
                }`}
              />
              <div className="flex-1">
                <h3 className="font-semibold text-lg">{reliabilityText}</h3>
                <p className="text-sm text-muted-foreground">
                  {Math.round(reliabilityPercentage)}% van de teksten heeft voldoende vergelijkingen
                </p>
              </div>
            </div>
            <div className="relative">
              <Progress value={reliabilityPercentage} className="h-3" />
              <style>{`
                [role="progressbar"] > div {
                  background: ${
                    reliabilityStatus === "reliable"
                      ? "hsl(var(--secondary))"
                      : reliabilityStatus === "moderate"
                        ? "hsl(var(--primary))"
                        : "hsl(var(--destructive))"
                  };
                  transition: background-color 0.3s ease;
                }
              `}</style>
            </div>
          </CardContent>
        </Card>

        {/* Results Table */}
        <Card>
          <CardHeader>
            <CardTitle>Rangorde</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-16">Rang</TableHead>
                  <TableHead>Tekst</TableHead>
                  <TableHead>Label</TableHead>
                  <TableHead className="text-right">Cijfer</TableHead>
                  <TableHead>Betrouwbaarheid</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {results.map((r) => (
                  <TableRow key={`${r.rank}-${r.anonymizedName}`}>
                    <TableCell className="font-bold text-lg">{r.rank}</TableCell>
                    <TableCell className="font-medium">{r.anonymizedName}</TableCell>
                    <TableCell>
                      <Badge className={getLabelColor(r.label)}>{r.label}</Badge>
                    </TableCell>
                    <TableCell className="text-right font-bold text-lg">{r.grade.toFixed(1)}</TableCell>
                    <TableCell>
                      <span className={getReliabilityColor(r.reliability)}>{r.reliability}</span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Continue comparing button */}
        <div className="mt-6">
          <Button variant="outline" onClick={() => navigate(`/compare/${assignment?.id}`)}>
            Meer vergelijkingen maken
          </Button>
        </div>
      </div>
    </div>
  );
};

export default Results;
