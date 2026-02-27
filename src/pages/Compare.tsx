// src/pages/Compare.tsx
import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { ArrowLeft, Info, AlertTriangle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { HeaderNav } from "@/components/HeaderNav";
import { TextCard } from "@/components/compare/TextCard";
import { TextProgressCard } from "@/components/compare/TextProgressCard";
import { useCompareData, useRaterIdentification } from "@/hooks/use-compare-data";

const Compare = () => {
  const navigate = useNavigate();

  // Rater identification
  const { raterName, raterId, raterNameInput, setRaterNameInput, showRaterPrompt, handleRaterNameSubmit } = useRaterIdentification();

  // Core data + logic
  const {
    assignment,
    pairs,
    currentIndex,
    loading,
    saving,
    totalJudgements,
    expectedTotal,
    reliabilityAdvice,
    tieRate,
    textProgress,
    handleJudgement: rawHandleJudgement,
    loadData,
  } = useCompareData(raterId, raterName);

  // Local UI state for comments
  const [commentLeft, setCommentLeft] = useState("");
  const [commentRight, setCommentRight] = useState("");
  const [isFinal, setIsFinal] = useState(false);

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

  // ─── No pairs ───
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
        </div>
      </div>
    );
  }

  // ─── Main comparison UI ───
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
              {totalJudgements} van ca. {expectedTotal} vergelijkingen gedaan
              {raterName && <> • beoordelaar: <strong>{raterName}</strong></>}
            </p>
          </div>
          <Progress value={progress} className="h-2" />
        </div>
      </div>

      {/* Comparison Area */}
      <div className="max-w-7xl mx-auto p-6">
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

        {/* Per-text progress (PLAN-10) */}
        {textProgress.length > 0 && <TextProgressCard items={textProgress} />}

        {/* Choice buttons + comments */}
        <Card className="shadow-lg mb-6">
          <CardContent className="p-6">
            <p className="text-lg font-medium mb-2">Welke tekst is beter?</p>
            <p className="text-sm text-muted-foreground mb-4">
              Kies de <strong>betere</strong> tekst, ook als het verschil klein is. Alleen <em>Gelijkwaardig</em> (sneltoets T) als ze echt even goed zijn.
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
    </div>
  );
};

export default Compare;
