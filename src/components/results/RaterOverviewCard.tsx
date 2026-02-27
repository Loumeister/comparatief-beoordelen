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
  const [expanded, setExpanded] = useState(false);

  if (raterAnalysis.uniqueRaterCount <= 1) return null;

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
          {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>

        {expanded && (
          <div className="mt-4">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Beoordelaar</TableHead>
                  <TableHead className="text-right">Oordelen</TableHead>
                  <TableHead className="text-right">Overeenstemming</TableHead>
                  <TableHead className="text-right">Gelijkwaardig-rate</TableHead>
                  <TableHead className="text-right">Consistentie</TableHead>
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
                        <>
                          <span className={r.infit > 1.2 ? 'text-destructive font-medium' : ''}>
                            {r.infit.toFixed(2)}
                          </span>
                          <span className={`text-xs ml-1 ${r.infit > 1.2 ? 'text-destructive' : 'text-muted-foreground'}`}>
                            ({r.infitLabel})
                          </span>
                        </>
                      ) : (
                        <span className="text-xs text-muted-foreground">te weinig data</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <p className="text-xs text-muted-foreground mt-3">
              Overeenstemming = % oordelen dat overeenkomt met de gezamenlijke rangorde. Gelijkwaardig boven 40% kan de nauwkeurigheid verlagen. Consistentie (infit) meet hoe voorspelbaar de oordelen zijn — waarden boven 1.2 wijzen op onregelmatige patronen.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
