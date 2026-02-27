// src/components/results/DisagreementsCard.tsx
import { useState } from "react";
import { AlertCircle, ChevronDown, ChevronUp } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { RaterAnalysis } from "@/lib/rater-analysis";

interface DisagreementsCardProps {
  raterAnalysis: RaterAnalysis;
}

export function DisagreementsCard({ raterAnalysis }: DisagreementsCardProps) {
  const [expanded, setExpanded] = useState(false);

  if (raterAnalysis.disagreements.length === 0) return null;

  return (
    <Card className="mb-6">
      <CardContent className="p-6">
        <button
          className="flex items-center gap-2 w-full text-left"
          onClick={() => setExpanded(!expanded)}
        >
          <AlertCircle className="w-5 h-5 text-amber-500" />
          <h3 className="font-semibold text-lg flex-1">
            Meningsverschillen ({raterAnalysis.disagreements.length})
          </h3>
          {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>

        {expanded && (
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
  );
}
