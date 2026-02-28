import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { RotateCcw } from 'lucide-react';
import type { Judgement, Text } from '@/lib/db';

interface MyJudgementsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  judgements: Judgement[];
  allTexts: Text[];
  onRevise: (textAId: number, textBId: number, oldJudgementId: number) => void;
}

export function MyJudgementsDialog({
  open,
  onOpenChange,
  judgements,
  allTexts,
  onRevise,
}: MyJudgementsDialogProps) {
  const textMap = new Map(allTexts.map(t => [t.id!, t.anonymizedName]));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle>Mijn oordelen ({judgements.length})</DialogTitle>
        </DialogHeader>

        <ScrollArea className="h-[400px] border rounded-lg">
          <div className="p-4 space-y-2">
            {judgements.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">
                Je hebt nog geen oordelen gegeven.
              </p>
            ) : (
              judgements.map((j) => {
                const nameA = textMap.get(j.textAId) ?? 'Onbekend';
                const nameB = textMap.get(j.textBId) ?? 'Onbekend';
                const winnerLabel =
                  j.winner === 'A' ? nameA :
                  j.winner === 'B' ? nameB : 'Gelijkwaardig';
                const hasComments = !!(j.commentA || j.commentB);

                return (
                  <div key={j.id} className="p-3 border rounded-lg hover:bg-muted/50 transition-colors">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm">
                          {nameA} vs {nameB}
                        </div>
                        <div className="flex items-center gap-2 mt-1">
                          <Badge
                            variant={j.winner === 'EQUAL' ? 'secondary' : 'default'}
                            className="text-xs"
                          >
                            {winnerLabel}
                          </Badge>
                          <span className="text-xs text-muted-foreground">
                            {j.createdAt.toLocaleDateString('nl-NL', {
                              day: 'numeric',
                              month: 'short',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </span>
                          {hasComments && (
                            <span className="text-xs text-muted-foreground">• met opmerking</span>
                          )}
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="shrink-0 text-xs"
                        onClick={() => {
                          onRevise(j.textAId, j.textBId, j.id!);
                          onOpenChange(false);
                        }}
                      >
                        <RotateCcw className="w-3 h-3 mr-1" />
                        Herzie
                      </Button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </ScrollArea>

        <p className="text-xs text-muted-foreground">
          Klik op "Herzie" om een oordeel opnieuw te geven. Het nieuwe oordeel vervangt het oude.
        </p>
      </DialogContent>
    </Dialog>
  );
}
