// src/pages/Compare.tsx
import { useEffect, useState, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { ArrowLeft } from 'lucide-react';
import { db, Assignment, AssignmentMeta } from '@/lib/db';
import { generatePairs, Pair } from '@/lib/pairing';
import { calculateBradleyTerry } from '@/lib/bradley-terry';
import { useToast } from '@/hooks/use-toast';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';

const DEFAULT_COMPARISONS_PER_TEXT = 10;
const DEFAULT_BATCH_SIZE = 8; // kleinere batches voor sneller adaptief pairen

function key(a: number, b: number): string {
  return `${Math.min(a, b)}-${Math.max(a, b)}`;
}

// Helper: bereken BT-scores tussendoor voor slimmere pairing
async function buildBTMaps(assignmentId: number) {
  const texts = await db.texts.where('assignmentId').equals(assignmentId).toArray();
  const judgements = await db.judgements.where('assignmentId').equals(assignmentId).toArray();
  // Hogere ridge (0.3) om extreme θ-uitschieters te temmen
  const res = calculateBradleyTerry(texts, judgements, 0.3);
  const theta = new Map(res.map(r => [r.textId, r.theta]));
  const se = new Map(res.map(r => [r.textId, r.standardError]));
  
  // Bouw judgedPairsCounts
  const judgedPairsCounts = new Map<string, number>();
  for (const j of judgements) {
    const k = key(j.textAId, j.textBId);
    judgedPairsCounts.set(k, (judgedPairsCounts.get(k) ?? 0) + 1);
  }
  
  return { texts, judgements, theta, se, judgedPairsCounts };
}

const Compare = () => {
  const { assignmentId } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [assignment, setAssignment] = useState<Assignment | null>(null);
  const [assignmentMeta, setAssignmentMeta] = useState<AssignmentMeta | null>(null);
  const [pairs, setPairs] = useState<Pair[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [comment, setComment] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [totalJudgements, setTotalJudgements] = useState(0);
  const [expectedTotal, setExpectedTotal] = useState(0);
  const [pairCounts, setPairCounts] = useState<Map<string, number>>(new Map());
  const [replaceMode, setReplaceMode] = useState(false);
  const [isFinal, setIsFinal] = useState(false);
  const [raterId] = useState(() => `rater-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`);

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
      
      // Haal of maak assignmentMeta
      let meta = await db.assignmentMeta.get(id);
      if (!meta) {
        meta = {
          assignmentId: id,
          judgementMode: 'accumulate',
          seRepeatThreshold: 0.8
        };
        await db.assignmentMeta.put(meta);
      }
      setAssignmentMeta(meta);

      const { texts, judgements, theta, se, judgedPairsCounts } = await buildBTMaps(id);
      setPairCounts(judgedPairsCounts);
      
      if (!texts || texts.length < 2) {
        toast({
          title: 'Onvoldoende teksten',
          description: 'Minimaal twee teksten nodig om te vergelijken.',
          variant: 'destructive',
        });
        navigate('/');
        return;
      }
      
      // Bereken verwacht totaal aantal vergelijkingen voor progress
      const targetPerText = assign.numComparisons || DEFAULT_COMPARISONS_PER_TEXT;
      const expectedTotal = texts.length * targetPerText;
      setTotalJudgements(judgements.length);
      setExpectedTotal(expectedTotal);

      const newPairs = generatePairs(texts, judgements, {
        targetComparisonsPerText: assign.numComparisons || DEFAULT_COMPARISONS_PER_TEXT,
        batchSize: DEFAULT_BATCH_SIZE,
        bt: { theta, se },
        seRepeatThreshold: meta.seRepeatThreshold,
        judgedPairsCounts
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
    if (!assignment || !assignmentMeta) return;
    const id = assignment.id!;
    
    const { texts, judgements, theta, se, judgedPairsCounts } = await buildBTMaps(id);
    setPairCounts(judgedPairsCounts);

    const nextPairs = generatePairs(texts, judgements, {
      targetComparisonsPerText: assignment.numComparisons || DEFAULT_COMPARISONS_PER_TEXT,
      batchSize: DEFAULT_BATCH_SIZE,
      bt: { theta, se },
      seThreshold: 0.3,
      seRepeatThreshold: assignmentMeta.seRepeatThreshold,
      judgedPairsCounts
    });

    if (nextPairs.length === 0) {
      navigate(`/results/${id}`);
      return;
    }

    setPairs(nextPairs);
    setCurrentIndex(0);
    setReplaceMode(false);
    setIsFinal(false);
  }, [assignment, assignmentMeta, navigate]);

  // Init load
  useEffect(() => {
    loadData();
  }, [loadData]);

  // ---------- Oordeel opslaan (useCallback i.v.m. keyboard effect) ----------
  const handleJudgement = useCallback(
    async (winner: 'A' | 'B' | 'EQUAL') => {
      if (!pairs[currentIndex] || !assignment || !assignmentMeta || saving) return;

      const pair = pairs[currentIndex];
      const mode = assignmentMeta.judgementMode || 'accumulate';

      try {
        setSaving(true);
        
        let supersedesId: number | undefined;
        const pairKey = [pair.textA.id!, pair.textB.id!].sort((a, b) => a - b).join('-');
        
        // Replace mode: zoek eventuele eerdere beoordeling van dit paar door deze rater
        if (mode === 'replace' && replaceMode) {
          const existingJudgements = await db.judgements
            .where('pairKey').equals(pairKey)
            .filter(j => j.raterId === raterId && j.assignmentId === assignment.id!)
            .toArray();
          
          if (existingJudgements.length > 0) {
            // Pak de meest recente
            existingJudgements.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
            supersedesId = existingJudgements[0].id;
          }
        }

        await db.judgements.add({
          assignmentId: assignment.id!,
          textAId: pair.textA.id!,
          textBId: pair.textB.id!,
          winner,
          comment: comment.trim() || undefined,
          createdAt: new Date(),
          raterId,
          source: 'human',
          isFinal: mode === 'moderate' ? isFinal : false,
          supersedesJudgementId: supersedesId,
          pairKey
        });

        setComment('');
        setReplaceMode(false);
        setIsFinal(false);
        setTotalJudgements(prev => prev + 1);

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
    [assignment, assignmentMeta, comment, currentIndex, pairs, reloadPairs, saving, toast, raterId, replaceMode, isFinal]
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
  const pairKey = key(currentPair.textA.id!, currentPair.textB.id!);
  const pairCount = pairCounts.get(pairKey) ?? 0;
  const mode = assignmentMeta?.judgementMode || 'accumulate';
  
  // Progress gebaseerd op totaal aantal gemaakte oordelen vs verwacht totaal
  const progress = expectedTotal > 0 ? Math.min((totalJudgements / expectedTotal) * 100, 100) : 0;

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
                {totalJudgements} van ~{expectedTotal} vergelijkingen
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
        {/* Judgement Controls */}
        <Card className="shadow-lg mb-6">
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-2">
              <p className="text-lg font-medium">Welke tekst is beter?</p>
              {pairCount > 0 && (
                <span className="text-sm text-muted-foreground bg-muted px-2 py-1 rounded">
                  Eerder beoordeeld: {pairCount}×
                </span>
              )}
            </div>
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
                className="h-20 text-lg bg-secondary hover:bg-secondary/90 text-secondary-foreground"
              >
                <div>
                  <div className="font-bold">{currentPair.textB.anonymizedName}</div>
                  <div className="text-xs opacity-80">Sneltoets: B</div>
                </div>
              </Button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium">Opmerking (optioneel)</label>
                <Textarea
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="Noteer eventuele overwegingen..."
                  rows={3}
                />
              </div>
              
              {mode === 'replace' && pairCount > 0 && (
                <div className="flex items-center space-x-2">
                  <Checkbox 
                    id="replace-mode" 
                    checked={replaceMode}
                    onCheckedChange={(checked) => setReplaceMode(checked === true)}
                  />
                  <Label htmlFor="replace-mode" className="text-sm cursor-pointer">
                    Vorige beoordeling vervangen
                  </Label>
                </div>
              )}
              
              {mode === 'moderate' && (
                <div className="flex items-center space-x-2">
                  <Checkbox 
                    id="is-final" 
                    checked={isFinal}
                    onCheckedChange={(checked) => setIsFinal(checked === true)}
                  />
                  <Label htmlFor="is-final" className="text-sm cursor-pointer">
                    Markeer als definitief
                  </Label>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <div className="grid md:grid-cols-2 gap-6">
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
                <span className="inline-block px-3 py-1 bg-secondary/10 text-secondary-foreground rounded-full text-sm font-medium">
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
      </div>
    </div>
  );
};

export default Compare;
