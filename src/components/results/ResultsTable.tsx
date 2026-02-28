// src/components/results/ResultsTable.tsx
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Eye, EyeOff, Anchor, ArrowUpDown, ArrowUp, ArrowDown, MessageSquare, HelpCircle } from "lucide-react";
import { ExportData } from "@/lib/export";
import type { Anchor as AnchorType } from "@/lib/db";

interface ResultsTableProps {
  results: ExportData[];
  anchors: AnchorType[];
  onSelectStudent: (name: string) => void;
  onOpenAnchorDialog: (textId: number, name: string, currentGrade: number) => void;
}

type SortColumn = 'rank' | 'name';
type SortDirection = 'asc' | 'desc';

function getLabelColor(label: string): string {
  switch (label) {
    case "Topgroep":
      return "bg-label-topgroep text-label-topgroep-foreground";
    case "Bovengemiddeld":
      return "bg-label-bovengemiddeld text-label-bovengemiddeld-foreground";
    case "Gemiddeld":
      return "bg-label-gemiddeld text-label-gemiddeld-foreground";
    case "Onder gemiddeld":
      return "bg-label-ondergemiddeld text-label-ondergemiddeld-foreground";
    case "Onvoldoende":
      return "bg-label-onvoldoende text-label-onvoldoende-foreground";
    default:
      return "bg-label-gemiddeld text-label-gemiddeld-foreground";
  }
}

function getReliabilityColor(reliability: string): string {
  if (reliability === "Resultaat betrouwbaar") return "text-secondary";
  if (reliability === "Nog enkele vergelijkingen nodig") return "text-primary";
  return "text-destructive";
}

