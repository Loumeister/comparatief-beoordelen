// src/components/results/RaterOverviewCard.tsx
import { useState } from "react";
import { Users, ChevronDown, ChevronUp } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { RaterAnalysis } from "@/lib/rater-analysis";

interface RaterOverviewCardProps {
  raterAnalysis: RaterAnalysis;
}

export function RaterOverviewCard({ raterAnalysis }: RaterOverviewCardProps) {
  // Expanded by default when there are multiple raters — teachers should see this
  const [expanded, setExpanded] = useState(raterAnalysis.uniqueRaterCount > 1);

  if (raterAnalysis.uniqueRaterCount <= 1) return null;

  // Check if any rater has notably low agreement for a summary callout
  const lowAgreementRaters = raterAnalysis.raterStats.filter(r => r.modelAgreement < 0.6);
  const highTieRaters = raterAnalysis.raterStats.filter(r => r.tieRate > 0.4);

  return (
    <Card className="mb-6">
      <CardContent className="p-6">
        <button
          className="flex items-center gap-2 w-full text-left"
          onClick={() => setExpanded(!expanded)}
        >
          <Users className="w-5 h-5 text-primary" />
          <h3 className="font-semibold text-lg flex-1">
            Beoordelaarsoverzicht ({raterAnalysis.uniqueRaterCount} beoordelaars)
          </h3>
          {expanded ? <ChevronUp className="w-4 h-4 no-print" /> : <ChevronDown className="w-4 h-4 no-print" />}
        </button>

        {expanded && (
          <div className="mt-4 space-y-4">
            {/* Summary callouts */}
            {lowAgreementRaters.length > 0 && (
              <div className="text-sm bg-destructive/10 border border-destructive/20 rounded-lg p-3">
                <strong>Let op:</strong>{" "}
                {lowAgreementRaters.map(r => r.raterName).join(", ")} wijk{lowAgreementRaters.length === 1 ? "t" : "en"} sterk af van de gezamenlijke rangorde. Bespreek dit samen.
              </div>
            )}
            {highTieRaters.length > 0 && lowAgreementRaters.length === 0 && (
              <div className="text-sm bg-amber-500/10 border border-amber-500/20 rounded-lg p-3">
                <strong>Tip:</strong>{" "}
                {highTieRaters.map(r => r.raterName).join(", ")} kiest{highTieRaters.length === 1 ? "" : "en"} vaak &ldquo;Gelijkwaardig&rdquo;. Probeer vaker een keuze te maken — dat maakt de uitslag nauwkeuriger.
              </div>
            )}

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Beoordelaar</TableHead>
                  <TableHead className="text-right">Oordelen</TableHead>
                  <TableHead className="text-right">Eens met groep</TableHead>
                  <TableHead className="text-right">Gelijkwaardig</TableHead>
                  <TableHead className="text-right">Patroon</TableHead>
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
                    <TableCell className="text-right">
                      {r.infit != null ? (
                        <span className={r.infit > 1.2 ? 'text-destructive font-medium' : 'text-muted-foreground'}>
                          {r.infitLabel}
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">te weinig data</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <p className="text-xs text-muted-foreground">
              <strong>Eens met groep</strong> = hoe vaak koos deze beoordelaar hetzelfde als de gezamenlijke rangorde.{" "}
              <strong>Gelijkwaardig</strong> = hoe vaak werd "Gelijkwaardig" gekozen (boven 40% kan de nauwkeurigheid verlagen).{" "}
              <strong>Patroon</strong> = of de oordelen consistent zijn.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
