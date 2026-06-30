// src/components/results/ReliabilityCard.tsx
import { CheckCircle, AlertCircle, XCircle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { SE_RELIABLE, SE_MAX_EDGE, COHORT_PCT_RELIABLE, COHORT_MEDIAN_OK } from "@/lib/constants";
import { ExportData } from "@/lib/export";
import type { SplitHalfResult } from "@/lib/split-half";

interface ReliabilityCardProps {
  results: ExportData[];
  splitHalf?: SplitHalfResult | null;
  graphConnected?: boolean;
}

export function ReliabilityCard({ results, splitHalf, graphConnected = true }: ReliabilityCardProps) {
  const n = results.length;
  if (n === 0) return null;

  const seList = results.map(r => r.standardError).sort(compareStandardErrors);
  const medianSE = n % 2 === 1 ? seList[(n - 1) / 2] : (seList[n / 2 - 1] + seList[n / 2]) / 2;
  const maxSE = seList[n - 1];

  const countReliable = results.filter(r => r.standardError <= SE_RELIABLE).length;
  const countModerate = results.filter(r => r.standardError > SE_RELIABLE && r.standardError <= 1.00).length;
  const countInsufficient = results.filter(r => r.standardError > 1.00).length;

  const pctReliable = (countReliable / n) * 100;
  const pctModerate = (countModerate / n) * 100;
  const pctInsufficient = (countInsufficient / n) * 100;

  const cohortCriterionMet = medianSE <= COHORT_MEDIAN_OK && maxSE <= SE_MAX_EDGE;
  const individualCriterionMet = pctReliable >= COHORT_PCT_RELIABLE;
  const stopAdvice = individualCriterionMet || cohortCriterionMet;

  let reliabilityText: string;
  let reliabilityStatus: 'insufficient' | 'moderate' | 'reliable';
  let ReliabilityIcon: typeof CheckCircle;

  if (!graphConnected) {
    reliabilityStatus = 'insufficient';
    reliabilityText = 'Nog niet genoeg vergelijkingen - ga verder met beoordelen';
    ReliabilityIcon = XCircle;
  } else if (stopAdvice) {
    reliabilityStatus = 'reliable';
    reliabilityText = 'Resultaten zijn betrouwbaar — je kunt stoppen met beoordelen';
    ReliabilityIcon = CheckCircle;
  } else if (medianSE <= 1.00) {
    reliabilityStatus = 'moderate';
    reliabilityText = 'Bijna klaar — nog een paar vergelijkingen nodig';
    ReliabilityIcon = AlertCircle;
  } else {
    reliabilityStatus = 'insufficient';
    reliabilityText = 'Nog niet genoeg vergelijkingen — ga verder met beoordelen';
    ReliabilityIcon = XCircle;
  }

  const iconColor = reliabilityStatus === "reliable"
    ? "text-secondary"
    : reliabilityStatus === "moderate"
      ? "text-primary"
      : "text-destructive";

  const borderClass = reliabilityStatus === 'reliable'
    ? 'border-l-4 border-l-[hsl(var(--secondary))]'
    : reliabilityStatus === 'moderate'
      ? 'border-l-4 border-l-[hsl(var(--primary))]'
      : 'border-l-4 border-l-[hsl(var(--destructive))]';

  return (
    <Card className={`mb-6 ${borderClass}`}>
      <CardContent className="p-6">
        <div className="flex items-center gap-3 mb-4">
          <ReliabilityIcon className={`w-5 h-5 ${iconColor}`} />
          <div className="flex-1">
            <h3 className="font-semibold text-lg">{reliabilityText}</h3>
            {!graphConnected ? (
              <p className="text-sm text-muted-foreground">
                Niet alle teksten zijn onderling verbonden via vergelijkingen. Voeg meer vergelijkingen toe zodat elke tekst in de rangorde kan worden geplaatst.
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">
                {Math.round(pctReliable)}% van de teksten heeft een betrouwbare score
                {countInsufficient > 0 && <> • {countInsufficient} tekst{countInsufficient !== 1 ? 'en' : ''} nog onvoldoende vergeleken</>}
              </p>
            )}
          </div>
        </div>

        {/* Progress bar — only meaningful when the comparison graph is connected */}
        {!graphConnected ? null : cohortCriterionMet && !individualCriterionMet ? (
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

        {/* Legend for progress bar colors — only shown when progress bar is visible */}
        {graphConnected && (
          <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <span className="inline-block w-3 h-3 rounded-sm bg-secondary" />
              Betrouwbaar
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block w-3 h-3 rounded-sm bg-primary" />
              Bijna klaar
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block w-3 h-3 rounded-sm bg-destructive" />
              Meer nodig
            </span>
          </div>
        )}

        {/* PLAN-13: Split-half reliability coefficient */}
        {splitHalf && (
          <div className="mt-4 pt-3 border-t">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Betrouwbaarheidscoëfficiënt (split-half)</span>
              <span className={`text-sm font-semibold ${
                splitHalf.coefficient >= 0.8
                  ? 'text-secondary'
                  : splitHalf.coefficient >= 0.6
                    ? 'text-primary'
                    : 'text-destructive'
              }`}>
                {splitHalf.coefficient.toFixed(2)}
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {splitHalf.coefficient >= 0.8
                ? 'Hoge betrouwbaarheid — de rangorde is stabiel over verschillende deelverzamelingen.'
                : splitHalf.coefficient >= 0.6
                  ? 'Redelijke betrouwbaarheid — meer vergelijkingen zullen de rangorde stabieler maken.'
                  : 'Lage betrouwbaarheid — de rangorde verandert nog sterk bij andere deelverzamelingen.'}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function compareStandardErrors(a: number, b: number): number {
  const normalizedA = Number.isNaN(a) ? Infinity : a;
  const normalizedB = Number.isNaN(b) ? Infinity : b;

  if (normalizedA === normalizedB) return 0;
  return normalizedA < normalizedB ? -1 : 1;
}
