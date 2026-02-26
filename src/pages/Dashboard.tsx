// src/pages/Dashboard.tsx
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Plus, FileText, Upload, BookOpen } from 'lucide-react';
import { Assignment } from '@/lib/db';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ManageStudentsDialog } from '@/components/ManageStudentsDialog';
import { GradingSettingsDialog } from '@/components/GradingSettingsDialog';
import { HeaderNav } from '@/components/HeaderNav';
import { AssignmentCard } from '@/components/dashboard/AssignmentCard';
import { useDashboardData } from '@/hooks/use-dashboard-data';

const Dashboard = () => {
  const navigate = useNavigate();

  const {
    assignments,
    stats,
    importing,
    fileInputRef,
    loadAssignments,
    handleEdit: saveEdit,
    handleExport,
    handleDelete,
    handleImport,
  } = useDashboardData();

  // Edit dialog state
  const [editingAssignment, setEditingAssignment] = useState<Assignment | null>(null);
  const [editTitle, setEditTitle] = useState('');

  // Sub-dialog state
  const [managingStudents, setManagingStudents] = useState<{ id: number; title: string } | null>(null);
  const [managingGrading, setManagingGrading] = useState<{ id: number; title: string } | null>(null);

  const handleEditClick = (assignment: Assignment) => {
    setEditingAssignment(assignment);
    setEditTitle(assignment.title);
  };

  const handleSaveEdit = async () => {
    if (!editingAssignment || !editTitle.trim()) return;
    await saveEdit(editingAssignment.id!, editTitle.trim());
    setEditingAssignment(null);
    setEditTitle('');
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Hero Section */}
      <div className="bg-gradient-to-br from-primary/10 to-[hsl(var(--choice-b))]/10 border-b">
        <div className="max-w-6xl mx-auto p-8">
          <div className="flex items-start justify-between mb-4">
            <h1 className="text-5xl font-bold">Vergelijkende Beoordeling</h1>
            <HeaderNav />
          </div>
          <p className="text-xl text-muted-foreground mb-6">
            Beoordeel leerlingteksten objectief door ze paarsgewijs te vergelijken
          </p>
          <div className="flex gap-3 flex-wrap">
            <Button size="lg" onClick={() => navigate('/upload')}>
              <Plus className="w-5 h-5 mr-2" />
              Nieuwe Opdracht
            </Button>
            <Button
              size="lg"
              variant="secondary"
              onClick={() => fileInputRef.current?.click()}
              disabled={importing}
              title="Importeer een eerder geëxporteerd bestand (van jezelf of een collega)"
            >
              <Upload className="w-5 h-5 mr-2" />
              {importing ? 'Importeren...' : 'Importeer bestand'}
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
              {assignments.map((assignment) => (
                <AssignmentCard
                  key={assignment.id}
                  assignment={assignment}
                  stats={stats.get(assignment.id!) || { texts: 0, judgements: 0, reliabilityPct: 0, raterCount: 0 }}
                  onEdit={handleEditClick}
                  onDelete={handleDelete}
                  onExport={handleExport}
                  onManageStudents={(id, title) => setManagingStudents({ id, title })}
                  onManageGrading={(id, title) => setManagingGrading({ id, title })}
                />
              ))}
            </div>
          </div>
        )}

        {/* Info Section */}
        <Card className="mt-8">
          <CardHeader>
            <CardTitle>Hoe werkt vergelijkende beoordeling?</CardTitle>
            <p className="text-sm text-muted-foreground">In drie stappen van leerlingteksten naar cijfers</p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-4">
              <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                <span className="font-bold text-primary">1</span>
              </div>
              <div>
                <h4 className="font-semibold mb-1">Upload teksten</h4>
                <p className="text-sm text-muted-foreground">
                  Maak een opdracht aan en upload de leerlingteksten (Word-bestanden of platte tekst). Je kunt ook alleen namen invoeren als je papieren teksten beoordeelt.
                </p>
              </div>
            </div>

            <div className="flex gap-4">
              <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                <span className="font-bold text-primary">2</span>
              </div>
              <div>
                <h4 className="font-semibold mb-1">Vergelijk steeds twee teksten</h4>
                <p className="text-sm text-muted-foreground">
                  Je krijgt telkens twee teksten naast elkaar te zien. Klik op de betere tekst — dat is alles. Het systeem kiest slimme paren en geeft aan wanneer je genoeg hebt vergeleken.
                </p>
              </div>
            </div>

            <div className="flex gap-4">
              <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                <span className="font-bold text-primary">3</span>
              </div>
              <div>
                <h4 className="font-semibold mb-1">Bekijk rangorde en cijfers</h4>
                <p className="text-sm text-muted-foreground">
                  Uit alle vergelijkingen berekent het systeem automatisch een rangorde met cijfers. Je kunt de resultaten downloaden als Excel of PDF.
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
                onKeyDown={(e) => { if (e.key === 'Enter') handleSaveEdit(); }}
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
