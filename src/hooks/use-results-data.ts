// src/hooks/use-results-data.ts
// Encapsulates all data loading, BT calculation, rater analysis,
// anchor grading, and feedback aggregation for the Results page.

import { useEffect, useState, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { db, Assignment, Judgement } from "@/lib/db";
import type { Anchor } from "@/lib/db";
import { calculateBradleyTerry } from "@/lib/bradley-terry";
import { calculateAnchoredGrades } from "@/lib/anchor-grading";
import { getEffectiveJudgements } from "@/lib/effective-judgements";
import { analyzeRaters, RaterAnalysis } from "@/lib/rater-analysis";
import { calculateSplitHalfReliability, SplitHalfResult } from "@/lib/split-half";
import { isConnected } from "@/lib/graph";
import { ExportData, StudentFeedback, exportToCSV, exportToXLSX, exportToPDF, exportFeedbackPDF } from "@/lib/export";
import { exportDataset, exportTextsOnly } from "@/lib/exportImport";
import { useToast } from "@/hooks/use-toast";

export interface GradingConfig {
  scale: number;
  sigma: number;
  min: number;
  max: number;
}

export interface ResultsDataState {
  assignment: Assignment | null;
  results: ExportData[];
  loading: boolean;
  connected: boolean | null;
  raterAnalysis: RaterAnalysis | null;
  splitHalf: SplitHalfResult | null;
  anchors: Anchor[];
  btResults: { textId: number; theta: number }[];
  gradingConfig: GradingConfig;
  feedbackData: Map<number, { text: string; raterName?: string }[]>;
}

export function useResultsData() {
  const { assignmentId } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [assignment, setAssignment] = useState<Assignment | null>(null);
  const [results, setResults] = useState<ExportData[]>([]);
  const [loading, setLoading] = useState(true);
  const [connected, setConnected] = useState<boolean | null>(null);
  const [raterAnalysis, setRaterAnalysis] = useState<RaterAnalysis | null>(null);
  const [splitHalf, setSplitHalf] = useState<SplitHalfResult | null>(null);
  const [anchors, setAnchors] = useState<Anchor[]>([]);
  const [btResults, setBtResults] = useState<{ textId: number; theta: number }[]>([]);
  const [gradingConfig, setGradingConfig] = useState<GradingConfig>({ scale: 1.2, sigma: 1, min: 1, max: 10 });
  const [feedbackData, setFeedbackData] = useState<Map<number, { text: string; raterName?: string }[]>>(new Map());

  const loadResults = useCallback(async () => {
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

      // Connectedness check
      setConnected(isConnected(texts, judgements));

      // Meta + grading config
      const meta = await db.assignmentMeta.get(id);
      const grading = {
        base: meta?.gradeBase ?? 7,
        scale: meta?.gradeScale ?? 1.2,
        min: meta?.gradeMin ?? 1,
        max: meta?.gradeMax ?? 10,
      };
      const roundingStep = meta?.gradeRounding ?? 0.1;
      const roundGrade = (g: number) => Math.round(g * (1 / roundingStep)) / (1 / roundingStep);
      const loadedAnchors = meta?.anchors ?? [];
      setAnchors(loadedAnchors);

      // BT fit
      const bt = calculateBradleyTerry(texts, judgements, 0.1, 0.1, grading);

      // Rater analysis
      const raterIds = new Set(judgements.map(j => j.raterId ?? 'unknown'));
      if (raterIds.size > 1) {
        const thetaMap = new Map(bt.map(r => [r.textId, r.theta]));
        setRaterAnalysis(analyzeRaters(judgements, texts, thetaMap));
      } else {
        setRaterAnalysis(null);
      }

      // PLAN-13: Split-half reliability
      setSplitHalf(calculateSplitHalfReliability(texts, judgements, 20, 0.1));

      // Count judgements + aggregate comments/feedback per text (single pass)
      const judgementCounts = new Map<number, number>();
      const commentsMap = new Map<number, string[]>();
      const feedbackMap = new Map<number, { text: string; raterName?: string }[]>();

      for (const j of judgements) {
        judgementCounts.set(j.textAId, (judgementCounts.get(j.textAId) ?? 0) + 1);
        judgementCounts.set(j.textBId, (judgementCounts.get(j.textBId) ?? 0) + 1);

        if (j.commentA?.trim()) {
          if (!commentsMap.has(j.textAId)) commentsMap.set(j.textAId, []);
          commentsMap.get(j.textAId)!.push(j.commentA.trim());
          if (!feedbackMap.has(j.textAId)) feedbackMap.set(j.textAId, []);
          feedbackMap.get(j.textAId)!.push({ text: j.commentA.trim(), raterName: j.raterName || undefined });
        }
        if (j.commentB?.trim()) {
          if (!commentsMap.has(j.textBId)) commentsMap.set(j.textBId, []);
          commentsMap.get(j.textBId)!.push(j.commentB.trim());
          if (!feedbackMap.has(j.textBId)) feedbackMap.set(j.textBId, []);
          feedbackMap.get(j.textBId)!.push({ text: j.commentB.trim(), raterName: j.raterName || undefined });
        }
        // Backwards compatibility: old single comment field
        if (j.comment?.trim() && !j.commentA && !j.commentB) {
          for (const tid of [j.textAId, j.textBId]) {
            if (!commentsMap.has(tid)) commentsMap.set(tid, []);
            commentsMap.get(tid)!.push(j.comment.trim());
            if (!feedbackMap.has(tid)) feedbackMap.set(tid, []);
            feedbackMap.get(tid)!.push({ text: j.comment.trim(), raterName: j.raterName || undefined });
          }
        }
      }

      setFeedbackData(feedbackMap);

      // Store BT results + sigma for anchor recalculation
      const thetas = bt.map(r => r.theta);
      const meanTheta = thetas.reduce((a, b) => a + b, 0) / thetas.length;
      const variance = thetas.reduce((s, t) => s + (t - meanTheta) ** 2, 0) / Math.max(thetas.length, 1);
      const sigma = Math.sqrt(Math.max(variance, 1e-12));
      const anchorGradingCfg = { scale: grading.scale, sigma, min: grading.min, max: grading.max };
      setBtResults(bt.map(r => ({ textId: r.textId, theta: r.theta })));
      setGradingConfig(anchorGradingCfg);

      // Compute anchored grades
      const anchoredResults = calculateAnchoredGrades(
        bt.map(r => ({ textId: r.textId, theta: r.theta })),
        loadedAnchors,
        anchorGradingCfg,
      );
      const anchoredMap = new Map(anchoredResults?.map(r => [r.textId, r.anchoredGrade]) ?? []);

      // Map to export format
      const exportData: ExportData[] = bt.map((r) => {
        const text = texts.find((t) => t.id === r.textId)!;
        const comments = commentsMap.get(text.id!);
        const anchoredRaw = anchoredMap.get(r.textId);
        return {
          textId: r.textId,
          anonymizedName: text.anonymizedName,
          rank: r.rank,
          label: r.label,
          grade: roundGrade(r.grade),
          anchoredGrade: anchoredRaw !== undefined ? roundGrade(anchoredRaw) : undefined,
          theta: r.theta,
          standardError: r.standardError,
          reliability: r.reliability,
          judgementCount: judgementCounts.get(text.id!) ?? 0,
          comments: comments ? comments.join(' | ') : undefined,
          infit: r.infit,
          infitLabel: r.infitLabel,
        };
      });

      setResults(exportData);

      // Persist scores
      await db.scores.where("assignmentId").equals(id).delete();
      for (const r of bt) {
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
  }, [assignmentId, navigate, toast]);

  useEffect(() => {
    void loadResults();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assignmentId]);

  // --- Anchor management ---

  const saveAnchor = useCallback(async (textId: number, grade: number) => {
    if (!assignment?.id) return;
    const newAnchors = [...anchors.filter(a => a.textId !== textId), { textId, grade }];
    await db.assignmentMeta.update(assignment.id, { anchors: newAnchors });
    setAnchors(newAnchors);
    loadResults();
  }, [assignment, anchors, loadResults]);

  const removeAnchor = useCallback(async (textId: number) => {
    if (!assignment?.id) return;
    const newAnchors = anchors.filter(a => a.textId !== textId);
    await db.assignmentMeta.update(assignment.id, { anchors: newAnchors });
    setAnchors(newAnchors);
    loadResults();
  }, [assignment, anchors, loadResults]);

  const clearAllAnchors = useCallback(async () => {
    if (!assignment?.id) return;
    await db.assignmentMeta.update(assignment.id, { anchors: [] });
    setAnchors([]);
    loadResults();
  }, [assignment, loadResults]);

  // --- Export helpers ---

  const handleExport = useCallback(async (format: "csv" | "xlsx" | "pdf") => {
    if (!assignment) return;
    try {
      if (format === "csv") {
        exportToCSV(results, assignment.title);
      } else if (format === "xlsx") {
        await exportToXLSX(results, assignment.title, assignment.numComparisons);
      } else {
        exportToPDF(results, assignment.title);
      }
      toast({ title: "Export geslaagd", description: `Resultaten geëxporteerd als ${format.toUpperCase()}` });
    } catch (error) {
      console.error("Export error:", error);
      toast({ title: "Export mislukt", variant: "destructive" });
    }
  }, [assignment, results, toast]);

  const handleExportDataset = useCallback(async () => {
    if (!assignment?.id) return;
    try {
      await exportDataset(assignment.id);
      toast({ title: "Dataset geëxporteerd", description: "Volledige dataset geëxporteerd als JSON (met alle vergelijkingen)" });
    } catch (error) {
      console.error("Export dataset error:", error);
      toast({ title: "Export mislukt", variant: "destructive" });
    }
  }, [assignment, toast]);

  const handleShareAssignment = useCallback(async () => {
    if (!assignment?.id) return;
    try {
      await exportTextsOnly(assignment.id);
      toast({ title: "Opdracht gedeeld", description: "JSON met alleen teksten geëxporteerd — collega's kunnen hiermee starten" });
    } catch (error) {
      console.error("Share error:", error);
      toast({ title: "Export mislukt", variant: "destructive" });
    }
  }, [assignment, toast]);

  const handleExportFeedback = useCallback((showGrades: boolean) => {
    if (!assignment) return;
    const students: StudentFeedback[] = results.map(r => ({
      anonymizedName: r.anonymizedName,
      grade: r.grade,
      anchoredGrade: r.anchoredGrade,
      label: r.label,
      rank: r.rank,
      comments: r.textId != null ? (feedbackData.get(r.textId) ?? []) : [],
    }));
    const hasMultipleRaters = (raterAnalysis?.uniqueRaterCount ?? 0) > 1;
    const success = exportFeedbackPDF(students, assignment.title, hasMultipleRaters, showGrades);
    if (success) {
      toast({ title: "Feedback geëxporteerd", description: "PDF met leerlingfeedback gedownload" });
    } else {
      toast({ title: "Geen feedback beschikbaar", description: "Er zijn nog geen opmerkingen gemaakt bij de vergelijkingen", variant: "destructive" });
    }
  }, [assignment, results, feedbackData, raterAnalysis, toast]);

  return {
    assignment,
    results,
    loading,
    connected,
    raterAnalysis,
    splitHalf,
    anchors,
    btResults,
    gradingConfig,
    feedbackData,
    // Anchor management
    saveAnchor,
    removeAnchor,
    clearAllAnchors,
    // Exports
    handleExport,
    handleExportDataset,
    handleShareAssignment,
    handleExportFeedback,
    // Reload
    loadResults,
  };
}
