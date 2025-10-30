// src/pages/Compare.tsx
import { useEffect, useState, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { ArrowLeft, Info } from "lucide-react";
import { db, Assignment, AssignmentMeta, Text } from "@/lib/db";
import { generatePairs } from "@/lib/pairing";
import { calculateBradleyTerry } from "@/lib/bradley-terry";
import { getEffectiveJudgements } from "@/lib/effective-judgements";
import { useToast } from "@/hooks/use-toast";
import { HeaderNav } from "@/components/HeaderNav";
import { assessReliability, ReliabilityAssessment } from "@/lib/reliability";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { MIN_BASE, SE_RELIABLE, DEFAULT_COMPARISONS_PER_TEXT, DEFAULT_BATCH_SIZE } from "@/lib/constants";

function key(a: number, b: number): string {
  return `${Math.min(a, b)}-${Math.max(a, b)}`;
}

// Helper: bereken BT-scores tussendoor voor slimmere pairing
async function buildBTMaps(assignmentId: number) {
  const texts = await db.texts.where("assignmentId").equals(assignmentId).toArray();
  const all = await db.judgements.where("assignmentId").equals(assignmentId).toArray();
  const judgements = getEffectiveJudgements(all);
  const bt = calculateBradleyTerry(texts, judgements, 0.3);
  const theta = new Map<number, number>(bt.map((r) => [r.textId, r.theta]));
  const se = new Map<number, number>(bt.map((r) => [r.textId, r.standardError]));

  // judgedPairsCounts
  const judgedPairsCounts = new Map<string, number>();
  for (const j of judgements) {
    const k = key(j.textAId, j.textBId);
    judgedPairsCounts.set(k, (judgedPairsCounts.get(k) ?? 0) + 1);
  }

  // exposures
  const exposures = new Array(texts.length).fill(0);
  const id2idx = new Map<number, number>(texts.map((t, i) => [t.id!, i]));
  for (const j of judgements) {
    const ia = id2idx.get(j.textAId);
    const ib = id2idx.get(j.textBId);
    if (ia != null) exposures[ia]++;
    if (ib != null) exposures[ib]++;
  }

  return { texts, judgements, theta, se, judgedPairsCounts, exposures };
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

const Compare = () => {
  const { assignmentId } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [assignment, setAssignment] = useState<Assignment | null>(null);
  const [assignmentMeta, setAssignmentMeta] = useState<AssignmentMeta | null>(null);
  const [pairs, setPairs] = useState<ReturnType<typeof generatePairs>>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [commentLeft, setCommentLeft] = useState("");
  const [commentRight, setCommentRight] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [totalJudgements, setTotalJudgements] = useState(0);
  const [expectedTotal, setExpectedTotal] = useState(0);
  const [pairCounts, setPairCounts] = useState<Map<string, number>>(new Map<string, number>());
  const [textCounts, setTextCounts] = useState<Map<number, number>>(new Map<number, number>());
  const [replaceMode, setReplaceMode] = useState(false);
  const [isFinal, setIsFinal] = useState(false);
  const [raterId] = useState(() => `rater-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`);
  const [reliabilityAdvice, setReliabilityAdvice] = useState<ReliabilityAssessment | null>(null);

  // ---------- Data laden ----------
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

      // assignmentMeta
      let meta = await db.assignmentMeta.get(id);
      if (!meta) {
        meta = {
          assignmentId: id,
          judgementMode: "accumulate",
          seRepeatThreshold: 1.0,
        };
        await db.assignmentMeta.put(meta);
      }
      setAssignmentMeta(meta);

      const { texts, judgements, theta, se, judgedPairsCounts, exposures } = await buildBTMaps(id);
      setPairCounts(judgedPairsCounts);

      // text counts
      const textCountsMap = new Map<number, number>();
      for (const j of judgements) {
        textCountsMap.set(j.textAId, (textCountsMap.get(j.textAId) ?? 0) + 1);
        textCountsMap.set(j.textBId, (textCountsMap.get(j.textBId) ?? 0) + 1);
      }
      setTextCounts(textCountsMap);

      if (!texts || texts.length < 2) {
        toast({
          title: "Onvoldoende teksten",
          description: "Minimaal twee teksten nodig om te vergelijken.",
          variant: "destructive",
        });
        navigate("/");
        return;
      }

      // progress
      const targetPerText = assign.numComparisons || DEFAULT_COMPARISONS_PER_TEXT;
      const expectedTotal = texts.length * targetPerText;
      setTotalJudgements(judgements.length);
      setExpectedTotal(expectedTotal);

      const batch = calculateDynamicBatchSize(texts, se, exposures);

      // Bereken betrouwbaarheid voor advies
      const bt = calculateBradleyTerry(texts, judgements, 0.3);
      const reliability = assessReliability(bt, texts, judgements);
      setReliabilityAdvice(reliability);

      // 1) Probeer eerst zonder repeats
      let newPairs = generatePairs(texts, judgements, {
        targetComparisonsPerText: targetPerText,
        batchSize: batch,
        bt: { theta, se },
        judgedPairsCounts,
      });

      // 2) Als geen paren: sta ALTIJD repeats toe (gebruiker beslist zelf wanneer te stoppen)
      if (newPairs.length === 0) {
        newPairs = generatePairs(texts, judgements, {
          targetComparisonsPerText: targetPerText,
          batchSize: Math.max(2, Math.ceil(batch / 2)),
          bt: { theta, se },
          judgedPairsCounts,
          allowRepeats: true,
          maxPairRejudgements: 10, // Verhoogd om altijd door te kunnen gaan
        });
      }

      // Als er nog steeds geen paren zijn, probeer met nog hogere repeat limiet
      if (newPairs.length === 0) {
        newPairs = generatePairs(texts, judgements, {
          targetComparisonsPerText: targetPerText,
          batchSize: Math.max(2, Math.ceil(batch / 2)),
          bt: { theta, se },
          judgedPairsCounts,
          allowRepeats: true,
          maxPairRejudgements: 100, // Zeer hoog om altijd paren te hebben
        });
      }
      setPairs(newPairs);
      setCurrentIndex(0);
      setLoading(false);
    } catch (error) {
      console.error("Load error:", error);
      toast({ title: "Fout bij laden", variant: "destructive" });
      navigate("/");
    }
  }, [assignmentId, navigate, toast]);

  // Herlaad adaptief een nieuwe batch na oordelen
  const reloadPairs = useCallback(async () => {
    if (!assignment || !assignmentMeta) return;
    const id = assignment.id!;

    const { texts, judgements, theta, se, judgedPairsCounts, exposures } = await buildBTMaps(id);
    setPairCounts(judgedPairsCounts);

    // text counts
    const textCountsMap = new Map<number, number>();
    for (const j of judgements) {
      textCountsMap.set(j.textAId, (textCountsMap.get(j.textAId) ?? 0) + 1);
      textCountsMap.set(j.textBId, (textCountsMap.get(j.textBId) ?? 0) + 1);
    }
    setTextCounts(textCountsMap);

    const targetPerText = assignment.numComparisons || DEFAULT_COMPARISONS_PER_TEXT;
    const batch = calculateDynamicBatchSize(texts, se, exposures);

    // Bereken betrouwbaarheid voor advies
    const bt = calculateBradleyTerry(texts, judgements, 0.3);
    const reliability = assessReliability(bt, texts, judgements);
    setReliabilityAdvice(reliability);

    let nextPairs = generatePairs(texts, judgements, {
      targetComparisonsPerText: targetPerText,
      batchSize: batch,
      bt: { theta, se },
      judgedPairsCounts,
    });

    // Als geen paren: sta ALTIJD repeats toe
    if (nextPairs.length === 0) {
      nextPairs = generatePairs(texts, judgements, {
        targetComparisonsPerText: targetPerText,
        batchSize: Math.max(2, Math.ceil(batch / 2)),
        bt: { theta, se },
        judgedPairsCounts,
        allowRepeats: true,
        maxPairRejudgements: 10,
      });
    }

    // Als nog steeds geen paren: nog hogere limiet
    if (nextPairs.length === 0) {
      nextPairs = generatePairs(texts, judgements, {
        targetComparisonsPerText: targetPerText,
        batchSize: Math.max(2, Math.ceil(batch / 2)),
        bt: { theta, se },
        judgedPairsCounts,
        allowRepeats: true,
        maxPairRejudgements: 100,
      });
    }
    setPairs(nextPairs);
    setCurrentIndex(0);
    setReplaceMode(false);
    setIsFinal(false);
  }, [assignment, assignmentMeta]);

  // Init load
  useEffect(() => {
    void loadData();
  }, [loadData]);

  // ---------- Oordeel opslaan ----------
  const handleJudgement = useCallback(
    async (winner: "A" | "B" | "EQUAL") => {
      if (!pairs[currentIndex] || !assignment || !assignmentMeta || saving) return;

      const pair = pairs[currentIndex];
      const mode = assignmentMeta.judgementMode || "accumulate";

      // Alfab. links/rechts vastleggen voor comment routing
      const sortedAlphabetically = [pair.textA, pair.textB].sort((a, b) =>
        a.anonymizedName.localeCompare(b.anonymizedName),
      );
      const leftText = sortedAlphabetically[0];
      const leftIsA = leftText.id === pair.textA.id;

      try {
        setSaving(true);

        let supersedesId: number | undefined;
        const pairKey = [pair.textA.id!, pair.textB.id!].sort((a, b) => a - b).join("-");

        if (mode === "replace" && /* expliciet */ false) {
          // (optioneel te activeren: replace per rater)
        }

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
          source: "human",
          isFinal: mode === "moderate" ? isFinal : false,
          supersedesJudgementId: supersedesId,
          pairKey,
        });

        setCommentLeft("");
        setCommentRight("");
        setReplaceMode(false);
        setIsFinal(false);
        setTotalJudgements((prev) => prev + 1);

        // local counters
        setTextCounts((prev) => {
          const updated = new Map(prev);
          updated.set(pair.textA.id!, (updated.get(pair.textA.id!) ?? 0) + 1);
          updated.set(pair.textB.id!, (updated.get(pair.textB.id!) ?? 0) + 1);
          return updated;
        });

        setPairCounts((prev) => {
          const updated = new Map(prev);
          const k = key(pair.textA.id!, pair.textB.id!);
          updated.set(k, (updated.get(k) ?? 0) + 1);
          return updated;
        });

        // volgende of nieuwe batch
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
    [
      assignment,
      assignmentMeta,
      commentLeft,
      commentRight,
      currentIndex,
      pairs,
      reloadPairs,
      saving,
      toast,
      raterId,
      isFinal,
    ],
  );

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target?.tagName === "INPUT" || target?.tagName === "TEXTAREA") return;

      if (e.key === "a" || e.key === "A") {
        void handleJudgement("A");
      } else if (e.key === "b" || e.key === "B") {
        void handleJudgement("B");
      } else if (e.key === "t" || e.key === "T") {
        void handleJudgement("EQUAL");
      }
    };

    window.addEventListener("keydown", handleKeyPress);
    return () => window.removeEventListener("keydown", handleKeyPress);
  }, [handleJudgement]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground">Laden...</p>
      </div>
    );
  }

  if (pairs.length === 0) {
    return (
      <div className="min-h-screen bg-background">
        <div className="border-b bg-card">
          <div className="max-w-7xl mx-auto p-4">
            <div className="flex items-center justify-between mb-4">
              <Button variant="ghost" onClick={() => navigate("/")}>
                <ArrowLeft className="w-4 h-4 mr-2" />
                Terug
              </Button>
              <HeaderNav />
            </div>
            <h1 className="text-2xl font-bold">{assignment?.title}</h1>
          </div>
        </div>

        <div className="max-w-3xl mx-auto p-8">
          <Card className="shadow-lg">
            <CardContent className="p-6 space-y-4">
              <p className="text-lg font-medium">Geen paren beschikbaar</p>
              <p className="text-sm text-muted-foreground">Er zijn momenteel geen vergelijkingsparen beschikbaar.</p>
              <div className="flex gap-2">
                <Button variant="default" onClick={loadData}>
                  Opnieuw laden
                </Button>
                <Button variant="outline" onClick={() => navigate(`/results/${assignment?.id}`)}>
                  Bekijk resultaten
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  const currentPair = pairs[currentIndex];
  const sortedAlphabetically = [currentPair.textA, currentPair.textB].sort((a, b) =>
    a.anonymizedName.localeCompare(b.anonymizedName),
  );
  const leftText = sortedAlphabetically[0];
  const rightText = sortedAlphabetically[1];
  const leftIsA = leftText.id === currentPair.textA.id;

  const progress = expectedTotal > 0 ? Math.min((totalJudgements / expectedTotal) * 100, 100) : 0;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b bg-card">
        <div className="max-w-7xl mx-auto p-4">
          <div className="flex items-center justify-between mb-4">
            <Button variant="ghost" onClick={() => navigate("/")}>
              <ArrowLeft className="w-4 h-4 mr-2" />
              Terug
            </Button>
            <HeaderNav />
          </div>

          <div className="mb-2">
            <h1 className="text-2xl font-bold">{assignment?.title}</h1>
            <p className="text-sm text-muted-foreground">
              {totalJudgements} vergelijkingen • doel ≈ {expectedTotal}
            </p>
          </div>

          <Progress value={progress} className="h-2" />
        </div>
      </div>

      {/* Comparison Area */}
      <div className="max-w-7xl mx-auto p-6">
        {/* Judgement Controls */}
        <Card className="shadow-lg mb-6">
          <CardContent className="p-6">
            <p className="text-lg font-medium mb-2">Welke tekst is beter?</p>
            <p className="text-sm text-muted-foreground mb-4">
              Kies de <strong>sterkere</strong> tekst. Bij twijfel: <em>Gelijkwaardig</em> (sneltoets T).
            </p>

            <div className="grid grid-cols-3 gap-4 mb-6">
              <Button
                size="lg"
                onClick={() => handleJudgement(leftIsA ? "A" : "B")}
                disabled={saving}
                className="h-20 text-lg bg-primary hover:bg-primary/90"
              >
                <div>
                  <div className="font-bold">{leftText.anonymizedName}</div>
                  <div className="text-xs opacity-80">Sneltoets: A</div>
                </div>
              </Button>

              <Button
                size="lg"
                variant="outline"
                onClick={() => handleJudgement("EQUAL")}
                disabled={saving}
                className="h-20 text-lg"
              >
                <div>
                  <div className="font-bold">Gelijkwaardig</div>
                  <div className="text-xs opacity-80">Sneltoets: T</div>
                </div>
              </Button>

              <Button
                size="lg"
                onClick={() => handleJudgement(leftIsA ? "B" : "A")}
                disabled={saving}
                className="h-20 text-lg bg-secondary hover:bg-secondary/90 text-secondary-foreground"
              >
                <div>
                  <div className="font-bold">{rightText.anonymizedName}</div>
                  <div className="text-xs opacity-80">Sneltoets: B</div>
                </div>
              </Button>
            </div>

            <div className="grid md:grid-cols-2 gap-4 pt-4">
              <div>
                <label className="text-sm font-medium text-muted-foreground">
                  Opmerking {leftText.anonymizedName} (optioneel)
                </label>
                <Textarea
                  value={commentLeft}
                  onChange={(e) => setCommentLeft(e.target.value)}
                  placeholder="Opmerking voor deze tekst..."
                  rows={3}
                  className="mt-2"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground">
                  Opmerking {rightText.anonymizedName} (optioneel)
                </label>
                <Textarea
                  value={commentRight}
                  onChange={(e) => setCommentRight(e.target.value)}
                  placeholder="Opmerking voor deze tekst..."
                  rows={3}
                  className="mt-2"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="grid md:grid-cols-2 gap-6">
          {/* Left */}
          <Card className="shadow-lg">
            <CardContent className="p-6 space-y-4">
              <div>
                <span className="inline-block px-3 py-1 bg-primary/10 text-primary rounded-full text-sm font-medium">
                  {leftText.anonymizedName}
                </span>
              </div>
              {leftText.content ? (
                <div className="prose prose-sm max-w-none">
                  <div className="whitespace-pre-wrap text-foreground leading-relaxed">{leftText.content}</div>
                </div>
              ) : (
                <div className="flex items-center justify-center h-48 border-2 border-dashed rounded-lg">
                  <p className="text-muted-foreground text-center px-4">
                    Bekijk de papieren tekst van
                    <br />
                    <strong className="text-foreground">{leftText.anonymizedName}</strong>
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Right */}
          <Card className="shadow-lg">
            <CardContent className="p-6 space-y-4">
              <div>
                <span className="inline-block px-3 py-1 bg-secondary/10 text-secondary-foreground rounded-full text-sm font-medium">
                  {rightText.anonymizedName}
                </span>
              </div>
              {rightText.content ? (
                <div className="prose prose-sm max-w-none">
                  <div className="whitespace-pre-wrap text-foreground leading-relaxed">{rightText.content}</div>
                </div>
              ) : (
                <div className="flex items-center justify-center h-48 border-2 border-dashed rounded-lg">
                  <p className="text-muted-foreground text-center px-4">
                    Bekijk de papieren tekst van
                    <br />
                    <strong className="text-foreground">{rightText.anonymizedName}</strong>
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default Compare;
