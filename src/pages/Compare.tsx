// src/pages/Compare.tsx
import { useEffect, useState, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Info, AlertTriangle, ChevronDown, ChevronRight, Shuffle, ClipboardList, RotateCcw } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ToastAction } from "@/components/ui/toast";
import { HeaderNav } from "@/components/HeaderNav";
import { TextCard } from "@/components/compare/TextCard";
import { TextProgressCard } from "@/components/compare/TextProgressCard";
import { MyJudgementsDialog } from "@/components/compare/MyJudgementsDialog";
import { useCompareData, useRaterIdentification } from "@/hooks/use-compare-data";
import { useToast } from "@/hooks/use-toast";

const Compare = () => {
  const navigate = useNavigate();

  // Rater identification
  const { raterName, raterId, raterNameInput, setRaterNameInput, showRaterPrompt, handleRaterNameSubmit } = useRaterIdentification();

  const { toast } = useToast();

  // Core data + logic
  const {
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
    myJudgements,
    lastJudgementId,
    handleJudgement: rawHandleJudgement,
    saveManualJudgement,
    undoLastJudgement,
    loadData,
  } = useCompareData(raterId, raterName);

  // Local UI state for comments
  const [commentLeft, setCommentLeft] = useState("");
  const [commentRight, setCommentRight] = useState("");
  const [isFinal, setIsFinal] = useState(false);

  // Manual pair selection state
  const [manualOpen, setManualOpen] = useState(false);
  const [manualTextAId, setManualTextAId] = useState<string>("");
  const [manualTextBId, setManualTextBId] = useState<string>("");
  const [manualActive, setManualActive] = useState(false);

  // Revision state (PLAN-19)
  const [supersedesId, setSupersedesId] = useState<number | undefined>();
  const [myJudgementsOpen, setMyJudgementsOpen] = useState(false);

  // Undo timer ref
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Show undo toast after judgement (PLAN-19)
  const showUndoToast = useCallback((judgementId: number) => {
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    const { dismiss } = toast({
      title: "Oordeel opgeslagen",
      action: (
        <ToastAction altText="Ongedaan maken" onClick={() => {
          if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
          void undoLastJudgement(judgementId);
        }}>
          Ongedaan maken
        </ToastAction>
      ),
      duration: 5000,
    });
    undoTimerRef.current = setTimeout(() => { dismiss(); undoTimerRef.current = null; }, 5000);
  }, [toast, undoLastJudgement]);

  // Wrap handleJudgement to include local comment state
  const handleJudgement = useCallback(
    async (winner: "A" | "B" | "EQUAL") => {
      await rawHandleJudgement(winner, commentLeft, commentRight, isFinal);
      setCommentLeft("");
      setCommentRight("");
      setIsFinal(false);
    },
    [rawHandleJudgement, commentLeft, commentRight, isFinal],
  );

  // Show undo toast when a new judgement is saved
  useEffect(() => {
    if (lastJudgementId) showUndoToast(lastJudgementId);
  }, [lastJudgementId, showUndoToast]);

  // Handle manual pair judgement
  const handleManualJudgement = useCallback(
    async (winner: "A" | "B" | "EQUAL") => {
      const aId = Number(manualTextAId);
      const bId = Number(manualTextBId);
      if (!aId || !bId || aId === bId) return;

      // Map winner relative to display order (left/right sorted alphabetically)
      const textA = allTexts.find(t => t.id === aId);
      const textB = allTexts.find(t => t.id === bId);
      if (!textA || !textB) return;

      const sorted = [textA, textB].sort((a, b) => a.anonymizedName.localeCompare(b.anonymizedName));
      const leftIsA = sorted[0].id === aId;

      // Comments are always left/right in display; map to A/B
      const commentA = leftIsA ? commentLeft.trim() : commentRight.trim();
      const commentB = leftIsA ? commentRight.trim() : commentLeft.trim();

      await saveManualJudgement(aId, bId, winner, commentA, commentB, isFinal, supersedesId);
      setCommentLeft("");
      setCommentRight("");
      setIsFinal(false);
      setManualActive(false);
      setManualTextAId("");
      setManualTextBId("");
      setSupersedesId(undefined);
    },
    [manualTextAId, manualTextBId, allTexts, commentLeft, commentRight, isFinal, saveManualJudgement, supersedesId],
  );

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target?.tagName === "INPUT" || target?.tagName === "TEXTAREA" || target?.tagName === "SELECT") return;

      const handler = manualActive ? handleManualJudgement : handleJudgement;
      if (e.key === "a" || e.key === "A") {
        void handler("A");
      } else if (e.key === "b" || e.key === "B") {
        void handler("B");
      } else if (e.key === "t" || e.key === "T") {
        void handler("EQUAL");
      }
    };

    window.addEventListener("keydown", handleKeyPress);
    return () => window.removeEventListener("keydown", handleKeyPress);
  }, [handleJudgement, handleManualJudgement, manualActive]);

  // ─── Rater prompt ───
  if (showRaterPrompt) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Card className="shadow-lg max-w-md w-full mx-4">
          <CardContent className="p-6 space-y-4">
            <h2 className="text-xl font-bold">Wie beoordeelt er?</h2>
            <p className="text-sm text-muted-foreground">
              Beoordeel je <strong>alleen</strong>? Klik dan direct op de knop hieronder — je hoeft niets in te vullen.
            </p>
            <p className="text-sm text-muted-foreground">
              Beoordelen jullie met <strong>meerdere collega's</strong>? Vul dan je naam in, zodat de app bijhoudt wie welk oordeel gaf.
            </p>
            <Input
              value={raterNameInput}
              onChange={(e) => setRaterNameInput(e.target.value)}
              placeholder="Alleen nodig bij meerdere beoordelaars"
              onKeyDown={(e) => { if (e.key === 'Enter') handleRaterNameSubmit(); }}
            />
            <div className="flex gap-2">
              <Button onClick={handleRaterNameSubmit} className="flex-1" size="lg">
                {raterNameInput.trim() ? 'Start met beoordelen' : 'Start met beoordelen'}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Je naam wordt alleen lokaal op deze computer opgeslagen.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ─── Loading ───
  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground">Laden...</p>
      </div>
    );
  }

  // ─── Manual pair selector (shared component) ───
  const sortedTexts = [...allTexts].sort((a, b) => a.anonymizedName.localeCompare(b.anonymizedName));
  const manualPairValid = manualTextAId && manualTextBId && manualTextAId !== manualTextBId;

  const manualPairSelector = allTexts.length >= 2 && (
    <Card className="mb-6">
      <CardContent className="p-4">
        <button
          onClick={() => setManualOpen(!manualOpen)}
          className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground w-full"
        >
          {manualOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          <Shuffle className="w-4 h-4" />
          Kies zelf een paar
        </button>
        {manualOpen && (
          <div className="mt-3 space-y-3">
            <p className="text-xs text-muted-foreground">
              Kies twee teksten om handmatig te vergelijken. Het oordeel telt gewoon mee voor de ranglijst.
            </p>
            <div className="flex flex-col sm:flex-row gap-2 items-start sm:items-end">
              <div className="flex-1 w-full">
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Tekst A</label>
                <Select value={manualTextAId} onValueChange={setManualTextAId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Kies een tekst..." />
                  </SelectTrigger>
                  <SelectContent>
                    {sortedTexts.map(t => (
                      <SelectItem key={t.id} value={String(t.id!)} disabled={String(t.id!) === manualTextBId}>
                        {t.anonymizedName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex-1 w-full">
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Tekst B</label>
                <Select value={manualTextBId} onValueChange={setManualTextBId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Kies een tekst..." />
                  </SelectTrigger>
                  <SelectContent>
                    {sortedTexts.map(t => (
                      <SelectItem key={t.id} value={String(t.id!)} disabled={String(t.id!) === manualTextAId}>
                        {t.anonymizedName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button
                onClick={() => setManualActive(true)}
                disabled={!manualPairValid}
                className="shrink-0"
              >
                Vergelijk
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );

  // ─── No pairs ───
  if (pairs.length === 0 && !manualActive) {
    return (
      <div className="min-h-screen bg-background">
        <div className="border-b bg-card">
          <div className="max-w-7xl mx-auto p-4">
            <div className="flex items-center justify-between mb-4 gap-2">
              <Button variant="ghost" onClick={() => navigate("/")}>
                <ArrowLeft className="w-4 h-4 mr-2" />
                Terug
              </Button>
              <div className="flex items-center gap-2 flex-shrink-0">
                {myJudgements.length > 0 && (
                  <Button variant="outline" size="sm" onClick={() => setMyJudgementsOpen(true)}>
                    <ClipboardList className="w-4 h-4 mr-1" />
                    <span className="hidden sm:inline">Mijn oordelen </span>
                    ({myJudgements.length})
                  </Button>
                )}
                <HeaderNav />
              </div>
            </div>
            <h1 className="text-xl sm:text-2xl font-bold">{assignment?.title}</h1>
          </div>
        </div>
        <div className="max-w-3xl mx-auto p-8">
          <Card className="shadow-lg">
            <CardContent className="p-6 space-y-4">
              <p className="text-lg font-medium">Alle teksten zijn vergeleken</p>
              <p className="text-sm text-muted-foreground">
                Er zijn geen nieuwe vergelijkingen meer nodig. Dit kan betekenen:
              </p>
              <ul className="text-sm text-muted-foreground list-disc ml-5 space-y-1">
                <li>Alle teksten zijn voldoende met elkaar vergeleken</li>
                <li>Of er zijn nog maar 1 of 0 teksten — voeg er meer toe via het dashboard</li>
              </ul>
              <p className="text-sm text-muted-foreground">
                Je kunt nu de resultaten bekijken, of probeer opnieuw te laden als je denkt dat er nog vergelijkingen open staan.
              </p>
              <div className="flex gap-2">
                <Button variant="default" onClick={() => navigate(`/results/${assignment?.id}`)}>
                  Bekijk resultaten
                </Button>
                <Button variant="outline" onClick={loadData}>
                  Opnieuw laden
                </Button>
              </div>
            </CardContent>
          </Card>
          <div className="mt-6">{manualPairSelector}</div>
        </div>

        {/* My Judgements dialog (PLAN-19) */}
        <MyJudgementsDialog
          open={myJudgementsOpen}
          onOpenChange={setMyJudgementsOpen}
          judgements={myJudgements}
          allTexts={allTexts}
          onRevise={(textAId, textBId, oldJudgementId) => {
            setManualTextAId(String(textAId));
            setManualTextBId(String(textBId));
            setSupersedesId(oldJudgementId);
            setManualActive(true);
            setManualOpen(false);
          }}
        />
      </div>
    );
  }

  // ─── Main comparison UI ───
  // Determine which pair to show: manual or algorithm
  let displayTextA: typeof allTexts[0];
  let displayTextB: typeof allTexts[0];
  let isManualPair = false;

  if (manualActive && manualPairValid) {
    const a = allTexts.find(t => t.id === Number(manualTextAId));
    const b = allTexts.find(t => t.id === Number(manualTextBId));
    if (a && b) {
      displayTextA = a;
      displayTextB = b;
      isManualPair = true;
    } else {
      displayTextA = pairs[currentIndex].textA;
      displayTextB = pairs[currentIndex].textB;
    }
  } else {
    displayTextA = pairs[currentIndex].textA;
    displayTextB = pairs[currentIndex].textB;
  }

  const sortedAlphabetically = [displayTextA, displayTextB].sort((a, b) =>
    a.anonymizedName.localeCompare(b.anonymizedName),
  );
  const leftText = sortedAlphabetically[0];
  const rightText = sortedAlphabetically[1];
  const leftIsA = leftText.id === displayTextA.id;
  const progress = expectedTotal > 0 ? Math.min((totalJudgements / expectedTotal) * 100, 100) : 0;
  const activeHandler = isManualPair ? handleManualJudgement : handleJudgement;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b bg-card">
        <div className="max-w-7xl mx-auto p-4">
          <div className="flex items-center justify-between mb-4 gap-2">
            <Button variant="ghost" onClick={() => navigate("/")}>
              <ArrowLeft className="w-4 h-4 mr-2" />
              Terug
            </Button>
            <div className="flex items-center gap-2 flex-shrink-0">
              {myJudgements.length > 0 && (
                <Button variant="outline" size="sm" onClick={() => setMyJudgementsOpen(true)}>
                  <ClipboardList className="w-4 h-4 mr-1" />
                  <span className="hidden sm:inline">Mijn oordelen </span>
                  ({myJudgements.length})
                </Button>
              )}
              <HeaderNav />
            </div>
          </div>
          <div className="mb-2">
            <h1 className="text-xl sm:text-2xl font-bold">{assignment?.title}</h1>
            <p className="text-sm text-muted-foreground">
              {totalJudgements} van ca. {expectedTotal} vergelijkingen gedaan
              {raterName && <> • beoordelaar: <strong>{raterName}</strong></>}
            </p>
          </div>
          <Progress value={progress} className="h-2" />
        </div>
      </div>

      {/* Comparison Area */}
      <div className="max-w-7xl mx-auto p-3 sm:p-6">
        {/* Reliability advice */}
        {reliabilityAdvice && reliabilityAdvice.corePercentage > 80 && (
          <Alert
            className={`mb-6 ${reliabilityAdvice.isReliable ? "bg-green-50 dark:bg-green-950 border-green-200 dark:border-green-800" : "bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-800"}`}
          >
            <Info className="h-4 w-4" />
            <AlertDescription className="ml-2">
              <div className="font-medium mb-1">
                {reliabilityAdvice.isReliable
                  ? "✓ Advies: Resultaten zijn betrouwbaar"
                  : "ℹ️ Advies: Meer vergelijkingen aanbevolen"}
              </div>
              <div className="text-sm text-muted-foreground">
                {reliabilityAdvice.message} Je kunt altijd doorgaan met beoordelen of{" "}
                <button
                  onClick={() => navigate(`/results/${assignment?.id}`)}
                  className="underline hover:text-foreground"
                >
                  bekijk de huidige resultaten
                </button>
                .
              </div>
            </AlertDescription>
          </Alert>
        )}

        {/* Tie rate nudge (PLAN-9) */}
        {tieRate > 0.4 && (
          <Alert className="mb-6 bg-amber-50 dark:bg-amber-950 border-amber-200 dark:border-amber-800">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription className="ml-2">
              <div className="text-sm">
                <strong>Tip:</strong> Je kiest vaak "Gelijkwaardig" ({Math.round(tieRate * 100)}%). Probeer vaker een keuze te maken, ook als het verschil klein is. Dat maakt de resultaten nauwkeuriger.
              </div>
            </AlertDescription>
          </Alert>
        )}

        {/* Manual pair selector */}
        {!isManualPair && manualPairSelector}

        {/* Per-text progress (PLAN-10) */}
        {textProgress.length > 0 && !isManualPair && <TextProgressCard items={textProgress} />}

        {/* Manual pair / revision indicator */}
        {isManualPair && (
          <Alert className={`mb-6 ${supersedesId ? "bg-amber-50 dark:bg-amber-950 border-amber-200 dark:border-amber-800" : "bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-800"}`}>
            {supersedesId ? <RotateCcw className="h-4 w-4" /> : <Shuffle className="h-4 w-4" />}
            <AlertDescription className="ml-2 flex items-center justify-between">
              <span className="text-sm">
                {supersedesId
                  ? <>Je <strong>herziet</strong> een eerder oordeel. Het nieuwe oordeel vervangt het oude.</>
                  : <>Je vergelijkt nu een <strong>zelf gekozen paar</strong>. Het oordeel telt gewoon mee.</>}
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => { setManualActive(false); setManualTextAId(""); setManualTextBId(""); setSupersedesId(undefined); }}
              >
                Annuleren
              </Button>
            </AlertDescription>
          </Alert>
        )}

        {/* Choice buttons + comments */}
        <Card className="shadow-lg mb-6">
          <CardContent className="p-6">
            <p className="text-lg font-medium mb-2">Welke tekst is beter?</p>
            <p className="text-sm text-muted-foreground mb-4">
              Kies de <strong>betere</strong> tekst, ook als het verschil klein is. Alleen <em>Gelijkwaardig</em> (sneltoets T) als ze echt even goed zijn.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
              <Button
                size="lg"
                onClick={() => activeHandler(leftIsA ? "A" : "B")}
                disabled={saving}
                className="h-16 sm:h-20 text-base sm:text-lg bg-primary hover:bg-primary/90"
              >
                <div>
                  <div className="font-bold">{leftText.anonymizedName}</div>
                  <div className="text-xs opacity-80 hidden sm:block">Sneltoets: A</div>
                </div>
              </Button>

              <Button
                size="lg"
                variant="outline"
                onClick={() => activeHandler("EQUAL")}
                disabled={saving}
                className="h-14 sm:h-20 text-base sm:text-lg order-last sm:order-none"
              >
                <div>
                  <div className="font-bold">Gelijkwaardig</div>
                  <div className="text-xs opacity-80 hidden sm:block">Sneltoets: T</div>
                </div>
              </Button>

              <Button
                size="lg"
                onClick={() => activeHandler(leftIsA ? "B" : "A")}
                disabled={saving}
                className="h-16 sm:h-20 text-base sm:text-lg bg-secondary hover:bg-secondary/90 text-secondary-foreground"
              >
                <div>
                  <div className="font-bold">{rightText.anonymizedName}</div>
                  <div className="text-xs opacity-80 hidden sm:block">Sneltoets: B</div>
                </div>
              </Button>
            </div>

            <div className="grid md:grid-cols-2 gap-4 pt-4 border-t">
              <div>
                <label className="text-sm font-medium text-muted-foreground">
                  Opmerking {leftText.anonymizedName} (optioneel)
                </label>
                <Textarea
                  value={commentLeft}
                  onChange={(e) => setCommentLeft(e.target.value)}
                  placeholder="Bijv. 'goede opbouw' of 'veel spelfouten'..."
                  rows={2}
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
                  placeholder="Bijv. 'goede opbouw' of 'veel spelfouten'..."
                  rows={2}
                  className="mt-2"
                />
              </div>
              <p className="text-xs text-muted-foreground md:col-span-2">
                Opmerkingen zijn voor jezelf — ze verschijnen later bij de resultaten per leerling. Ze tellen niet mee voor het cijfer.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Text cards */}
        <div className="grid md:grid-cols-2 gap-6">
          <TextCard text={leftText} colorClass="bg-primary/10 text-primary" />
          <TextCard text={rightText} colorClass="bg-secondary/10 text-secondary-foreground" />
        </div>
      </div>

      {/* My Judgements dialog (PLAN-19) */}
      <MyJudgementsDialog
        open={myJudgementsOpen}
        onOpenChange={setMyJudgementsOpen}
        judgements={myJudgements}
        allTexts={allTexts}
        onRevise={(textAId, textBId, oldJudgementId) => {
          setManualTextAId(String(textAId));
          setManualTextBId(String(textBId));
          setSupersedesId(oldJudgementId);
          setManualActive(true);
          setManualOpen(false);
        }}
      />
    </div>
  );
};

export default Compare;
