// src/pages/Compare.tsx
import { useEffect, useState, useCallback, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { ArrowLeft } from 'lucide-react';
import { db, Assignment, AssignmentMeta, Text } from '@/lib/db';
import { generatePairs, Pair } from '@/lib/pairing';
import { calculateBradleyTerry } from '@/lib/bradley-terry';
import { getEffectiveJudgements } from '@/lib/effective-judgements';
import { useToast } from '@/hooks/use-toast';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { HeaderNav } from '@/components/HeaderNav';
import { MIN_BASE, SE_RELIABLE, DEFAULT_COMPARISONS_PER_TEXT, DEFAULT_BATCH_SIZE } from '@/lib/constants';

function key(a: number, b: number): string {
  return `${Math.min(a, b)}-${Math.max(a, b)}`;
}

// Helper: tussentijds BT voor adaptieve pairing (op basis van EFFECTIVE judgements)
async function buildBTMaps(assignmentId: number) {
  const texts = await db.texts.where('assignmentId').equals(assignmentId).toArray();
  const all = await db.judgements.where('assignmentId').equals(assignmentId).toArray();
  const judgements = getEffectiveJudgements(all);
  const bt = calculateBradleyTerry(texts, judgements, 0.3); // iets meer ridge
  const theta = new Map(bt.rows.map(r => [r.textId, r.theta]));
  const se = new Map(bt.rows.map(r => [r.textId, r.standardError]));
  
  // judgedPairsCounts
  const judgedPairsCounts = new Map<string, number>();
  for (const j of judgements) {
    const k = key(j.textAId, j.textBId);
    judgedPairsCounts.set(k, (judgedPairsCounts.get(k) ?? 0) + 1);
  }
  
  // exposures per tekst
  const exposures = new Array(texts.length).fill(0);
  const id2idx = new Map<number, number>(texts.map((t,i)=>[t.id!, i]));
  for (const j of judgements) {
    const ia = id2idx.get(j.textAId); 
    const ib = id2idx.get(j.textBId);
    if (ia!=null) exposures[ia]++; 
    if (ib!=null) exposures[ib]++;
  }
  
  return { texts, judgements, theta, se, judgedPairsCounts, exposures };
}

function calculateDynamicBatchSize(texts: Text[], seMap: Map<number, number>, exposures: number[]): number {
  const needWork = texts.filter((t, idx) => {
    const se = seMap.get(t.id!) ?? Infinity;
    return exposures[idx] < MIN_BASE || se > SE_RELIABLE;
  }).length;

  const ratio = needWork / texts.length;
  if (ratio <= 0.3) return Math.max(2, Math.ceil(needWork * 2));
  return DEFAULT_BATCH_SIZE;
}

const Compare = () => {
  const { assignmentId } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [assignment, setAssignment] = useState<Assignment | null>(null);
  const [assignmentMeta, setAssignmentMeta] = useState<AssignmentMeta | null>(null);
  const [pairs, setPairs] = useState<Pair[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [commentLeft, setCommentLeft] = useState('');
  const [commentRight, setCommentRight] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [totalJudgements, setTotalJudgements] = useState(0);
  const [expectedTotal, setExpectedTotal] = useState(0);
  const [pairCounts, setPairCounts] = useState<Map<string, number>>(new Map());
  const [textCounts, setTextCounts] = useState<Map<number, number>>(new Map());
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
      
      // AssignmentMeta
      let meta = await db.assignmentMeta.get(id);
      if (!meta) {
        meta = { assignmentId: id, judgementMode: 'accumulate', seRepeatThreshold: 0.8 };
        await db.assignmentMeta.put(meta);
      }
      setAssignmentMeta(meta);

      const { texts, judgements, theta, se, judgedPairsCounts, exposures } = await buildBTMaps(id);
      setPairCounts(judgedPairsCounts);
      
      // teller per tekst
      const textCountsMap = new Map<number, number>();
      for (const j of judgements) {
        textCountsMap.set(j.textAId, (textCountsMap.get(j.textAId) ?? 0) + 1);
        textCountsMap.set(j.textBId, (textCountsMap.get(j.textBId) ?? 0) + 1);
      }
      setTextCounts(textCountsMap);
      
      if (!texts || texts.length < 2) {
        toast({
          title: 'Onvoldoende teksten',
          description: 'Minimaal twee teksten nodig om te vergelijken.',
          variant: 'destructive',
        });
        navigate('/');
        return;
      }
      
      // progress: verwacht totaal
      const targetPerText = assign.numComparisons || DEFAULT_COMPARISONS_PER_TEXT;
      const expected = texts.length * targetPerText;
      setTotalJudgements(judgements.length);
      setExpectedTotal(expected);

      const batch = calculateDynamicBatchSize(texts, se, exposures);
      const newPairs = generatePairs(texts, judgements, {
        targetComparisonsPerText: targetPerText,
        batchSize: batch,
        bt: { theta, se },
        judgedPairsCounts
      });

      if (newPairs.length === 0) {
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
    
    const { texts, judgements, theta, se, judgedPairsCounts, exposures } = await buildBTMaps(id);
    setPairCounts(judgedPairsCounts);
    
    const textCountsMap = new Map<number, number>();
    for (const j of judgements) {
      textCountsMap.set(j.textAId, (textCountsMap.get(j.textAId) ?? 0) + 1);
      textCountsMap.set(j.textBId, (textCountsMap.get(j.textBId) ?? 0) + 1);
    }
    setTextCounts(textCountsMap);

    const batch = calculateDynamicBatchSize(texts, se, exposures);
    const nextPairs = generatePairs(texts, judgements, {
      targetComparisonsPerText: assignment.numComparisons || DEFAULT_COMPARISONS_PER_TEXT,
      batchSize: batch,
      bt: { theta, se },
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

  useEffect(() => { loadData(); }, [loadData]);

  // Huidige paar + alfabetische linker/rechter mapping (voor UI én shortcuts)
  const currentPair = pairs[currentIndex];
  const { leftText, rightText, leftIsA } = useMemo(() => {
    if (!currentPair) return { leftText: undefined as unknown as Text, rightText: undefined as unknown as Text, leftIsA: true };
    const sorted = [currentPair.textA, currentPair.textB].sort((a, b) =>
      a.anonymizedName.localeCompare(b.anonymizedName)
    );
    const left = sorted[0];
    const right = sorted[1];
    return { leftText: left, rightText: right, leftIsA: left.id === currentPair.textA.id };
  }, [currentPair]);

  // ---------- Oordeel opslaan ----------
  const handleJudgement = useCallback(
    async (winner: 'A' | 'B' | 'EQUAL') => {
      if (!currentPair || !assignment || !assignmentMeta || saving) return;

      // recompute leftIsA lokaal (robust bij snelle state updates)
      const sorted = [currentPair.textA, currentPair.textB].sort((a, b) =>
        a.anonymizedName.localeCompare(b.anonymizedName)
      );
      const left = sorted[0];
      const _leftIsA = left.id === currentPair.textA.id;

      try {
        setSaving(true);
        
        let supersedesId: number | undefined;
        const pairKey = [currentPair.textA.id!, currentPair.textB.id!].sort((a, b) => a - b).join('-');
        const mode = assignmentMeta.judgementMode || 'accumulate';

        if (mode === 'replace' && replaceMode) {
          const existingJudgements = await db.judgements
            .where('pairKey').equals(pairKey)
            .filter(j => j.raterId === raterId && j.assignmentId === assignment.id!)
            .toArray();
          if (existingJudgements.length > 0) {
            existingJudgements.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
            supersedesId = existingJudgements[0].id;
          }
        }

        // Combineer twee commentvelden tot één DB-veld `comment` (schema-compatibel)
        const cLeft = commentLeft.trim();
        const cRight = commentRight.trim();
        const parts: string[] = [];
        if (cLeft)  parts.push(`L:${cLeft}`);
        if (cRight) parts.push(`R:${cRight}`);
        const combinedComment = parts.length ? parts.join(' | ') : undefined;

        await db.judgements.add({
          assignmentId: assignment.id!,
          textAId: currentPair.textA.id!,
          textBId: currentPair.textB.id!,
          winner,
          comment: combinedComment,
          createdAt: new Date(),
          raterId,
          source: 'human',
          isFinal: (mode === 'moderate') ? isFinal : false,
          supersedesJudgementId: supersedesId,
          pairKey
        });

        setCommentLeft('');
        setCommentRight('');
        setReplaceMode(false);
        setIsFinal(false);
        setTotalJudgements(prev => prev + 1);

        // Update counters in UI
        setTextCounts(prev => {
          const m = new Map(prev);
          m.set(currentPair.textA.id!, (m.get(currentPair.textA.id!) ?? 0) + 1);
          m.set(currentPair.textB.id!, (m.get(currentPair.textB.id!) ?? 0) + 1);
          return m;
        });
        setPairCounts(prev => {
          const m = new Map(prev);
          const k = key(currentPair.textA.id!, currentPair.textB.id!);
          m.set(k, (m.get(k) ?? 0) + 1);
          return m;
        });

        // Volgende binnen batch of nieuwe batch
        if (currentIndex < pairs.length - 1) {
          setCurrentIndex(i => i + 1);
        } else {
          await reloadPairs();
        }
      } catch (error) {
        console.error('Save judgement error:', error);
        toast({ title: 'Fout bij opslaan', variant: 'destructive' });
      } finally {
        setSaving(false);
      }
    },
    [assignment, assignmentMeta, commentLeft, commentRight, currentIndex, currentPair, pairs, reloadPairs, saving, toast, raterId, replaceMode, isFinal]
  );

  // ---------- Keyboard shortcuts: A = LINKS, B = RECHTS ----------
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA') return;

      if (e.key === 'a' || e.key === 'A') {
        // kies LINKS → map naar A/B afhankelijk van leftIsA
        void handleJudgement(leftIsA ? 'A' : 'B');
      } else if (e.key === 'b' || e.key === 'B') {
        // kies RECHTS → tegengestelde
        void handleJudgement(leftIsA ? 'B' : 'A');
      } else if (e.key === 't' || e.key === 'T') {
        void handleJudgement('EQUAL');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [handleJudgement, leftIsA]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground">Laden...</p>
      </div>
    );
  }

  if (!currentPair) return null;

  const pairKeyNow = key(currentPair.textA.id!, currentPair.textB.id!);
  const pairCount = pairCounts.get(pairKeyNow) ?? 0;
  const mode = assignmentMeta?.judgementMode || 'accumulate';

  // UI progress
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
            <HeaderNav />
          </div>

          <div className="mb-2">
            <h1 className="text-2xl font-bold">{assignment?.title}</h1>
            <p className="text-sm text-muted-foreground">
              {totalJudgements} van ~{expectedTotal} vergelijkingen
            </p>
          </div>

          <Progress value={progress} className="h-2" />
        </div>
      </div>

      {/* Comparison Area */}
      <div className="max-w-7xl mx-auto p-6">
        {/* Judgement Controls */}
        <Card className="shadow-lg mb-6">
          <CardContent className="p-6">
            <p className="text-lg font-medium mb-2">Welke tekst is beter?</p>
            <p className="text-sm text-muted-foreground mb-4">
              Kies de <strong>sterkere</strong> tekst. Bij twijfel: <em>Gelijkwaardig</em> (sneltoets T).
            </p>

            <div className="grid grid-cols-3 gap-4 mb-6">
              <Button
                size="lg"
                onClick={() => handleJudgement(leftIsA ? 'A' : 'B')}
                disabled={saving}
                className="h-20 text-lg bg-primary hover:bg-primary/90"
              >
                <div>
                  <div className="font-bold">{leftText.anonymizedName}</div>
                  <div className="text-xs opacity-80">Sneltoets: A (links)</div>
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
                onClick={() => handleJudgement(leftIsA ? 'B' : 'A')}
                disabled={saving}
                className="h-20 text-lg bg-secondary hover:bg-secondary/90 text-secondary-foreground"
              >
                <div>
                  <div className="font-bold">{rightText.anonymizedName}</div>
                  <div className="text-xs opacity-80">Sneltoets: B (rechts)</div>
                </div>
              </Button>
            </div>

            <div className="space-y-4">
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

              <div className="grid md:grid-cols-2 gap-4 pt-4">
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Opmerking {leftText.anonymizedName} (optioneel)</label>
                  <Textarea
                    value={commentLeft}
                    onChange={(e) => setCommentLeft(e.target.value)}
                    placeholder="Opmerking voor deze tekst..."
                    rows={3}
                    className="mt-2"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Opmerking {rightText.anonymizedName} (optioneel)</label>
                  <Textarea
                    value={commentRight}
                    onChange={(e) => setCommentRight(e.target.value)}
                    placeholder="Opmerking voor deze tekst..."
                    rows={3}
                    className="mt-2"
                  />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="grid md:grid-cols-2 gap-6">
          {/* Left Text */}
          <Card className="shadow-lg">
            <CardContent className="p-6 space-y-4">
              <div>
                <span className="inline-block px-3 py-1 bg-primary/10 text-primary rounded-full text-sm font-medium">
                  {leftText.anonymizedName}
                </span>
              </div>
              {leftText.content ? (
                <div className="prose prose-sm max-w-none">
                  <div className="whitespace-pre-wrap text-foreground leading-relaxed">
                    {leftText.content}
                  </div>
                </div>
              ) : (
                <div
                  className="flex items-center justify-center h-48 border-2 border-dashed rounded-lg"
                  aria-label={`Papieren tekst ${leftText.anonymizedName}`}
                >
                  <p className="text-muted-foreground text-center px-4">
                    Bekijk de papieren tekst van<br />
                    <strong className="text-foreground">{leftText.anonymizedName}</strong>
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Right Text */}
          <Card className="shadow-lg">
            <CardContent className="p-6 space-y-4">
              <div>
                <span className="inline-block px-3 py-1 bg-secondary/10 text-secondary-foreground rounded-full text-sm font-medium">
                  {rightText.anonymizedName}
                </span>
              </div>
              {rightText.content ? (
                <div className="prose prose-sm max-w-none">
                  <div className="whitespace-pre-wrap text-foreground leading-relaxed">
                    {rightText.content}
                  </div>
                </div>
              ) : (
                <div
                  className="flex items-center justify-center h-48 border-2 border-dashed rounded-lg"
                  aria-label={`Papieren tekst ${rightText.anonymizedName}`}
                >
                  <p className="text-muted-foreground text-center px-4">
                    Bekijk de papieren tekst van<br />
                    <strong className="text-foreground">{rightText.anonymizedName}</strong>
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
        
        {/* Beoordelingen per leerling */}
        <div className="mt-6 p-4 bg-muted rounded-lg">
          <div className="grid md:grid-cols-2 gap-4 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">{leftText.anonymizedName}:</span>
              <span className="font-medium">
                {textCounts.get(leftText.id!) ?? 0} beoordelingen
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">{rightText.anonymizedName}:</span>
              <span className="font-medium">
                {textCounts.get(rightText.id!) ?? 0} beoordelingen
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Compare;
