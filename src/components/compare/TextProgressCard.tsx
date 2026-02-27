import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { ChevronDown, ChevronUp } from "lucide-react";

interface TextProgressItem {
  textId: number;
  name: string;
  comparisons: number;
  se: number;
  status: "reliable" | "almost" | "needsWork";
}

const STATUS_COLORS = {
  reliable: "bg-green-500",
  almost: "bg-yellow-500",
  needsWork: "bg-red-500",
} as const;

const STATUS_BG = {
  reliable: "bg-green-100 dark:bg-green-900/30",
  almost: "bg-yellow-100 dark:bg-yellow-900/30",
  needsWork: "bg-red-100 dark:bg-red-900/30",
} as const;

export function TextProgressCard({ items }: { items: TextProgressItem[] }) {
  const [open, setOpen] = useState(false);

  if (items.length === 0) return null;

  const reliableCount = items.filter((i) => i.status === "reliable").length;
  const almostCount = items.filter((i) => i.status === "almost").length;
  const needsWorkCount = items.filter((i) => i.status === "needsWork").length;

  return (
    <Card className="mb-6">
      <button
        onClick={() => setOpen(!open)}
        className="w-full text-left px-4 py-3 flex items-center justify-between hover:bg-muted/50 rounded-lg transition-colors"
      >
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium">Voortgang per tekst</span>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            {reliableCount > 0 && (
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-green-500" />
                {reliableCount}
              </span>
            )}
            {almostCount > 0 && (
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-yellow-500" />
                {almostCount}
              </span>
            )}
            {needsWorkCount > 0 && (
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-red-500" />
                {needsWorkCount}
              </span>
            )}
          </div>
        </div>
        {open ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
      </button>

      {open && (
        <CardContent className="pt-0 px-4 pb-4">
          {/* Compact bar overview */}
          <div className="flex gap-0.5 h-3 rounded overflow-hidden mb-3">
            {items.map((item) => (
              <div
                key={item.textId}
                className={`flex-1 ${STATUS_COLORS[item.status]} transition-colors`}
                title={`${item.name}: ${item.comparisons} vergelijkingen`}
              />
            ))}
          </div>

          {/* Legend */}
          <div className="flex gap-4 text-xs text-muted-foreground mb-3">
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-green-500" /> Betrouwbaar
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-yellow-500" /> Bijna klaar
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-red-500" /> Meer nodig
            </span>
          </div>

          {/* Per-text list (only show texts that still need work, sorted worst-first) */}
          <div className="space-y-1 max-h-48 overflow-y-auto">
            {items.map((item) => (
              <div
                key={item.textId}
                className={`flex items-center justify-between px-2 py-1 rounded text-sm ${STATUS_BG[item.status]}`}
              >
                <span className="truncate mr-2">{item.name}</span>
                <span className="text-xs text-muted-foreground whitespace-nowrap">
                  {item.comparisons} vgl.
                </span>
              </div>
            ))}
          </div>
        </CardContent>
      )}
    </Card>
  );
}
