import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { db } from "@/lib/db";
import { useToast } from "@/hooks/use-toast";

interface GradingSettingsDialogProps {
  assignmentId: number;
  assignmentTitle: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const GradingSettingsDialog = ({
  assignmentId,
  assignmentTitle,
  open,
  onOpenChange,
}: GradingSettingsDialogProps) => {
  const { toast } = useToast();
  const [gradeBase, setGradeBase] = useState(7.0);
  const [gradeScale, setGradeScale] = useState(1.2);

  useEffect(() => {
    if (open) {
      loadSettings();
    }
  }, [open, assignmentId]);

  const loadSettings = async () => {
    const meta = await db.assignmentMeta.get(assignmentId);
    if (meta) {
      setGradeBase(meta.gradeBase ?? 7.0);
      setGradeScale(meta.gradeScale ?? 1.2);
    }
  };

  const handleSave = async () => {
    try {
      await db.assignmentMeta.update(assignmentId, {
        gradeBase,
        gradeScale,
      });

      toast({
        title: "Instellingen opgeslagen",
        description: "Cijferberekening aangepast",
      });

      onOpenChange(false);
    } catch (error) {
      console.error("Error saving grading settings:", error);
      toast({
        title: "Fout bij opslaan",
        variant: "destructive",
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Cijferinstellingen - {assignmentTitle}</DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="gradeBase">Basiscijfer (5.0 - 8.0)</Label>
            <Input
              id="gradeBase"
              type="number"
              min="5.0"
              max="8.0"
              step="0.1"
              value={gradeBase}
              onChange={(e) => setGradeBase(parseFloat(e.target.value))}
            />
            <p className="text-sm text-muted-foreground">
              Cijfer voor gemiddelde prestatie (z = 0)
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="gradeScale">Schaal per σ (0.6 - 1.6)</Label>
            <Input
              id="gradeScale"
              type="number"
              min="0.6"
              max="1.6"
              step="0.1"
              value={gradeScale}
              onChange={(e) => setGradeScale(parseFloat(e.target.value))}
            />
            <p className="text-sm text-muted-foreground">
              Hoeveel cijferpunten per standaarddeviatie
            </p>
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Annuleren
            </Button>
            <Button onClick={handleSave}>Opslaan</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
