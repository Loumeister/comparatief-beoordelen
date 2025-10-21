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
import { assessReliability, ReliabilityAssessment } from "@/lib/reliability";

const Results = () => {
  const { assignmentId } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [assignment, setAssignment] = useState<Assignment | null>(null);
  const [results, setResults] = useState<ExportData[]>([]);
  const [loading, setLoading] = useState(true);
  const [connected, setConnected] = useState<boolean | null>(null);
  const [reliabilityData, setReliabilityData] = useState<ReliabilityAssessment | null>(null);

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

      // --- NIEUW: connectedness check vóór BT ---
      const ok = isConnected(texts, judgements);
      setConnected(ok);
      if (!ok) {
        // Niet verbonden → géén BT-fit; toon banner + CTA
        setLoading(false);
        return;
      }

      // --- BT-fit ---
      const btResults = calculateBradleyTerry(texts, judgements);

      // Haal vorige fit op voor convergentie-check
      const previousFits = await db.previousFits
        .where("assignmentId")
        .equals(id)
        .sortBy("calculatedAt");
      const previousFit = previousFits.length > 0 ? previousFits[previousFits.length - 1] : null;

      // Robuuste betrouwbaarheidscheck
      const reliability = assessReliability(
        btResults,
        texts,
        judgements,
        previousFit?.results
      );
      setReliabilityData(reliability);

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

      // Sla huidige fit op voor volgende convergentie-check
      await db.previousFits.add({
        assignmentId: id,
        results: btResults.map((r) => ({
          textId: r.textId,
          rank: r.rank,
          grade: r.grade,
        })),
        calculatedAt: new Date(),
      });

      setLoading(false);
    } catch (error) {
      console.error("Results error:", error);
      toast({ title: "Fout bij laden resultaten", variant: "destructive" });
      setLoading(false);
    }
  };

  const handleExport = (format: "csv" | "xlsx" | "pdf") => {
    if (!assignment) return;
    try {
      if (format === "csv") exportToCSV(results, assignment.title);
      else if (format === "xlsx") exportToXLSX(results, assignment.title);
      else exportToPDF(results, assignment.title);

      toast({ title: "Export geslaagd", description: `Resultaten geëxporteerd als ${format.toUpperCase()}` });
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

  // Niet-verbonden banner (blokkeert weergave BT-resultaten)
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

  // Gebruik robuuste betrouwbaarheidscheck
  const reliabilityStatus: "insufficient" | "moderate" | "reliable" = reliabilityData?.isReliable
    ? "reliable"
    : reliabilityData?.coreReliable
      ? "moderate"
      : "insufficient";

  const reliabilityText = reliabilityData?.message || "Berekenen...";
  
  const reliabilityIcon = 
    reliabilityStatus === "reliable" ? CheckCircle :
    reliabilityStatus === "moderate" ? AlertCircle : XCircle;

  const ReliabilityIcon = reliabilityIcon;
  const reliabilityPercentage = reliabilityData?.corePercentage || 0;

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
                <div className="text-sm text-muted-foreground space-y-1">
                  <p>Kernset: {Math.round(reliabilityPercentage)}% betrouwbaar</p>
                  {reliabilityData && (
                    <>
                      {reliabilityData.kendallTau !== null && (
                        <p>Rangstabiliteit: τ = {reliabilityData.kendallTau.toFixed(3)}</p>
                      )}
                      {!reliabilityData.topHasLadder && (
                        <p className="text-destructive">⚠ Top mist ladder-bewijs</p>
                      )}
                      {!reliabilityData.bottomHasLadder && (
                        <p className="text-destructive">⚠ Bodem mist ladder-bewijs</p>
                      )}
                    </>
                  )}
                </div>
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
