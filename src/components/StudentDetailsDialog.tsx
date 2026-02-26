import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { db, Text, Judgement } from '@/lib/db';
import { Card, CardContent } from '@/components/ui/card';
import { CheckCircle, XCircle, Equal } from 'lucide-react';

interface StudentDetailsDialogProps {
  studentName: string;
  assignmentId: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface JudgementDetail {
  id: number;
  opponent: string;
  winner: 'student' | 'opponent' | 'tie';
  createdAt: Date;
  comment?: string;
  commentStudent?: string;
  commentOpponent?: string;
  raterName?: string;
}

export function StudentDetailsDialog({
  studentName,
  assignmentId,
  open,
  onOpenChange
}: StudentDetailsDialogProps) {
  const [judgements, setJudgements] = useState<JudgementDetail[]>([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ wins: 0, losses: 0, ties: 0 });
  const [hasMultipleRaters, setMultipleRaters] = useState(false);

  useEffect(() => {
    if (open && studentName && assignmentId) {
      loadJudgements();
    }
  }, [open, studentName, assignmentId]);

  const loadJudgements = async () => {
    setLoading(true);
    try {
      // Find the student's text
      const studentTexts = await db.texts
        .where('assignmentId')
        .equals(assignmentId)
        .and(text => text.anonymizedName === studentName)
        .toArray();

      if (studentTexts.length === 0) {
        setLoading(false);
        return;
      }

      const studentTextId = studentTexts[0].id!;

      // Get all judgements involving this student
      const allJudgements = await db.judgements
        .where('assignmentId')
        .equals(assignmentId)
        .toArray();

      const studentJudgements = allJudgements.filter(
        j => j.textAId === studentTextId || j.textBId === studentTextId
      );

      // Get all texts to map IDs to names
      const allTexts = await db.texts
        .where('assignmentId')
        .equals(assignmentId)
        .toArray();

      const textMap = new Map(allTexts.map(t => [t.id!, t.anonymizedName]));

      // Process judgements
      const details: JudgementDetail[] = [];
      let wins = 0;
      let losses = 0;
      let ties = 0;

      for (const j of studentJudgements) {
        const isStudentA = j.textAId === studentTextId;
        const opponentId = isStudentA ? j.textBId : j.textAId;
        const opponent = textMap.get(opponentId) || 'Onbekend';

        let winner: 'student' | 'opponent' | 'tie';
        if (j.winner === 'EQUAL') {
          winner = 'tie';
          ties++;
        } else if ((isStudentA && j.winner === 'A') || (!isStudentA && j.winner === 'B')) {
          winner = 'student';
          wins++;
        } else {
          winner = 'opponent';
          losses++;
        }

        // Bepaal welke comment bij welke student hoort
        const commentStudent = isStudentA ? j.commentA : j.commentB;
        const commentOpponent = isStudentA ? j.commentB : j.commentA;

        details.push({
          id: j.id!,
          opponent,
          winner,
          createdAt: j.createdAt,
          comment: j.comment, // Oude algemene comment (backwards compatibility)
          commentStudent,
          commentOpponent,
          raterName: j.raterName || undefined,
        });
      }

      // Sort by date (newest first)
      details.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

      setJudgements(details);
      setStats({ wins, losses, ties });
      setMultipleRaters(new Set(details.map(d => d.raterName).filter(Boolean)).size > 1);
    } catch (error) {
      console.error('Error loading judgements:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle className="text-2xl">{studentName}</DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="p-8 text-center text-muted-foreground">
            Laden...
          </div>
        ) : (
          <div className="space-y-4">
            {/* Stats Summary */}
            <div className="grid grid-cols-3 gap-3">
              <Card>
                <CardContent className="p-4 text-center">
                  <div className="flex items-center justify-center mb-2">
                    <CheckCircle className="w-5 h-5 text-secondary" />
                  </div>
                  <div className="text-2xl font-bold">{stats.wins}</div>
                  <div className="text-xs text-muted-foreground">Gewonnen</div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4 text-center">
                  <div className="flex items-center justify-center mb-2">
                    <XCircle className="w-5 h-5 text-destructive" />
                  </div>
                  <div className="text-2xl font-bold">{stats.losses}</div>
                  <div className="text-xs text-muted-foreground">Verloren</div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4 text-center">
                  <div className="flex items-center justify-center mb-2">
                    <Equal className="w-5 h-5 text-muted-foreground" />
                  </div>
                  <div className="text-2xl font-bold">{stats.ties}</div>
                  <div className="text-xs text-muted-foreground">Gelijk</div>
                </CardContent>
              </Card>
            </div>

            {/* Judgements List */}
            <div>
              <h3 className="font-semibold mb-3">Vergelijkingen ({judgements.length})</h3>
              <ScrollArea className="h-[300px] border rounded-lg">
                <div className="p-4 space-y-2">
                  {judgements.length === 0 ? (
                    <p className="text-center text-muted-foreground py-8">
                      Nog geen vergelijkingen
                    </p>
                  ) : (
                    judgements.map((j) => (
                      <div key={j.id} className="space-y-2">
                        <div className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50 transition-colors">
                          <div className="flex items-center gap-3 flex-1">
                            <div className="flex items-center justify-center w-8 h-8 rounded-full bg-muted">
                              {j.winner === 'student' && <CheckCircle className="w-4 h-4 text-secondary" />}
                              {j.winner === 'opponent' && <XCircle className="w-4 h-4 text-destructive" />}
                              {j.winner === 'tie' && <Equal className="w-4 h-4 text-muted-foreground" />}
                            </div>
                            <div className="flex-1">
                              <div className="font-medium">vs {j.opponent}</div>
                              <div className="text-xs text-muted-foreground">
                                {j.createdAt.toLocaleDateString('nl-NL', {
                                  day: 'numeric',
                                  month: 'short',
                                  hour: '2-digit',
                                  minute: '2-digit'
                                })}
                                {j.raterName && hasMultipleRaters && (
                                  <span className="ml-2 text-primary">• {j.raterName}</span>
                                )}
                              </div>
                            </div>
                          </div>
                          <Badge
                            variant={j.winner === 'student' ? 'default' : j.winner === 'tie' ? 'secondary' : 'outline'}
                            className={
                              j.winner === 'student' 
                                ? 'bg-secondary text-secondary-foreground' 
                                : j.winner === 'opponent'
                                  ? 'border-destructive text-destructive'
                                  : ''
                            }
                          >
                            {j.winner === 'student' && 'Gewonnen'}
                            {j.winner === 'opponent' && 'Verloren'}
                            {j.winner === 'tie' && 'Gelijk'}
                          </Badge>
                        </div>
                        {(j.commentStudent || j.commentOpponent || j.comment) && (
                          <div className="ml-11 space-y-2">
                            {j.commentStudent && (
                              <div className="p-3 bg-secondary/10 rounded-lg text-sm">
                                <div className="font-medium text-xs text-muted-foreground mb-1">{studentName}:</div>
                                <div className="text-foreground">{j.commentStudent}</div>
                              </div>
                            )}
                            {j.commentOpponent && (
                              <div className="p-3 bg-muted/50 rounded-lg text-sm">
                                <div className="font-medium text-xs text-muted-foreground mb-1">{j.opponent}:</div>
                                <div className="text-muted-foreground">{j.commentOpponent}</div>
                              </div>
                            )}
                            {j.comment && !j.commentStudent && !j.commentOpponent && (
                              <div className="p-3 bg-muted/50 rounded-lg text-sm text-muted-foreground">
                                {j.comment}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </ScrollArea>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
