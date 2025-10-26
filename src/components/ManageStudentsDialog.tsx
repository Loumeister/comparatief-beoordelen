import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Trash2, UserPlus } from 'lucide-react';
import { db, Text } from '@/lib/db';
import { useToast } from '@/hooks/use-toast';
import { ScrollArea } from '@/components/ui/scroll-area';

interface ManageStudentsDialogProps {
  assignmentId: number | null;
  assignmentTitle: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdate: () => void;
}

export function ManageStudentsDialog({
  assignmentId,
  assignmentTitle,
  open,
  onOpenChange,
  onUpdate
}: ManageStudentsDialogProps) {
  const { toast } = useToast();
  const [students, setStudents] = useState<Text[]>([]);
  const [newStudentName, setNewStudentName] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open && assignmentId) {
      loadStudents();
    }
  }, [open, assignmentId]);

  const loadStudents = async () => {
    if (!assignmentId) return;
    
    const texts = await db.texts
      .where('assignmentId')
      .equals(assignmentId)
      .toArray();
    
    setStudents(texts);
  };

  const handleAddStudent = async () => {
    if (!assignmentId || !newStudentName.trim()) return;

    setLoading(true);
    try {
      await db.texts.add({
        assignmentId,
        anonymizedName: newStudentName.trim(),
        content: '',
        originalFilename: 'Handmatig toegevoegd',
        createdAt: new Date()
      });

      toast({
        title: 'Leerling toegevoegd',
        description: `${newStudentName.trim()} is toegevoegd`
      });

      setNewStudentName('');
      await loadStudents();
      onUpdate();
    } catch (error) {
      console.error('Add student error:', error);
      toast({
        title: 'Fout bij toevoegen',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteStudent = async (student: Text) => {
    if (!confirm(`Weet je zeker dat je "${student.anonymizedName}" wilt verwijderen? Alle beoordelingen met deze leerling worden ook verwijderd.`)) {
      return;
    }

    setLoading(true);
    try {
      // Verwijder alle judgements die deze tekst bevatten
      await db.judgements
        .where('textAId')
        .equals(student.id!)
        .delete();
      
      await db.judgements
        .where('textBId')
        .equals(student.id!)
        .delete();

      // Verwijder de tekst zelf
      await db.texts.delete(student.id!);

      toast({
        title: 'Leerling verwijderd',
        description: `${student.anonymizedName} is verwijderd`
      });

      await loadStudents();
      onUpdate();
    } catch (error) {
      console.error('Delete student error:', error);
      toast({
        title: 'Fout bij verwijderen',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Beheer leerlingen - {assignmentTitle}</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4">
          {/* Toevoegen sectie */}
          <div className="space-y-2 p-4 border rounded-lg bg-muted/50">
            <Label htmlFor="new-student">Nieuwe leerling toevoegen</Label>
            <div className="flex gap-2">
              <Input
                id="new-student"
                value={newStudentName}
                onChange={(e) => setNewStudentName(e.target.value)}
                placeholder="Naam van leerling"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleAddStudent();
                  }
                }}
                disabled={loading}
              />
              <Button
                onClick={handleAddStudent}
                disabled={!newStudentName.trim() || loading}
              >
                <UserPlus className="w-4 h-4 mr-2" />
                Toevoegen
              </Button>
            </div>
          </div>

          {/* Lijst van leerlingen */}
          <div className="space-y-2">
            <Label>Huidige leerlingen ({students.length})</Label>
            <ScrollArea className="h-[300px] border rounded-lg p-4">
              {students.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">
                  Nog geen leerlingen
                </p>
              ) : (
                <div className="space-y-2">
                  {students.map((student) => (
                    <div
                      key={student.id}
                      className="flex items-center justify-between p-2 hover:bg-muted rounded-lg"
                    >
                      <div className="flex-1">
                        <p className="font-medium">{student.anonymizedName}</p>
                        <p className="text-xs text-muted-foreground">{student.originalFilename}</p>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDeleteStudent(student)}
                        disabled={loading}
                      >
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Sluiten
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
