// src/components/results/AnchorInfoCard.tsx
import { Anchor, X } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { Anchor as AnchorType } from "@/lib/db";

interface AnchorInfoCardProps {
  anchors: AnchorType[];
  onClearAll: () => void;
}

export function AnchorInfoCard({ anchors, onClearAll }: AnchorInfoCardProps) {
  if (anchors.length === 0) return null;

  return (
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
          <Button variant="ghost" size="sm" onClick={onClearAll} className="text-muted-foreground hover:text-destructive">
            <X className="w-4 h-4 mr-1" />
            Wis ijkpunten
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
