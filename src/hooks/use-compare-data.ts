// src/hooks/use-compare-data.ts
// Encapsulates data loading, BT map building, pair generation, judgement saving,
// and rater identification for the Compare page.

import { useEffect, useState, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { db, Assignment, AssignmentMeta, Text } from "@/lib/db";
import { generatePairs } from "@/lib/pairing";
import { calculateBradleyTerry } from "@/lib/bradley-terry";
import { getEffectiveJudgements } from "@/lib/effective-judgements";
import { assessReliability, ReliabilityAssessment } from "@/lib/reliability";
import { useToast } from "@/hooks/use-toast";
import { pairKey } from "@/lib/utils";
import { MIN_BASE, SE_RELIABLE, DEFAULT_COMPARISONS_PER_TEXT, DEFAULT_BATCH_SIZE } from "@/lib/constants";

// ─── BT Maps helper ───
async function buildBTMaps(assignmentId: number) {
  const texts = await db.texts.where("assignmentId").equals(assignmentId).toArray();
  const all = await db.judgements.where("assignmentId").equals(assignmentId).toArray();
  const judgements = getEffectiveJudgements(all);
  const bt = calculateBradleyTerry(texts, judgements, 0.3);
  const theta = new Map<number, number>(bt.map((r) => [r.textId, r.theta]));
  const se = new Map<number, number>(bt.map((r) => [r.textId, r.standardError]));

  const judgedPairsCounts = new Map<string, number>();
  for (const j of all) {
    const k = pairKey(j.textAId, j.textBId);
    judgedPairsCounts.set(k, (judgedPairsCounts.get(k) ?? 0) + 1);
  }

  const exposures = new Array(texts.length).fill(0);
  const id2idx = new Map<number, number>(texts.map((t, i) => [t.id!, i]));
  for (const j of all) {
    const ia = id2idx.get(j.textAId);
    const ib = id2idx.get(j.textBId);
    if (ia != null) exposures[ia]++;
    if (ib != null) exposures[ib]++;
  }

  return { texts, judgements, all, theta, se, judgedPairsCounts, exposures, btResults: bt };
}

function calculateDynamicBatchSize(texts: Text[], seMap: Map<number, number>, exposures: number[]): number {
  const needWork = texts.filter((t, idx) => {
    const se = seMap.get(t.id!) ?? Infinity;
    return exposures[idx] < MIN_BASE || se > SE_RELIABLE;
  }).length;
  const ratio = needWork / texts.length;
  if (ratio <= 0.3) return Math.max(2, Math.ceil(needWork * 2));
  return DEFAULT_BATCH_SIZE;
}

/** Try generating pairs with increasingly relaxed constraints */
function generatePairsWithFallback(
  texts: Text[],
  judgements: ReturnType<typeof getEffectiveJudgements>,
  targetPerText: number,
  batch: number,
  bt: { theta: Map<number, number>; se: Map<number, number> },
  judgedPairsCounts: Map<string, number>,
) {
  let pairs = generatePairs(texts, judgements, {
    targetComparisonsPerText: targetPerText,
    batchSize: batch,
    bt,
    judgedPairsCounts,
  });

  if (pairs.length === 0) {
    pairs = generatePairs(texts, judgements, {
      targetComparisonsPerText: targetPerText,
      batchSize: Math.max(2, Math.ceil(batch / 2)),
      bt,
      judgedPairsCounts,
      allowRepeats: true,
      maxPairRejudgements: 10,
    });
  }

  if (pairs.length === 0) {
    pairs = generatePairs(texts, judgements, {
      targetComparisonsPerText: targetPerText,
      batchSize: Math.max(2, Math.ceil(batch / 2)),
      bt,
      judgedPairsCounts,
      allowRepeats: true,
      maxPairRejudgements: 100,
    });
  }

  return pairs;
}

// ─── Rater identification ───
export function useRaterIdentification() {
  const [raterName, setRaterName] = useState<string>(() => localStorage.getItem('raterName') || '');
  const [raterNameInput, setRaterNameInput] = useState('');
  const [showRaterPrompt, setShowRaterPrompt] = useState(() => !localStorage.getItem('raterName'));

  const raterId = raterName
    ? `rater-${raterName.toLowerCase().trim().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')}`
    : `rater-anon-${Date.now()}`;

  const handleRaterNameSubmit = useCallback(() => {
    const name = raterNameInput.trim();
    if (name) {
      setRaterName(name);
      localStorage.setItem('raterName', name);
    } else {
      setRaterName('Docent');
      localStorage.setItem('raterName', 'Docent');
    }
    setShowRaterPrompt(false);
  }, [raterNameInput]);

  return { raterName, raterId, raterNameInput, setRaterNameInput, showRaterPrompt, handleRaterNameSubmit };
}

// ─── Main Compare data hook ───
export function useCompareData(raterId: string, raterName: string) {
  const { assignmentId } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [assignment, setAssignment] = useState<Assignment | null>(null);
  const [assignmentMeta, setAssignmentMeta] = useState<AssignmentMeta | null>(null);
  const [allTexts, setAllTexts] = useState<Text[]>([]);
  const [pairs, setPairs] = useState<ReturnType<typeof generatePairs>>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [totalJudgements, setTotalJudgements] = useState(0);
  const [expectedTotal, setExpectedTotal] = useState(0);
  const [pairCounts, setPairCounts] = useState<Map<string, number>>(new Map());
  const [textCounts, setTextCounts] = useState<Map<number, number>>(new Map());
  const [reliabilityAdvice, setReliabilityAdvice] = useState<ReliabilityAssessment | null>(null);
  const [tieRate, setTieRate] = useState(0);
  const [textProgress, setTextProgress] = useState<Array<{
    textId: number;
    name: string;
    comparisons: number;
    se: number;
    status: 'reliable' | 'almost' | 'needsWork';
  }>>([]);

  // Shared logic for loading BT maps, reliability, tie rate, and generating pairs
  const loadPairsFromBT = useCallback(async (id: number, assign: Assignment) => {
    const { texts, judgements, all, theta, se, judgedPairsCounts, exposures, btResults } = await buildBTMaps(id);
    setAllTexts(texts);
    setPairCounts(judgedPairsCounts);

    // Text counts
    const textCountsMap = new Map<number, number>();
    for (const j of judgements) {
      textCountsMap.set(j.textAId, (textCountsMap.get(j.textAId) ?? 0) + 1);
      textCountsMap.set(j.textBId, (textCountsMap.get(j.textBId) ?? 0) + 1);
    }
    setTextCounts(textCountsMap);

    const targetPerText = assign.numComparisons || DEFAULT_COMPARISONS_PER_TEXT;
    setTotalJudgements(judgements.length);
    setExpectedTotal(texts.length * targetPerText);

    const batch = calculateDynamicBatchSize(texts, se, exposures);
    setReliabilityAdvice(assessReliability(btResults, texts, judgements));

    // Per-text progress (PLAN-10)
    const id2idx = new Map<number, number>(texts.map((t, i) => [t.id!, i]));
    setTextProgress(
      texts.map((t) => {
        const tSE = se.get(t.id!) ?? Infinity;
        const idx = id2idx.get(t.id!)!;
        const comps = exposures[idx] ?? 0;
        let status: 'reliable' | 'almost' | 'needsWork';
        if (Number.isFinite(tSE) && tSE <= SE_RELIABLE) status = 'reliable';
        else if (Number.isFinite(tSE) && tSE <= 1.0) status = 'almost';
        else status = 'needsWork';
        return { textId: t.id!, name: t.anonymizedName, comparisons: comps, se: tSE, status };
      }).sort((a, b) => b.se - a.se) // worst first
    );

    // Tie rate for current rater (PLAN-9)
    const myJudgements = all.filter(j => j.raterId === raterId);
    if (myJudgements.length >= 5) {
      const ties = myJudgements.filter(j => j.winner === 'EQUAL').length;
      setTieRate(ties / myJudgements.length);
    }

    const newPairs = generatePairsWithFallback(texts, judgements, targetPerText, batch, { theta, se }, judgedPairsCounts);
    setPairs(newPairs);
    setCurrentIndex(0);

    return { texts, newPairs };
  }, [raterId]);

  // Initial load
  const loadData = useCallback(async () => {
    try {
      const id = Number(assignmentId);
      if (!Number.isFinite(id)) {
        toast({ title: "Ongeldige opdracht", variant: "destructive" });
        navigate("/");
        return;
      }

      const assign = await db.assignments.get(id);
      if (!assign) {
        toast({ title: "Opdracht niet gevonden", variant: "destructive" });
        navigate("/");
        return;
      }
      setAssignment(assign);

      let meta = await db.assignmentMeta.get(id);
      if (!meta) {
        meta = { assignmentId: id, judgementMode: "accumulate", seRepeatThreshold: 1.0 };
        await db.assignmentMeta.put(meta);
      }
      setAssignmentMeta(meta);

      const { texts } = await loadPairsFromBT(id, assign);

      if (!texts || texts.length < 2) {
        toast({ title: "Onvoldoende teksten", description: "Minimaal twee teksten nodig om te vergelijken.", variant: "destructive" });
        navigate("/");
        return;
      }

      setLoading(false);
    } catch (error) {
      console.error("Load error:", error);
      toast({ title: "Fout bij laden", variant: "destructive" });
      navigate("/");
    }
  }, [assignmentId, navigate, toast, loadPairsFromBT]);

  // Reload pairs after a judgement
  const reloadPairs = useCallback(async () => {
    if (!assignment) return;
    await loadPairsFromBT(assignment.id!, assignment);
  }, [assignment, loadPairsFromBT]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  // Save judgement
  const handleJudgement = useCallback(
    async (winner: "A" | "B" | "EQUAL", commentLeft: string, commentRight: string, isFinal: boolean) => {
      if (!pairs[currentIndex] || !assignment || !assignmentMeta || saving) return;

      const pair = pairs[currentIndex];

      const sortedAlphabetically = [pair.textA, pair.textB].sort((a, b) =>
        a.anonymizedName.localeCompare(b.anonymizedName),
      );
      const leftText = sortedAlphabetically[0];
      const leftIsA = leftText.id === pair.textA.id;

      try {
        setSaving(true);

        const pk = [pair.textA.id!, pair.textB.id!].sort((a, b) => a - b).join("-");
        const commentA = leftIsA ? commentLeft.trim() : commentRight.trim();
        const commentB = leftIsA ? commentRight.trim() : commentLeft.trim();

        await db.judgements.add({
          assignmentId: assignment.id!,
          textAId: pair.textA.id!,
          textBId: pair.textB.id!,
          winner,
          commentA: commentA || undefined,
          commentB: commentB || undefined,
          createdAt: new Date(),
          raterId,
          raterName: raterName || undefined,
          source: "human",
          isFinal: assignmentMeta.judgementMode === "moderate" ? isFinal : false,
          pairKey: pk,
        });

        setTotalJudgements((prev) => prev + 1);

        setTextCounts((prev) => {
          const updated = new Map(prev);
          updated.set(pair.textA.id!, (updated.get(pair.textA.id!) ?? 0) + 1);
          updated.set(pair.textB.id!, (updated.get(pair.textB.id!) ?? 0) + 1);
          return updated;
        });

        setPairCounts((prev) => {
          const updated = new Map(prev);
          const k = pairKey(pair.textA.id!, pair.textB.id!);
          updated.set(k, (updated.get(k) ?? 0) + 1);
          return updated;
        });

        if (currentIndex < pairs.length - 1) {
          setCurrentIndex((i) => i + 1);
        } else {
          await reloadPairs();
        }
      } catch (error) {
        console.error("Save judgement error:", error);
        toast({ title: "Fout bij opslaan", variant: "destructive" });
      } finally {
        setSaving(false);
      }
    },
    [assignment, assignmentMeta, currentIndex, pairs, reloadPairs, saving, toast, raterId, raterName],
  );

  // Save a manually chosen pair judgement
  const saveManualJudgement = useCallback(
    async (
      textAId: number,
      textBId: number,
      winner: "A" | "B" | "EQUAL",
      commentA: string,
      commentB: string,
      isFinal: boolean,
    ) => {
      if (!assignment || !assignmentMeta || saving) return;
      try {
        setSaving(true);
        const pk = pairKey(textAId, textBId);

        await db.judgements.add({
          assignmentId: assignment.id!,
          textAId,
          textBId,
          winner,
          commentA: commentA.trim() || undefined,
          commentB: commentB.trim() || undefined,
          createdAt: new Date(),
          raterId,
          raterName: raterName || undefined,
          source: "human",
          isFinal: assignmentMeta.judgementMode === "moderate" ? isFinal : false,
          pairKey: pk,
        });

        setTotalJudgements((prev) => prev + 1);
        await reloadPairs();
      } catch (error) {
        console.error("Save manual judgement error:", error);
        toast({ title: "Fout bij opslaan", variant: "destructive" });
      } finally {
        setSaving(false);
      }
    },
    [assignment, assignmentMeta, saving, reloadPairs, toast, raterId, raterName],
  );

  return {
    assignment,
    allTexts,
    pairs,
    currentIndex,
    loading,
    saving,
    totalJudgements,
    expectedTotal,
    reliabilityAdvice,
    tieRate,
    textProgress,
    handleJudgement,
    saveManualJudgement,
    loadData,
  };
}
