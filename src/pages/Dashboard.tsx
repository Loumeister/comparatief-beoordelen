import { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Plus, FileText, BarChart3, Trash2, Upload, Pencil, Download, Users, Settings, BookOpen } from 'lucide-react';
import { db, Assignment } from '@/lib/db';
import { importDataset, importCSV, importResultsFromXLSX, exportDataset } from '@/lib/exportImport';
import { useToast } from '@/hooks/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ManageStudentsDialog } from '@/components/ManageStudentsDialog';
import { GradingSettingsDialog } from '@/components/GradingSettingsDialog';

const Dashboard = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [stats, setStats] = useState<Map<number, { texts: number; judgements: number }>>(new Map());
  const [importing, setImporting] = useState(false);
  const [editingAssignment, setEditingAssignment] = useState<Assignment | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [managingStudents, setManagingStudents] = useState<{ id: number; title: string } | null>(null);
  const [managingGrading, setManagingGrading] = useState<{ id: number; title: string } | null>(null);

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

  const handleEdit = (assignment: Assignment) => {
    setEditingAssignment(assignment);
    setEditTitle(assignment.title);
  };

  const handleSaveEdit = async () => {
    if (!editingAssignment || !editTitle.trim()) return;

    try {
      await db.assignments.update(editingAssignment.id!, {
        title: editTitle.trim(),
        updatedAt: new Date()
      });

      toast({
        title: 'Titel aangepast',
        description: `Titel is bijgewerkt naar "${editTitle.trim()}"`
      });

      setEditingAssignment(null);
      setEditTitle('');
      loadAssignments();
    } catch (error) {
      console.error('Update error:', error);
      toast({
        title: 'Fout bij opslaan',
        variant: 'destructive'
      });
    }
  };

  const handleExport = async (assignmentId: number, title: string) => {
    try {
      await exportDataset(assignmentId);
      toast({
        title: 'Export gelukt',
        description: `"${title}" is geëxporteerd als JSON`
      });
    } catch (error) {
      console.error('Export error:', error);
      toast({
        title: 'Fout bij exporteren',
        variant: 'destructive'
      });
    }
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
      const fileName = file.name.toLowerCase();
      
      // Determine file type and import accordingly
      if (fileName.endsWith('.xlsx') || fileName.endsWith('.xls')) {
        // Excel resultaten import
        const result = await importResultsFromXLSX(file);
        
        toast({
          title: 'Excel resultaten geïmporteerd',
          description: `${result.assignmentTitle}: ${result.newTexts} teksten toegevoegd`,
        });
      } else if (fileName.endsWith('.csv')) {
        // CSV dataset import
        const result = await importCSV(file);
        
        toast({
          title: 'CSV dataset geïmporteerd',
          description: `${result.assignmentTitle}: ${result.newTexts} nieuwe teksten, ${result.newJudgements} nieuwe oordelen`,
        });

        if (!result.isConnected) {
          toast({
            title: 'Let op: grafiek niet verbonden',
            description: 'Sommige teksten zijn nog niet gekoppeld – voer extra vergelijkingen uit.',
            variant: 'default',
          });
        }
      } else if (fileName.endsWith('.json')) {
        // JSON dataset import
        const result = await importDataset(file);
        
        toast({
          title: 'JSON dataset geïmporteerd',
          description: `${result.assignmentTitle}: ${result.newTexts} nieuwe teksten, ${result.newJudgements} nieuwe oordelen`,
        });

        if (!result.isConnected) {
          toast({
            title: 'Let op: grafiek niet verbonden',
            description: 'Sommige teksten zijn nog niet gekoppeld – voer extra vergelijkingen uit.',
            variant: 'default',
          });
        }
      } else {
        throw new Error('Ongeldig bestandsformaat. Gebruik .xlsx, .csv of .json');
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
              accept=".json,.csv,.xlsx,.xls"
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
            <h2 className="text-2xl font-bold mb-6">Je beoordelingen</h2>
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
                        <div className="flex gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleEdit(assignment)}
                          >
                            <Pencil className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDelete(assignment.id!, assignment.title)}
                          >
                            <Trash2 className="w-4 h-4 text-destructive" />
                          </Button>
                        </div>
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
                        <Button
                          variant="outline"
                          onClick={() => setManagingStudents({ id: assignment.id!, title: assignment.title })}
                        >
                          <Users className="w-4 h-4 mr-2" />
                          Beheer leerlingen
                        </Button>
                        <Button
                          variant="outline"
                          onClick={() => setManagingGrading({ id: assignment.id!, title: assignment.title })}
                        >
                          <Settings className="w-4 h-4 mr-2" />
                          Cijferinstellingen
                        </Button>
                        <Button
                          variant="outline"
                          onClick={() => handleExport(assignment.id!, assignment.title)}
                        >
                          <Download className="w-4 h-4 mr-2" />
                          Export
                        </Button>
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

        {/* README Link */}
        <div className="mt-8 text-center">
          <Button 
            variant="link" 
            onClick={() => navigate('/readme')}
            className="text-muted-foreground"
          >
            <BookOpen className="w-4 h-4 mr-2" />
            Bekijk de volledige handleiding
          </Button>
        </div>
      </div>

      {/* Edit Dialog */}
      <Dialog open={!!editingAssignment} onOpenChange={(open) => !open && setEditingAssignment(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Titel aanpassen</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="title">Nieuwe titel</Label>
              <Input
                id="title"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                placeholder="Voer een nieuwe titel in"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleSaveEdit();
                  }
                }}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingAssignment(null)}>
              Annuleren
            </Button>
            <Button onClick={handleSaveEdit} disabled={!editTitle.trim()}>
              Opslaan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Manage Students Dialog */}
      <ManageStudentsDialog
        assignmentId={managingStudents?.id ?? null}
        assignmentTitle={managingStudents?.title ?? ''}
        open={!!managingStudents}
        onOpenChange={(open) => !open && setManagingStudents(null)}
        onUpdate={loadAssignments}
      />

      {/* Grading Settings Dialog */}
      <GradingSettingsDialog
        assignmentId={managingGrading?.id ?? 0}
        assignmentTitle={managingGrading?.title ?? ''}
        open={!!managingGrading}
        onOpenChange={(open) => !open && setManagingGrading(null)}
      />
    </div>
  );
};

export default Dashboard;
