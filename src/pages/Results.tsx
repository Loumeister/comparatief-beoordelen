// src/pages/Results.tsx
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArrowLeft, Download, FileSpreadsheet, FileText, CheckCircle, AlertCircle, XCircle, Link2, Eye, EyeOff, Database, MessageSquare, ArrowUpDown, ArrowUp, ArrowDown, Users, Share2, ChevronDown, ChevronUp, Anchor, X } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { db, Assignment, Judgement } from "@/lib/db";
import type { Anchor } from "@/lib/db";
import { calculateBradleyTerry } from "@/lib/bradley-terry";
import { calculateAnchoredGrades } from "@/lib/anchor-grading";
import { exportToCSV, exportToXLSX, exportToPDF, ExportData } from "@/lib/export";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { exportDataset, exportTextsOnly } from "@/lib/exportImport";
import { getEffectiveJudgements } from "@/lib/effective-judgements";
import { analyzeRaters, RaterAnalysis } from "@/lib/rater-analysis";
import { useToast } from "@/hooks/use-toast";
import { isConnected } from "@/lib/graph";
import { SE_RELIABLE, SE_MAX_EDGE, COHORT_PCT_RELIABLE, COHORT_MEDIAN_OK } from "@/lib/constants";
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
  const [sortColumn, setSortColumn] = useState<'rank' | 'name' | null>('rank');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [raterAnalysis, setRaterAnalysis] = useState<RaterAnalysis | null>(null);
  const [showRaterOverview, setShowRaterOverview] = useState(false);
  const [showDisagreements, setShowDisagreements] = useState(false);
  const [anchors, setAnchors] = useState<Anchor[]>([]);
  const [anchorDialogOpen, setAnchorDialogOpen] = useState(false);
  const [anchorTarget, setAnchorTarget] = useState<{ textId: number; name: string; currentGrade: number } | null>(null);
  const [anchorGradeInput, setAnchorGradeInput] = useState("");
  // BT results + grading config needed for anchor recalculation
  const [btResults, setBtResults] = useState<{ textId: number; theta: number }[]>([]);
  const [gradingConfig, setGradingConfig] = useState<{ scale: number; sigma: number; min: number; max: number }>({ scale: 1.2, sigma: 1, min: 1, max: 10 });

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
      const allJudgements = await db.judgements.where("assignmentId").equals(id).toArray();
      const judgements = getEffectiveJudgements(allJudgements);

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
      const loadedAnchors = meta?.anchors ?? [];
      setAnchors(loadedAnchors);

      // BT-fit (ook bij niet-verbonden graaf)
      const btResults = calculateBradleyTerry(texts, judgements, 0.1, 0.1, grading);

      // Rater analysis (only compute if multiple raters)
      const raterIds = new Set(judgements.map(j => j.raterId ?? 'unknown'));
      if (raterIds.size > 1) {
        const thetaMap = new Map(btResults.map(r => [r.textId, r.theta]));
        const analysis = analyzeRaters(judgements, texts, thetaMap);
        setRaterAnalysis(analysis);
      } else {
        setRaterAnalysis(null);
      }

      // Bereken aantal beoordelingen en opmerkingen per tekst in één pass (O(m))
      const judgementCounts = new Map<number, number>();
      const commentsMap = new Map<number, string[]>();
      for (const j of judgements) {
        judgementCounts.set(j.textAId, (judgementCounts.get(j.textAId) ?? 0) + 1);
        judgementCounts.set(j.textBId, (judgementCounts.get(j.textBId) ?? 0) + 1);

        if (j.commentA?.trim()) {
          if (!commentsMap.has(j.textAId)) commentsMap.set(j.textAId, []);
          commentsMap.get(j.textAId)!.push(j.commentA.trim());
        }
        if (j.commentB?.trim()) {
          if (!commentsMap.has(j.textBId)) commentsMap.set(j.textBId, []);
          commentsMap.get(j.textBId)!.push(j.commentB.trim());
        }
        // Backwards compatibility: oude comment veld
        if (j.comment?.trim() && !j.commentA && !j.commentB) {
          for (const tid of [j.textAId, j.textBId]) {
            if (!commentsMap.has(tid)) commentsMap.set(tid, []);
            commentsMap.get(tid)!.push(j.comment.trim());
          }
        }
      }

      // Bewaar BT-resultaten en sigma voor ankerberekening
      const thetas = btResults.map(r => r.theta);
      const meanTheta = thetas.reduce((a, b) => a + b, 0) / thetas.length;
      const variance = thetas.reduce((s, t) => s + (t - meanTheta) ** 2, 0) / Math.max(thetas.length, 1);
      const sigma = Math.sqrt(Math.max(variance, 1e-12));
      const anchorGradingCfg = { scale: grading.scale, sigma, min: grading.min, max: grading.max };
      setBtResults(btResults.map(r => ({ textId: r.textId, theta: r.theta })));
      setGradingConfig(anchorGradingCfg);

      // Bereken geijkte cijfers als er ijkpunten zijn
      const anchoredResults = calculateAnchoredGrades(
        btResults.map(r => ({ textId: r.textId, theta: r.theta })),
        loadedAnchors,
        anchorGradingCfg,
      );
      const anchoredMap = new Map(anchoredResults?.map(r => [r.textId, r.anchoredGrade]) ?? []);

      // Map naar exportformaat
      const exportData: ExportData[] = btResults.map((r) => {
        const text = texts.find((t) => t.id === r.textId)!;
        const comments = commentsMap.get(text.id);
        return {
          textId: r.textId,
          anonymizedName: text.anonymizedName,
          rank: r.rank,
          label: r.label,
          grade: r.grade,
          anchoredGrade: anchoredMap.get(r.textId),
          theta: r.theta,
          standardError: r.standardError,
          reliability: r.reliability,
          judgementCount: judgementCounts.get(text.id) ?? 0,
          comments: comments ? comments.join(' | ') : undefined,
          infit: r.infit,
          infitLabel: r.infitLabel,
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

  // Sla anchor op en herbereken
  const saveAnchor = async (textId: number, grade: number) => {
    if (!assignment?.id) return;
    const newAnchors = [...anchors.filter(a => a.textId !== textId), { textId, grade }];
    await db.assignmentMeta.update(assignment.id, { anchors: newAnchors });
    setAnchors(newAnchors);
    loadResults();
  };

  const removeAnchor = async (textId: number) => {
    if (!assignment?.id) return;
    const newAnchors = anchors.filter(a => a.textId !== textId);
    await db.assignmentMeta.update(assignment.id, { anchors: newAnchors });
    setAnchors(newAnchors);
    loadResults();
  };

  const clearAllAnchors = async () => {
    if (!assignment?.id) return;
    await db.assignmentMeta.update(assignment.id, { anchors: [] });
    setAnchors([]);
    loadResults();
  };

  // Open anchor dialog voor een specifieke tekst
  const openAnchorDialog = (textId: number, name: string, currentGrade: number) => {
    setAnchorTarget({ textId, name, currentGrade });
    const existing = anchors.find(a => a.textId === textId);
    setAnchorGradeInput(existing ? existing.grade.toFixed(1) : currentGrade.toFixed(1));
    setAnchorDialogOpen(true);
  };

  const handleAnchorSave = async () => {
    if (!anchorTarget) return;
    const grade = parseFloat(anchorGradeInput);
    if (isNaN(grade) || grade < (gradingConfig.min) || grade > (gradingConfig.max)) {
      toast({ title: "Ongeldig cijfer", description: `Voer een cijfer in tussen ${gradingConfig.min} en ${gradingConfig.max}`, variant: "destructive" });
      return;
    }
    await saveAnchor(anchorTarget.textId, grade);
    setAnchorDialogOpen(false);
    setAnchorTarget(null);
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

  const handleShareAssignment = async () => {
    if (!assignment?.id) return;

    try {
      await exportTextsOnly(assignment.id);
      toast({
        title: "Opdracht gedeeld",
        description: "JSON met alleen teksten geëxporteerd — collega's kunnen hiermee starten",
      });
    } catch (error) {
      console.error("Share error:", error);
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

  const handleSort = (column: 'rank' | 'name') => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
  };

  const sortedResults = [...results].sort((a, b) => {
    if (sortColumn === 'name') {
      const comparison = a.anonymizedName.localeCompare(b.anonymizedName, 'nl');
      return sortDirection === 'asc' ? comparison : -comparison;
    }
    // Default: sort by rank
    const comparison = a.rank - b.rank;
    return sortDirection === 'asc' ? comparison : -comparison;
  });

  const getSortIcon = (column: 'rank' | 'name') => {
    if (sortColumn !== column) return <ArrowUpDown className="w-4 h-4 ml-1 inline" />;
    return sortDirection === 'asc' 
      ? <ArrowUp className="w-4 h-4 ml-1 inline" />
      : <ArrowDown className="w-4 h-4 ml-1 inline" />;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground">Berekenen van resultaten...</p>
      </div>
    );
  }


  // Calculate overall reliability (cohort-based)
  const seList = results.map(r => r.standardError).sort((a, b) => a - b);
  const n = seList.length;
  const medianSE = n === 0 ? NaN : (n % 2 === 1 ? seList[(n - 1) / 2] : (seList[n / 2 - 1] + seList[n / 2]) / 2);
  const maxSE = n === 0 ? NaN : Math.max(...seList);
  
  // Calculate percentages per reliability category
  const countReliable = n === 0 ? 0 : results.filter(r => r.standardError <= SE_RELIABLE).length;
  const countModerate = n === 0 ? 0 : results.filter(r => r.standardError > SE_RELIABLE && r.standardError <= 1.00).length;
  const countInsufficient = n === 0 ? 0 : results.filter(r => r.standardError > 1.00).length;
  
  const pctReliable = n === 0 ? 0 : (countReliable / n) * 100;
  const pctModerate = n === 0 ? 0 : (countModerate / n) * 100;
  const pctInsufficient = n === 0 ? 0 : (countInsufficient / n) * 100;

  // Determine cohort status text + icon class via thresholds
  let reliabilityText: string;
  let reliabilityStatus: 'insufficient' | 'moderate' | 'reliable';
  let reliabilityIcon: typeof CheckCircle;

  // Check which criterion is met
  const cohortCriterionMet = (medianSE <= COHORT_MEDIAN_OK) && (maxSE <= SE_MAX_EDGE);
  const individualCriterionMet = pctReliable >= COHORT_PCT_RELIABLE;
  const stopAdvice = individualCriterionMet || cohortCriterionMet;

  if (stopAdvice) {
    reliabilityStatus = 'reliable';
    reliabilityText = 'Resultaten zijn betrouwbaar — je kunt stoppen met beoordelen';
    reliabilityIcon = CheckCircle;
  } else if (medianSE <= 1.00) {
    reliabilityStatus = 'moderate';
    reliabilityText = 'Bijna klaar — nog een paar vergelijkingen nodig';
    reliabilityIcon = AlertCircle;
  } else {
    reliabilityStatus = 'insufficient';
    reliabilityText = 'Nog niet genoeg vergelijkingen — ga verder met beoordelen';
    reliabilityIcon = XCircle;
  }

  const ReliabilityIcon = reliabilityIcon;
  const reliabilityPercentage = pctReliable; // hergebruik voor de progressbar (toont %≤0.75)

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

          <div className="mt-4">
            <p className="text-sm text-muted-foreground mb-2">Exporteer resultaten:</p>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => handleExport("xlsx")} title="Download als Excel-bestand">
                <FileSpreadsheet className="w-4 h-4 mr-2" />
                Excel
              </Button>
              <Button variant="outline" onClick={() => handleExport("pdf")} title="Download als PDF-bestand">
                <FileText className="w-4 h-4 mr-2" />
                PDF
              </Button>
              <Button variant="outline" onClick={() => handleExport("csv")} title="Download als CSV (voor eigen verwerking)">
                <Download className="w-4 h-4 mr-2" />
                CSV
              </Button>
              <Button variant="outline" onClick={handleShareAssignment} title="Exporteer alleen de teksten zodat een collega zelf kan beoordelen">
                <Share2 className="w-4 h-4 mr-2" />
                Deel met collega
              </Button>
              <Button variant="outline" onClick={handleExportDataset} title="Exporteer alles (teksten + oordelen) als back-up of om samen te voegen">
                <Database className="w-4 h-4 mr-2" />
                Volledige back-up
              </Button>
            </div>
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
                  {Math.round(reliabilityPercentage)}% van de teksten heeft een betrouwbare score
                  {countInsufficient > 0 && <> • {countInsufficient} tekst{countInsufficient !== 1 ? 'en' : ''} nog onvoldoende vergeleken</>}
                </p>
              </div>
            </div>
            {/* Progress bar - fully green if cohort criterion met, segmented otherwise */}
            {cohortCriterionMet && !individualCriterionMet ? (
              <div>
                <div className="relative h-3 w-full overflow-hidden rounded-full bg-secondary/20">
                  <div 
                    className="h-full bg-secondary transition-all" 
                    style={{ width: '100%' }}
                    title="Cohortcriterium voldaan"
                  />
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  Alle teksten zijn voldoende vergeleken
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

        {/* Rater Overview — only shown when multiple raters */}
        {raterAnalysis && raterAnalysis.uniqueRaterCount > 1 && (
          <Card className="mb-6">
            <CardContent className="p-6">
              <button
                className="flex items-center gap-2 w-full text-left"
                onClick={() => setShowRaterOverview(!showRaterOverview)}
              >
                <Users className="w-5 h-5 text-primary" />
                <h3 className="font-semibold text-lg flex-1">
                  Beoordelaarsoverzicht ({raterAnalysis.uniqueRaterCount} beoordelaars)
                </h3>
                {showRaterOverview ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>

              {showRaterOverview && (
                <div className="mt-4">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Beoordelaar</TableHead>
                        <TableHead className="text-right">Oordelen</TableHead>
                        <TableHead className="text-right">Overeenstemming</TableHead>
                        <TableHead className="text-right">Gelijkwaardig-rate</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {raterAnalysis.raterStats.map((r) => (
                        <TableRow key={r.raterId}>
                          <TableCell className="font-medium">{r.raterName}</TableCell>
                          <TableCell className="text-right">{r.judgementCount}</TableCell>
                          <TableCell className="text-right">
                            <span className={r.modelAgreement < 0.6 ? 'text-destructive font-medium' : ''}>
                              {Math.round(r.modelAgreement * 100)}%
                            </span>
                            {r.modelAgreement < 0.6 && (
                              <span className="text-xs text-destructive ml-1">(laag)</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            <span className={r.tieRate > 0.4 ? 'text-amber-600 dark:text-amber-400 font-medium' : ''}>
                              {Math.round(r.tieRate * 100)}%
                            </span>
                            {r.tieRate > 0.4 && (
                              <span className="text-xs text-amber-600 dark:text-amber-400 ml-1">(hoog)</span>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  <p className="text-xs text-muted-foreground mt-3">
                    Overeenstemming = % oordelen dat overeenkomt met de gezamenlijke rangorde. Gelijkwaardig boven 40% kan de nauwkeurigheid verlagen.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Disagreement Analysis — only shown when disagreements exist */}
        {raterAnalysis && raterAnalysis.disagreements.length > 0 && (
          <Card className="mb-6">
            <CardContent className="p-6">
              <button
                className="flex items-center gap-2 w-full text-left"
                onClick={() => setShowDisagreements(!showDisagreements)}
              >
                <AlertCircle className="w-5 h-5 text-amber-500" />
                <h3 className="font-semibold text-lg flex-1">
                  Meningsverschillen ({raterAnalysis.disagreements.length})
                </h3>
                {showDisagreements ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>

              {showDisagreements && (
                <div className="mt-4 space-y-3">
                  <p className="text-sm text-muted-foreground">
                    Paren waar beoordelaars het oneens zijn over welke tekst beter is. Dit zijn de teksten die het meest geschikt zijn voor gezamenlijk overleg.
                  </p>
                  {raterAnalysis.disagreements.map((d, idx) => (
                    <div key={idx} className="p-3 border rounded-lg">
                      <div className="font-medium mb-2">
                        {d.textAName} vs {d.textBName}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {d.raterVotes.map((v, vIdx) => (
                          <Badge key={vIdx} variant="outline" className="text-xs">
                            {v.raterName}: {v.winner === 'A' ? d.textAName : v.winner === 'B' ? d.textBName : 'Gelijk'}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Anchor Info Card — alleen tonen als er ijkpunten zijn */}
        {anchors.length > 0 && (
          <Card className="mb-6 border-primary/30 bg-primary/5">
            <CardContent className="p-6">
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-3">
                  <Anchor className="w-5 h-5 text-primary mt-0.5 flex-shrink-0" />
                  <div>
                    <h3 className="font-semibold mb-1">Geijkte cijfers actief</h3>
                    <p className="text-sm text-muted-foreground">
                      {anchors.length === 1
                        ? "Er is 1 ijkpunt ingesteld. De geijkte cijfers zijn gekalibreerd op basis van dit ankerpunt."
                        : `Er zijn ${anchors.length} ijkpunten ingesteld. De geijkte cijfers zijn gekalibreerd via een best-fit door deze ankerpunten.`}
                    </p>
                  </div>
                </div>
                <Button variant="ghost" size="sm" onClick={clearAllAnchors} className="text-muted-foreground hover:text-destructive">
                  <X className="w-4 h-4 mr-1" />
                  Wis ijkpunten
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

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
                  Verberg technische details
                </>
              ) : (
                <>
                  <Eye className="w-4 h-4 mr-2" />
                  Toon technische details
                </>
              )}
            </Button>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-16 cursor-pointer hover:bg-muted/50" onClick={() => handleSort('rank')}>
                    Rang{getSortIcon('rank')}
                  </TableHead>
                  <TableHead className="cursor-pointer hover:bg-muted/50" onClick={() => handleSort('name')}>
                    Tekst{getSortIcon('name')}
                  </TableHead>
                  <TableHead>Label</TableHead>
                  <TableHead className="text-right">
                    {anchors.length > 0 ? 'Relatief cijfer' : 'Cijfer'}
                  </TableHead>
                  {anchors.length > 0 && (
                    <TableHead className="text-right">Geijkt cijfer</TableHead>
                  )}
                  {showDetails && (
                    <>
                      <TableHead className="text-right">Theta (θ)</TableHead>
                      <TableHead className="text-right">SE</TableHead>
                      <TableHead className="text-right">Infit</TableHead>
                      <TableHead className="text-right">Aantal beoordelingen</TableHead>
                    </>
                  )}
                  <TableHead>Betrouwbaarheid</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedResults.map((r) => {
                  const isAnchor = anchors.some(a => a.textId === r.textId);
                  return (
                    <TableRow key={`${r.rank}-${r.anonymizedName}`} className="cursor-pointer hover:bg-muted/50" onClick={() => setSelectedStudent(r.anonymizedName)}>
                      <TableCell className="font-bold text-lg">{r.rank}</TableCell>
                      <TableCell className="font-medium text-primary hover:underline">
                        <div className="flex items-center gap-2">
                          {r.anonymizedName}
                          {isAnchor && <Anchor className="w-3.5 h-3.5 text-primary" />}
                          {r.comments && <MessageSquare className="w-4 h-4 text-muted-foreground" />}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge className={getLabelColor(r.label)}>{r.label}</Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <span className={`font-bold text-lg ${anchors.length > 0 ? 'text-muted-foreground' : ''}`}>
                            {r.grade.toFixed(1)}
                          </span>
                          <TooltipProvider delayDuration={200}>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <button
                                  className={`p-1 rounded hover:bg-muted transition-colors ${isAnchor ? 'text-primary' : 'text-muted-foreground/40 hover:text-muted-foreground'}`}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (r.textId != null) openAnchorDialog(r.textId, r.anonymizedName, r.grade);
                                  }}
                                >
                                  <Anchor className="w-3.5 h-3.5" />
                                </button>
                              </TooltipTrigger>
                              <TooltipContent side="left">
                                <p>{isAnchor ? "Ijkpunt aanpassen" : "Stel vast cijfer in"}</p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        </div>
                      </TableCell>
                      {anchors.length > 0 && (
                        <TableCell className="text-right font-bold text-lg text-primary">
                          {r.anchoredGrade != null ? r.anchoredGrade.toFixed(1) : '–'}
                        </TableCell>
                      )}
                      {showDetails && (
                        <>
                          <TableCell className="text-right font-mono text-sm">{r.theta.toFixed(3)}</TableCell>
                          <TableCell className="text-right font-mono text-sm">{r.standardError.toFixed(3)}</TableCell>
                          <TableCell className="text-right font-mono text-sm">
                            <span className={r.infit != null && (r.infit > 1.3 || r.infit < 0.7) ? 'text-amber-600 dark:text-amber-400 font-medium' : ''}>
                              {r.infit != null ? r.infit.toFixed(2) : '–'}
                            </span>
                          </TableCell>
                          <TableCell className="text-right font-mono text-sm">{r.judgementCount}</TableCell>
                        </>
                      )}
                      <TableCell>
                        <span className={getReliabilityColor(r.reliability)}>{r.reliability}</span>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Continue comparing button */}
        <div className="mt-6 flex items-center gap-4">
          <Button variant="outline" onClick={() => navigate(`/compare/${assignment?.id}`)}>
            Meer vergelijkingen maken
          </Button>
          {reliabilityStatus !== 'reliable' && (
            <p className="text-sm text-muted-foreground">
              De resultaten worden nauwkeuriger naarmate je meer vergelijkingen maakt.
            </p>
          )}
        </div>
      </div>

      {/* Student Details Dialog */}
      <StudentDetailsDialog
        studentName={selectedStudent || ''}
        assignmentId={assignment?.id || 0}
        open={!!selectedStudent}
        onOpenChange={(open) => !open && setSelectedStudent(null)}
      />

      {/* Anchor Setting Dialog */}
      <Dialog open={anchorDialogOpen} onOpenChange={setAnchorDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Ijkpunt instellen</DialogTitle>
          </DialogHeader>
          {anchorTarget && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Welk cijfer hoort bij <strong>{anchorTarget.name}</strong>? De overige cijfers worden automatisch herschaald.
              </p>
              <div className="flex items-center gap-3">
                <Input
                  type="number"
                  min={gradingConfig.min}
                  max={gradingConfig.max}
                  step="0.1"
                  value={anchorGradeInput}
                  onChange={(e) => setAnchorGradeInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleAnchorSave(); }}
                  className="w-24 text-center text-lg font-bold"
                  autoFocus
                />
                <span className="text-sm text-muted-foreground">
                  (huidig relatief: {anchorTarget.currentGrade.toFixed(1)})
                </span>
              </div>
              <div className="flex justify-between">
                {anchors.some(a => a.textId === anchorTarget.textId) && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive hover:text-destructive"
                    onClick={async () => {
                      await removeAnchor(anchorTarget.textId);
                      setAnchorDialogOpen(false);
                      setAnchorTarget(null);
                    }}
                  >
                    Verwijder ijkpunt
                  </Button>
                )}
                <div className="flex gap-2 ml-auto">
                  <Button variant="outline" onClick={() => setAnchorDialogOpen(false)}>
                    Annuleren
                  </Button>
                  <Button onClick={handleAnchorSave}>
                    Opslaan
                  </Button>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Results;
