import { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Plus, FileText, BarChart3, Trash2, Upload } from 'lucide-react';
import { db, Assignment } from '@/lib/db';
import { importDataset } from '@/lib/exportImport';
import { useToast } from '@/hooks/use-toast';

const Dashboard = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [stats, setStats] = useState<Map<number, { texts: number; judgements: number }>>(new Map());
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    loadAssignments();
  }, []);

  const loadAssignments = async () => {
    const allAssignments = await db.assignments.orderBy('createdAt').reverse().toArray();
    setAssignments(allAssignments);

    // Load stats for each assignment
    const statsMap = new Map();
    for (const assign of allAssignments) {
      const texts = await db.texts.where('assignmentId').equals(assign.id!).count();
      const judgements = await db.judgements.where('assignmentId').equals(assign.id!).count();
      statsMap.set(assign.id, { texts, judgements });
    }
    setStats(statsMap);
  };

  const handleDelete = async (id: number, title: string) => {
    if (!confirm(`Weet je zeker dat je "${title}" wilt verwijderen?`)) {
      return;
    }

    try {
      await db.texts.where('assignmentId').equals(id).delete();
      await db.judgements.where('assignmentId').equals(id).delete();
      await db.scores.where('assignmentId').equals(id).delete();
      await db.assignments.delete(id);

      toast({
        title: 'Opdracht verwijderd',
        description: `"${title}" is verwijderd`
      });

      loadAssignments();
    } catch (error) {
      console.error('Delete error:', error);
      toast({
        title: 'Fout bij verwijderen',
        variant: 'destructive'
      });
    }
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImporting(true);
    try {
      const result = await importDataset(file);
      
      toast({
        title: 'Dataset succesvol geïmporteerd',
        description: `${result.assignmentTitle}: ${result.newTexts} nieuwe teksten, ${result.newJudgements} nieuwe oordelen`,
      });

      if (!result.isConnected) {
        toast({
          title: 'Let op: grafiek niet verbonden',
          description: 'Sommige teksten zijn nog niet gekoppeld – voer extra vergelijkingen uit.',
          variant: 'default',
        });
      }

      // Reload assignments
      await loadAssignments();
    } catch (error) {
      console.error('Import error:', error);
      toast({
        title: 'Import mislukt',
        description: error instanceof Error ? error.message : 'Ongeldig bestandsformaat',
        variant: 'destructive',
      });
    } finally {
      setImporting(false);
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Hero Section */}
      <div className="bg-gradient-to-br from-primary/10 to-[hsl(var(--choice-b))]/10 border-b">
        <div className="max-w-6xl mx-auto p-8">
          <h1 className="text-5xl font-bold mb-4">Vergelijkende Beoordeling</h1>
          <p className="text-xl text-muted-foreground mb-6">
            Beoordeel leerlingteksten objectief door ze paarsgewijs te vergelijken
          </p>
          <div className="flex gap-3">
            <Button size="lg" onClick={() => navigate('/upload')}>
              <Plus className="w-5 h-5 mr-2" />
              Nieuwe Opdracht
            </Button>
            <Button 
              size="lg" 
              variant="secondary" 
              onClick={() => fileInputRef.current?.click()}
              disabled={importing}
            >
              <Upload className="w-5 h-5 mr-2" />
              {importing ? 'Importeren...' : 'Importeer Dataset'}
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json"
              className="hidden"
              onChange={handleImport}
            />
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-6xl mx-auto p-8">
        {assignments.length === 0 ? (
          <Card>
            <CardContent className="p-12 text-center">
              <FileText className="w-16 h-16 mx-auto mb-4 text-muted-foreground" />
              <h3 className="text-xl font-semibold mb-2">Nog geen opdrachten</h3>
              <p className="text-muted-foreground mb-6">
                Begin met het uploaden van leerlingteksten om te vergelijken
              </p>
              <Button onClick={() => navigate('/upload')}>
                <Plus className="w-4 h-4 mr-2" />
                Maak je eerste opdracht
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div>
            <h2 className="text-2xl font-bold mb-6">Je Opdrachten</h2>
            <div className="grid gap-4">
              {assignments.map((assignment) => {
                const assignStats = stats.get(assignment.id!) || { texts: 0, judgements: 0 };
                const totalPossible = (assignStats.texts * (assignStats.texts - 1)) / 2;
                const progress = totalPossible > 0 
                  ? Math.min(100, (assignStats.judgements / (assignment.numComparisons * assignStats.texts / 2)) * 100)
                  : 0;

                return (
                  <Card key={assignment.id} className="hover:shadow-md transition-shadow">
                    <CardHeader>
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <CardTitle className="text-xl">{assignment.title}</CardTitle>
                          <CardDescription>{assignment.genre}</CardDescription>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDelete(assignment.id!, assignment.title)}
                        >
                          <Trash2 className="w-4 h-4 text-destructive" />
                        </Button>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="flex items-center gap-6 mb-4 text-sm text-muted-foreground">
                        <div className="flex items-center gap-2">
                          <FileText className="w-4 h-4" />
                          <span>{assignStats.texts} teksten</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <BarChart3 className="w-4 h-4" />
                          <span>{assignStats.judgements} vergelijkingen</span>
                        </div>
                        <div>
                          <span>{progress.toFixed(0)}% voltooid</span>
                        </div>
                      </div>

                      <div className="flex gap-2">
                        <Button
                          variant="default"
                          onClick={() => navigate(`/compare/${assignment.id}`)}
                        >
                          Vergelijken
                        </Button>
                        {assignStats.judgements > 0 && (
                          <Button
                            variant="outline"
                            onClick={() => navigate(`/results/${assignment.id}`)}
                          >
                            Resultaten
                          </Button>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        )}

        {/* Info Section */}
        <Card className="mt-8">
          <CardHeader>
            <CardTitle>Hoe werkt het?</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-4">
              <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                <span className="font-bold text-primary">1</span>
              </div>
              <div>
                <h4 className="font-semibold mb-1">Upload teksten</h4>
                <p className="text-sm text-muted-foreground">
                  Upload DOCX of TXT bestanden. De teksten worden automatisch geanonimiseerd.
                </p>
              </div>
            </div>

            <div className="flex gap-4">
              <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                <span className="font-bold text-primary">2</span>
              </div>
              <div>
                <h4 className="font-semibold mb-1">Vergelijk paarsgewijs</h4>
                <p className="text-sm text-muted-foreground">
                  Bekijk twee teksten naast elkaar en kies welke beter is. Gebruik de sneltoetsen A, B of T.
                </p>
              </div>
            </div>

            <div className="flex gap-4">
              <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                <span className="font-bold text-primary">3</span>
              </div>
              <div>
                <h4 className="font-semibold mb-1">Bekijk resultaten</h4>
                <p className="text-sm text-muted-foreground">
                  Het systeem berekent automatisch een rangorde en cijfers. Export naar CSV, Excel of PDF.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Dashboard;
