import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { ArrowLeft, CheckCircle } from 'lucide-react';
import { db, Judgement, Text, Assignment } from '@/lib/db';
import { generatePairs, Pair } from '@/lib/pairing';
import { useToast } from '@/hooks/use-toast';

const Compare = () => {
  const { assignmentId } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  
  const [assignment, setAssignment] = useState<Assignment | null>(null);
  const [pairs, setPairs] = useState<Pair[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [comment, setComment] = useState('');
  const [loading, setLoading] = useState(true);

  // Load data only once on mount
  useEffect(() => {
    loadData();
  }, []);

  // Keyboard shortcuts - separate effect with proper dependencies
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      // Ignore shortcuts if user is typing in an input or textarea
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') {
        return;
      }
      
      if (e.key === 'a' || e.key === 'A') {
        handleJudgement('A');
      } else if (e.key === 'b' || e.key === 'B') {
        handleJudgement('B');
      } else if (e.key === 't' || e.key === 'T') {
        handleJudgement('EQUAL');
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [currentIndex, pairs]);

  const loadData = async () => {
    try {
      const id = parseInt(assignmentId!);
      const assign = await db.assignments.get(id);
      
      if (!assign) {
        toast({
          title: 'Opdracht niet gevonden',
          variant: 'destructive'
        });
        navigate('/');
        return;
      }

      setAssignment(assign);

      const texts = await db.texts.where('assignmentId').equals(id).toArray();
      const judgements = await db.judgements.where('assignmentId').equals(id).toArray();

      const newPairs = generatePairs(texts, judgements, assign.numComparisons);

      if (newPairs.length === 0) {
        // All comparisons done
        navigate(`/results/${id}`);
        return;
      }

      setPairs(newPairs);
      setLoading(false);
    } catch (error) {
      console.error('Load error:', error);
      toast({
        title: 'Fout bij laden',
        variant: 'destructive'
      });
    }
  };

  const handleJudgement = async (winner: 'A' | 'B' | 'EQUAL') => {
    console.log('handleJudgement called', { winner, currentIndex, pairsLength: pairs.length });
    if (!pairs[currentIndex] || !assignment) {
      console.log('No pair or assignment', { hasPair: !!pairs[currentIndex], hasAssignment: !!assignment });
      return;
    }

    const pair = pairs[currentIndex];
    console.log('Saving judgement for pair', { 
      textAId: pair.textA.id, 
      textBId: pair.textB.id, 
      winner 
    });

    try {
      const judgementId = await db.judgements.add({
        assignmentId: assignment.id!,
        textAId: pair.textA.id!,
        textBId: pair.textB.id!,
        winner,
        comment: comment.trim() || undefined,
        createdAt: new Date()
      });
      console.log('Judgement saved with id', judgementId);

      setComment('');

      if (currentIndex < pairs.length - 1) {
        console.log('Moving to next pair', currentIndex + 1);
        setCurrentIndex(currentIndex + 1);
      } else {
        console.log('All pairs done, navigating to results');
        // Done with all pairs
        toast({
          title: 'Alle vergelijkingen voltooid',
          description: 'Berekenen van resultaten...'
        });
        navigate(`/results/${assignment.id}`);
      }
    } catch (error) {
      console.error('Save judgement error:', error);
      toast({
        title: 'Fout bij opslaan',
        variant: 'destructive'
      });
    }
  };

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
  const progress = ((currentIndex) / pairs.length) * 100;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b bg-card">
        <div className="max-w-7xl mx-auto p-4">
          <div className="flex items-center justify-between mb-4">
            <Button
              variant="ghost"
              onClick={() => navigate('/')}
            >
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
                <div className="flex items-center justify-center h-48 border-2 border-dashed rounded-lg">
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
                <span className="inline-block px-3 py-1 bg-[hsl(var(--choice-b))]/10 text-[hsl(var(--choice-b))] rounded-full text-sm font-medium">
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
                <div className="flex items-center justify-center h-48 border-2 border-dashed rounded-lg">
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
            <p className="text-lg font-medium mb-4">Welke tekst is beter?</p>
            
            <div className="grid grid-cols-3 gap-4 mb-6">
              <Button
                size="lg"
                onClick={() => handleJudgement('A')}
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
                className="h-20 text-lg"
                style={{
                  backgroundColor: 'hsl(var(--choice-b))',
                  color: 'white'
                }}
              >
                <div>
                  <div className="font-bold">{currentPair.textB.anonymizedName}</div>
                  <div className="text-xs opacity-80">Sneltoets: B</div>
                </div>
              </Button>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">
                Opmerking (optioneel)
              </label>
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
