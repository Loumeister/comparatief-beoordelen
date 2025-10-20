// src/pages/Compare.tsx
import { useEffect, useState, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { ArrowLeft } from 'lucide-react';
import { db, Assignment } from '@/lib/db';
import { generatePairs, Pair } from '@/lib/pairing';
import { useToast } from '@/hooks/use-toast';

const DEFAULT_COMPARISONS_PER_TEXT = 10;
const DEFAULT_BATCH_SIZE = 12; // klein & iteratief voor adaptief pairen

const Compare = () => {
  const { assignmentId } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [assignment, setAssignment] = useState<Assignment | null>(null);
  const [pairs, setPairs] = useState<Pair[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [comment, setComment] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // ---------- Data laden ----------
  const loadData = useCallback(async () => {
    try {
      const id = parseInt(assignmentId!);
      const assign = await db.assignments.get(id);

      if (!assign) {
        toast({ title: 'Opdracht niet gevonden', variant: 'destructive' });
        navigate('/');
        return;
      }
      setAssignment(assign);

      const texts = await db.texts.where('assignmentId').equals(id).toArray();
      if (!texts || texts.length < 2) {
        toast({
          title: 'Onvoldoende teksten',
          description: 'Minimaal twee teksten nodig om te vergelijken.',
          variant: 'destructive',
        });
        navigate('/');
        return;
      }

      const judgements = await db.judgements.where('assignmentId').equals(id).toArray();

      const newPairs = generatePairs(texts, judgements, {
        targetComparisonsPerText: assign.numComparisons || DEFAULT_COMPARISONS_PER_TEXT,
        batchSize: DEFAULT_BATCH_SIZE,
      });

      if (newPairs.length === 0) {
        // Alle benodigde vergelijkingen zijn gedaan
        navigate(`/results/${id}`);
        return;
      }

      setPairs(newPairs);
      setCurrentIndex(0);
      setLoading(false);
    } catch (error) {
      console.error('Load error:', error);
      toast({ title: 'Fout bij laden', variant: 'destructive' });
      navigate('/');
    }
  }, [assignmentId, navigate, toast]);

  // Herlaad adaptief een nieuwe batch na oordelen
  const reloadPairs = useCallback(async () => {
    if (!assignment) return;
    const id = assignment.id!;
    const texts = await db.texts.where('assignmentId').equals(id).toArray();
    const judgements = await db.judgements.where('assignmentId').equals(id).toArray();

    const nextPairs = generatePairs(texts, judgements, {
      targetComparisonsPerText: assignment.numComparisons || DEFAULT_COMPARISONS_PER_TEXT,
      batchSize: DEFAULT_BATCH_SIZE,
      // bt: { theta: thetaMap, se: seMap } // optioneel als je tussentijds BT draait
    });

    if (nextPairs.length === 0) {
      navigate(`/results/${id}`);
      return;
    }

    setPairs(nextPairs);
    setCurrentIndex(0);
  }, [assignment, navigate]);

  // Init load
  useEffect(() => {
    loadData();
  }, [loadData]);

  // ---------- Oordeel opslaan (useCallback i.v.m. keyboard effect) ----------
  const handleJudgement = useCallback(
    async (winner: 'A' | 'B' | 'EQUAL') => {
      if (!pairs[currentIndex] || !assignment || saving) return;

      const pair = pairs[currentIndex];

      try {
        setSaving(true);

        await db.judgements.add({
          assignmentId: assignment.id!,
          textAId: pair.textA.id!,
          textBId: pair.textB.id!,
          winner,
          comment: comment.trim() || undefined,
          createdAt: new Date(),
        });

        setComment('');

        // Volgend paar binnen huidige batch…
        if (currentIndex < pairs.length - 1) {
          setCurrentIndex((i) => i + 1);
        } else {
          // Batch op; laad adaptief een nieuwe batch
          await reloadPairs();
        }
      } catch (error) {
        console.error('Save judgement error:', error);
        toast({ title: 'Fout bij opslaan', variant: 'destructive' });
      } finally {
        setSaving(false);
      }
    },
    [assignment, comment, currentIndex, pairs, reloadPairs, saving, toast]
  );

  // ---------- Keyboard shortcuts (stabiel & up-to-date via handleJudgement dep) ----------
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA') return;

      if (e.key === 'a' || e.key === 'A') {
        void handleJudgement('A');
      } else if (e.key === 'b' || e.key === 'B') {
        void handleJudgement('B');
      } else if (e.key === 't' || e.key === 'T') {
        void handleJudgement('EQUAL');
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [handleJudgement]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground">Laden...</p>
      </div>
    );
  }

  if (pairs.length === 0) {
    return null;
  }

  const currentPair = pairs[currentIndex];
  // Progress fix: +1 omdat je het huidige paar al in beeld hebt
  const progress = ((currentIndex + 1) / pairs.length) * 100;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b bg-card">
        <div className="max-w-7xl mx-auto p-4">
          <div className="flex items-center justify-between mb-4">
            <Button variant="ghost" onClick={() => navigate('/')}>
              <ArrowLeft className="w-4 h-4 mr-2" />
              Terug
            </Button>
            <div className="text-right">
              <p className="text-sm text-muted-foreground">
                {currentIndex + 1} van {pairs.length} vergelijkingen
              </p>
            </div>
          </div>

          <div className="mb-2">
            <h1 className="text-2xl font-bold">{assignment?.title}</h1>
          </div>

          <Progress value={progress} className="h-2" />
        </div>
      </div>

      {/* Comparison Area */}
      <div className="max-w-7xl mx-auto p-6">
        <div className="grid md:grid-cols-2 gap-6 mb-6">
          {/* Text A */}
          <Card className="shadow-lg">
            <CardContent className="p-6">
              <div className="mb-4">
                <span className="inline-block px-3 py-1 bg-primary/10 text-primary rounded-full text-sm font-medium">
                  {currentPair.textA.anonymizedName}
                </span>
              </div>
              {currentPair.textA.content ? (
                <div className="prose prose-sm max-w-none">
                  <div className="whitespace-pre-wrap text-foreground leading-relaxed">
                    {currentPair.textA.content}
                  </div>
                </div>
              ) : (
                <div
                  className="flex items-center justify-center h-48 border-2 border-dashed rounded-lg"
                  aria-label="Papieren tekst A"
                >
                  <p className="text-muted-foreground text-center px-4">
                    Bekijk de papieren tekst van<br />
                    <strong className="text-foreground">{currentPair.textA.anonymizedName}</strong>
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Text B */}
          <Card className="shadow-lg">
            <CardContent className="p-6">
              <div className="mb-4">
                <span
                  className="inline-block px-3 py-1 rounded-full text-sm font-medium"
                  style={{
                    backgroundColor: 'hsl(var(--choice-b, 221 83% 95%))',
                    color: 'hsl(var(--choice-b, 221 83% 53%))',
                  }}
                >
                  {currentPair.textB.anonymizedName}
                </span>
              </div>
              {currentPair.textB.content ? (
                <div className="prose prose-sm max-w-none">
                  <div className="whitespace-pre-wrap text-foreground leading-relaxed">
                    {currentPair.textB.content}
                  </div>
                </div>
              ) : (
                <div
                  className="flex items-center justify-center h-48 border-2 border-dashed rounded-lg"
                  aria-label="Papieren tekst B"
                >
                  <p className="text-muted-foreground text-center px-4">
                    Bekijk de papieren tekst van<br />
                    <strong className="text-foreground">{currentPair.textB.anonymizedName}</strong>
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Judgement Controls */}
        <Card className="shadow-lg">
          <CardContent className="p-6">
            <p className="text-lg font-medium mb-2">Welke tekst is beter?</p>
            <p className="text-sm text-muted-foreground mb-4">
              Kies de <strong>sterkere</strong> tekst. Bij twijfel: <em>Gelijkwaardig</em> (sneltoets T).
            </p>

            <div className="grid grid-cols-3 gap-4 mb-6">
              <Button
                size="lg"
                onClick={() => handleJudgement('A')}
                disabled={saving}
                className="h-20 text-lg bg-primary hover:bg-primary/90"
              >
                <div>
                  <div className="font-bold">{currentPair.textA.anonymizedName}</div>
                  <div className="text-xs opacity-80">Sneltoets: A</div>
                </div>
              </Button>

              <Button
                size="lg"
                variant="outline"
                onClick={() => handleJudgement('EQUAL')}
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
                onClick={() => handleJudgement('B')}
                disabled={saving}
                className="h-20 text-lg"
                style={{
                    backgroundColor: 'hsl(var(--choice-b, 221 83% 53%))',
                    color: 'white',
                }}
              >
                <div>
                  <div className="font-bold">{currentPair.textB.anonymizedName}</div>
                  <div className="text-xs opacity-80">Sneltoets: B</div>
                </div>
              </Button>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Opmerking (optioneel)</label>
              <Textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Noteer eventuele overwegingen..."
                rows={3}
              />
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Compare;