export function ResultsTable({ results, anchors, onSelectStudent, onOpenAnchorDialog }: ResultsTableProps) {
  const [showDetails, setShowDetails] = useState(false);
  const [sortColumn, setSortColumn] = useState<SortColumn>('rank');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');

  const handleSort = (column: SortColumn) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
  };

  const getSortIcon = (column: SortColumn) => {
    if (sortColumn !== column) return <ArrowUpDown className="w-4 h-4 ml-1 inline" />;
    return sortDirection === 'asc'
      ? <ArrowUp className="w-4 h-4 ml-1 inline" />
      : <ArrowDown className="w-4 h-4 ml-1 inline" />;
  };

  const sortedResults = [...results].sort((a, b) => {
    if (sortColumn === 'name') {
      const comparison = a.anonymizedName.localeCompare(b.anonymizedName, 'nl');
      return sortDirection === 'asc' ? comparison : -comparison;
    }
    const comparison = a.rank - b.rank;
    return sortDirection === 'asc' ? comparison : -comparison;
  });

  const hasAnchors = anchors.length > 0;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Rangorde</CardTitle>
        <Button variant="outline" size="sm" onClick={() => setShowDetails(!showDetails)}>
          {showDetails ? (
            <>
              <EyeOff className="w-4 h-4 mr-2" />
              Verberg technische details
            </>
          ) : (
            <>
              <Eye className="w-4 h-4 mr-2" />
              Toon technische details
            </>
          )}
        </Button>
      </CardHeader>
      <CardContent>
        <p className="text-xs text-muted-foreground mb-3">Klik op een kolomkop om te sorteren. Klik op een tekst voor meer details.</p>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-16 cursor-pointer hover:bg-muted/50" onClick={() => handleSort('rank')}>
                Rang{getSortIcon('rank')}
              </TableHead>
              <TableHead className="cursor-pointer hover:bg-muted/50" onClick={() => handleSort('name')}>
                Tekst{getSortIcon('name')}
              </TableHead>
              <TableHead>Label</TableHead>
              <TableHead className="text-right">
                {hasAnchors ? 'Relatief cijfer' : 'Cijfer'}
              </TableHead>
              {hasAnchors && (
                <TableHead className="text-right">Geijkt cijfer</TableHead>
              )}
              {showDetails && (
                <>
                  <TableHead className="text-right">
                    <TooltipProvider delayDuration={200}>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="inline-flex items-center gap-1 cursor-help justify-end">
                            Theta (&theta;)
                            <HelpCircle className="w-3.5 h-3.5 text-muted-foreground" />
                          </span>
                        </TooltipTrigger>
                        <TooltipContent side="top">
                          <p className="max-w-xs">Geschatte kwaliteitsscore. Hoger = betere tekst. Het gemiddelde is 0.</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </TableHead>
                  <TableHead className="text-right">
                    <TooltipProvider delayDuration={200}>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="inline-flex items-center gap-1 cursor-help justify-end">
                            SE
                            <HelpCircle className="w-3.5 h-3.5 text-muted-foreground" />
                          </span>
                        </TooltipTrigger>
                        <TooltipContent side="top">
                          <p className="max-w-xs">Standaardfout: hoe zeker de score is. Lager = betrouwbaarder. Onder 0.75 is goed.</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </TableHead>
                  <TableHead className="text-right">
                    <TooltipProvider delayDuration={200}>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="inline-flex items-center gap-1 cursor-help justify-end">
                            Infit
                            <HelpCircle className="w-3.5 h-3.5 text-muted-foreground" />
                          </span>
                        </TooltipTrigger>
                        <TooltipContent side="top">
                          <p className="max-w-xs">Meet of beoordelaars het eens zijn over deze tekst. Rond 1.0 is normaal. Boven 1.3: beoordelaars twijfelen — bekijk de oordelen en overweeg extra vergelijkingen. Onder 0.7: iedereen is het opvallend eens, geen actie nodig.</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </TableHead>
                  <TableHead className="text-right">
                    <TooltipProvider delayDuration={200}>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="inline-flex items-center gap-1 cursor-help justify-end">
                            Beoordelingen
                            <HelpCircle className="w-3.5 h-3.5 text-muted-foreground" />
                          </span>
                        </TooltipTrigger>
                        <TooltipContent side="top">
                          <p className="max-w-xs">Hoeveel vergelijkingen deze tekst heeft gehad.</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </TableHead>
                </>
              )}
              <TableHead>
                <TooltipProvider delayDuration={200}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="inline-flex items-center gap-1 cursor-help">
                        Betrouwbaarheid
                        <HelpCircle className="w-3.5 h-3.5 text-muted-foreground" />
                      </span>
                    </TooltipTrigger>
                    <TooltipContent side="top">
                      <div className="max-w-xs space-y-1">
                        <p>Hoe zeker de score van deze tekst is, op basis van het aantal vergelijkingen:</p>
                        <p className="text-secondary">Groen = betrouwbaar</p>
                        <p className="text-primary">Geel = bijna klaar, nog een paar vergelijkingen nodig</p>
                        <p className="text-destructive">Rood = meer vergelijkingen nodig</p>
                      </div>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedResults.map((r) => {
              const isAnchor = anchors.some(a => a.textId === r.textId);
              return (
                <TableRow key={`${r.rank}-${r.anonymizedName}`} className="cursor-pointer hover:bg-muted/50" onClick={() => onSelectStudent(r.anonymizedName)}>
                  <TableCell className="font-bold text-lg">{r.rank}</TableCell>
                  <TableCell className="font-medium text-primary hover:underline">
                    <div className="flex items-center gap-2">
                      {r.anonymizedName}
                      {isAnchor && <Anchor className="w-3.5 h-3.5 text-primary" />}
                      {r.comments && <MessageSquare className="w-4 h-4 text-muted-foreground" />}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge className={getLabelColor(r.label)}>{r.label}</Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <span className={`font-bold text-lg ${hasAnchors ? 'text-muted-foreground' : ''}`}>
                        {r.grade.toFixed(1)}
                      </span>
                      <TooltipProvider delayDuration={200}>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              className={`p-1 rounded hover:bg-muted transition-colors ${isAnchor ? 'text-primary' : 'text-muted-foreground/40 hover:text-muted-foreground'}`}
                              onClick={(e) => {
                                e.stopPropagation();
                                if (r.textId != null) onOpenAnchorDialog(r.textId, r.anonymizedName, r.grade);
                              }}
                            >
                              <Anchor className="w-3.5 h-3.5" />
                            </button>
                          </TooltipTrigger>
                          <TooltipContent side="left">
                            <p className="max-w-xs">
                              {isAnchor
                                ? "Ijkpunt aanpassen — dit cijfer is vastgezet en wordt gebruikt om de rest te kalibreren"
                                : "Stel een vast cijfer in voor deze tekst. De andere cijfers worden daarop afgestemd. Handig als je weet welk cijfer een tekst verdient."}
                            </p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>
                  </TableCell>
                  {hasAnchors && (
                    <TableCell className="text-right font-bold text-lg text-primary">
                      {r.anchoredGrade != null ? r.anchoredGrade.toFixed(1) : '–'}
                    </TableCell>
                  )}
                  {showDetails && (
                    <>
                      <TableCell className="text-right font-mono text-sm">{r.theta.toFixed(3)}</TableCell>
                      <TableCell className="text-right font-mono text-sm">{r.standardError.toFixed(3)}</TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        <span className={r.infit != null && (r.infit > 1.3 || r.infit < 0.7) ? 'text-amber-600 dark:text-amber-400 font-medium' : ''}>
                          {r.infit != null ? r.infit.toFixed(2) : '–'}
                        </span>
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">{r.judgementCount}</TableCell>
                    </>
                  )}
                  <TableCell>
                    <span className={getReliabilityColor(r.reliability)}>{r.reliability}</span>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
