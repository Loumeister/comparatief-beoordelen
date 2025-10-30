// src/pages/Results.tsx
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArrowLeft, Download, FileSpreadsheet, FileText, CheckCircle, AlertCircle, XCircle, Link2, Eye, EyeOff, Database, MessageSquare } from "lucide-react";
import { db, Assignment } from "@/lib/db";
import { calculateBradleyTerry } from "@/lib/bradley-terry";
import { getEffectiveJudgements } from "@/lib/effective-judgements";
import { exportToCSV, exportToXLSX, exportToPDF, ExportData } from "@/lib/export";
import { exportDataset } from "@/lib/exportImport";
import { useToast } from "@/hooks/use-toast";
import { isConnected } from "@/lib/graph";
import { SE_RELIABLE, SE_MAX_CAP, STOP_PCT_RELIABLE, STOP_MEDIAN_OK } from "@/lib/constants";
import { StudentDetailsDialog } from "@/components/StudentDetailsDialog";
import { HeaderNav } from "@/components/HeaderNav";

const Results = () => {
  const { assignmentId } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [assignment, setAssignment] = useState<Assignment | null>(null);
  const [results, setResults] = useState<ExportData[]>([]);
  const [loading, setLoading] = useState(true);
  const [connected, setConnected] = useState<boolean | null>(null);
  const [showDetails, setShowDetails] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState<string | null>(null);

  // Cohort-metrics rechtstreeks uit BT-fit
  const [pctReliable, setPctReliable] = useState(0);
  const [medianSE, setMedianSE] = useState<number>(NaN);
  const [maxSE, setMaxSE] = useState<number>(NaN);

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
      const all = await db.judgements.where("assignmentId").equals(id).toArray();
      const judgements = getEffectiveJudgements(all);

      if (judgements.length === 0) {
        toast({ title: "Geen beoordelingen", description: "Begin met vergelijken om resultaten te zien" });
        navigate(`/compare/${id}`);
        return;
      }

      // Connectedness check (niet-blokkerend)
      const ok = isConnected(texts, judgements);
      setConnected(ok);

      // Meta inladen voor grading
      const meta = await db.assignmentMeta.get(id);
      const grading = {
        base: meta?.gradeBase ?? 7,
        scale: meta?.gradeScale ?? 1.2,
        min: meta?.gradeMin ?? 1,
        max: meta?.gradeMax ?? 10,
      };

      // BT-fit (ook bij niet-verbonden graaf)
      const bt = calculateBradleyTerry(texts, judgements, 0.1, 0.1, grading);
      const btRows = bt.rows;

      // ---- Eén pass over judgements voor counts + comments (effectieve set) ----
      const judgementCounts = new Map<number, number>();
      const commentsMap = new Map<number, string[]>();

      for (const j of judgements) {
        // count
        judgementCounts.set(j.textAId, (judgementCounts.get(j.textAId) ?? 0) + 1);
        judgementCounts.set(j.textBId, (judgementCounts.get(j.textBId) ?? 0) + 1);

        // comments (nieuwe velden)
        if (j.commentA && j.commentA.trim()) {
          const arr = commentsMap.get(j.textAId) ?? [];
          arr.push(j.commentA.trim());
          commentsMap.set(j.textAId, arr);
        }
        if (j.commentB && j.commentB.trim()) {
          const arr = commentsMap.get(j.textBId) ?? [];
          arr.push(j.commentB.trim());
          commentsMap.set(j.textBId, arr);
        }

        // backwards compatibility: enkelvoudig comment-veld
        if (j.comment && j.comment.trim()) {
          const c = j.comment.trim();
          const arrA = commentsMap.get(j.textAId) ?? [];
          const arrB = commentsMap.get(j.textBId) ?? [];
          arrA.push(c);
          arrB.push(c);
          commentsMap.set(j.textAId, arrA);
          commentsMap.set(j.textBId, arrB);
        }
      }

      // Map naar exportformaat
      const exportData: ExportData[] = btRows.map((r) => {
        const text = texts.find((t) => t.id === r.textId)!;
        const comments = commentsMap.get(text.id);
        return {
          anonymizedName: text.anonymizedName,
          rank: r.rank,
          label: r.label,
          grade: r.grade,
          theta: r.theta,
          standardError: r.standardError,
          reliability: r.reliability,
          judgementCount: judgementCounts.get(text.id) ?? 0,
          comments: comments ? comments.join(" | ") : undefined,
        };
      });

      setResults(exportData);

      // Cohort-metrics uit BT-fit
      setPctReliable(bt.cohort.pctReliable);
      setMedianSE(bt.cohort.medianSE);
      setMaxSE(bt.cohort.maxSE);

      // Scores opslaan
      await db.scores.where("assignmentId").equals(id).delete();
      for (const r of btRows) {
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

  const handleExport = async (format: "csv" | "xlsx" | "pdf") => {
    if (!assignment) return;

    try {
      if (format === "csv") {
        exportToCSV(results, assignment.title);
      } else if (format === "xlsx") {
        await exportToXLSX(results, assignment.title, assignment.numComparisons);
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

  const handleExportDataset = async () => {
    if (!assignment?.id) return;

    try {
      await exportDataset(assignment.id);
      toast({
        title: "Dataset geëxporteerd",
        description: "Volledige dataset geëxporteerd als JSON (met alle vergelijkingen)",
      });
    } catch (error) {
      console.error("Export dataset error:", error);
      toast({ title: "Export mislukt", variant: "destructive" });
    }
  };

  const getLabelColor = (label: string) => {
    switch (label) {
      case "Topgroep":
        return "bg-label-topgroep text-label-topgroep-foreground";
      case "Bovengemiddeld":
        return "bg-label-bovengemiddeld text-label-bovengemiddeld-foreground";
      case "Gemiddeld":
        return "bg-label-gemiddeld text-label-gemiddeld-foreground";
      case "Onder gemiddeld":
        return "bg-label-ondergemiddeld text-label-ondergemiddeld-foreground";
      case "Onvoldoende":
        return "bg-label-onvoldoende text-label-onvoldoende-foreground";
      default:
        return "bg-label-gemiddeld text-label-gemiddeld-foreground";
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

  // Segmentering voor de voortgangsbalk (categorieën op basis van SE)
  const n = results.length;
  const countReliable = results.filter(r => r.standardError <= SE_RELIABLE).length;
  const countModerate = results.filter(r => r.standardError > SE_RELIABLE && r.standardError <= 1.00).length;
  const countInsufficient = n - countReliable - countModerate;

  const pctModerate = n ? (countModerate / n) * 100 : 0;
  const pctInsufficient = n ? (countInsufficient / n) * 100 : 0;

  // Stopadvies volgens jouw regels
  const cohortCriterionMet = (medianSE <= STOP_MEDIAN_OK) && (maxSE <= SE_MAX_CAP);
  const individualCriterionMet = pctReliable >= STOP_PCT_RELIABLE;
  const stopAdvice = individualCriterionMet || cohortCriterionMet;

  let reliabilityText: string;
  let reliabilityStatus: 'insufficient' | 'moderate' | 'reliable';
  let reliabilityIcon: typeof CheckCircle;

  if (stopAdvice) {
    reliabilityStatus = 'reliable';
    reliabilityText = 'Resultaat betrouwbaar (stopadvies)';
    reliabilityIcon = CheckCircle;
  } else if (medianSE <= 1.00) {
    reliabilityStatus = 'moderate';
    reliabilityText = 'Nog enkele vergelijkingen nodig';
    reliabilityIcon = AlertCircle;
  } else {
    reliabilityStatus = 'insufficient';
    reliabilityText = 'Onvoldoende gegevens';
    reliabilityIcon = XCircle;
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

            <HeaderNav />
          </div>

          <div className="flex gap-2 mt-4">
            <Button variant="outline" onClick={() => handleExport("csv")}>
              <Download className="w-4 h-4 mr-2" />
              CSV
            </Button>
            <Button variant="outline" onClick={() => handleExport("xlsx")}>
              <FileSpreadsheet className="w-4 h-4 mr-2" />
              Excel
            </Button>
            <Button variant="outline" onClick={() => handleExport("pdf")}>
              <FileText className="w-4 h-4 mr-2" />
              PDF
            </Button>
            <Button variant="outline" onClick={handleExportDataset}>
              <Database className="w-4 h-4 mr-2" />
              JSON Dataset
            </Button>
          </div>
        </div>

        {/* Waarschuwing als graaf niet verbonden is */}
        {connected === false && (
          <Card className="mb-6 border-destructive bg-destructive/5">
            <CardContent className="p-6">
              <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-destructive mt-0.5 flex-shrink-0" />
                <div>
                  <h3 className="font-semibold text-destructive mb-2">Voorlopige resultaten</h3>
                  <p className="text-sm text-muted-foreground mb-3">
                    Sommige leerlingen vormen nog losse groepen die niet met elkaar zijn vergeleken. De weergegeven rangorde is daarom onvolledig en mogelijk onbetrouwbaar.
                  </p>
                  <Button size="sm" onClick={() => navigate(`/compare/${assignment?.id}`)}>
                    <Link2 className="w-4 h-4 mr-2" />
                    Meer vergelijkingen maken
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

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
                  {Math.round(pctReliable)}% ≤ {SE_RELIABLE} • mediaan(SE) = {Number.isFinite(medianSE) ? medianSE.toFixed(2) : "—"} • max(SE) = {Number.isFinite(maxSE) ? maxSE.toFixed(2) : "—"}
                </p>
              </div>
            </div>

            {/* Progress bar */}
            {cohortCriterionMet && !individualCriterionMet ? (
              <div>
                <div className="relative h-3 w-full overflow-hidden rounded-full bg-secondary/20">
                  <div
                    className="h-full bg-secondary transition-all"
                    style={{ width: "100%" }}
                    title="Cohortcriterium voldaan"
                  />
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  Mediaan en maximum SE voldoen aan de norm
                </p>
              </div>
            ) : (
              <div className="relative h-3 w-full overflow-hidden rounded-full bg-secondary/20">
                <div className="h-full flex">
                  {pctReliable > 0 && (
                    <div
                      className="h-full bg-secondary transition-all"
                      style={{ width: `${pctReliable}%` }}
                      title={`${Math.round(pctReliable)}% betrouwbaar`}
                    />
                  )}
                  {pctModerate > 0 && (
                    <div
                      className="h-full bg-primary transition-all"
                      style={{ width: `${pctModerate}%` }}
                      title={`${Math.round(pctModerate)}% middel`}
                    />
                  )}
                  {pctInsufficient > 0 && (
                    <div
                      className="h-full bg-destructive transition-all"
                      style={{ width: `${pctInsufficient}%` }}
                      title={`${Math.round(pctInsufficient)}% onvoldoende`}
                    />
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Results Table */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Rangorde</CardTitle>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowDetails(!showDetails)}
            >
              {showDetails ? (
                <>
                  <EyeOff className="w-4 h-4 mr-2" />
                  Verberg details
                </>
              ) : (
                <>
                  <Eye className="w-4 h-4 mr-2" />
                  Toon achtergrondscores
                </>
              )}
            </Button>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-16">Rang</TableHead>
                  <TableHead>Tekst</TableHead>
                  <TableHead>Label</TableHead>
                  <TableHead className="text-right">Cijfer</TableHead>
                  {showDetails && (
                    <>
                      <TableHead className="text-right">Theta (θ)</TableHead>
                      <TableHead className="text-right">SE</TableHead>
                      <TableHead className="text-right">Aantal beoordelingen</TableHead>
                    </>
                  )}
                  <TableHead>Betrouwbaarheid</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {results.map((r) => (
                  <TableRow
                    key={`${r.rank}-${r.anonymizedName}`}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => setSelectedStudent(r.anonymizedName)}
                  >
                    <TableCell className="font-bold text-lg">{r.rank}</TableCell>
                    <TableCell className="font-medium text-primary hover:underline">
                      <div className="flex items-center gap-2">
                        {r.anonymizedName}
                        {r.comments && <MessageSquare className="w-4 h-4 text-muted-foreground" />}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge className={getLabelColor(r.label)}>{r.label}</Badge>
                    </TableCell>
                    <TableCell className="text-right font-bold text-lg">{r.grade.toFixed(1)}</TableCell>
                    {showDetails && (
                      <>
                        <TableCell className="text-right font-mono text-sm">{r.theta.toFixed(3)}</TableCell>
                        <TableCell className="text-right font-mono text-sm">{r.standardError.toFixed(3)}</TableCell>
                        <TableCell className="text-right font-mono text-sm">{r.judgementCount}</TableCell>
                      </>
                    )}
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

      {/* Student Details Dialog */}
      <StudentDetailsDialog
        studentName={selectedStudent || ""}
        assignmentId={assignment?.id || 0}
        open={!!selectedStudent}
        onOpenChange={(open) => !open && setSelectedStudent(null)}
      />
    </div>
  );
};

export default Results;
