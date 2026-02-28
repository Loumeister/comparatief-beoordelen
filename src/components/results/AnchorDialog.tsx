// src/components/results/AnchorDialog.tsx
import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import type { Anchor } from "@/lib/db";
import type { GradingConfig } from "@/hooks/use-results-data";

interface AnchorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  target: { textId: number; name: string; currentGrade: number } | null;
  anchors: Anchor[];
  gradingConfig: GradingConfig;
  onSave: (textId: number, grade: number) => Promise<void>;
  onRemove: (textId: number) => Promise<void>;
}

export function AnchorDialog({ open, onOpenChange, target, anchors, gradingConfig, onSave, onRemove }: AnchorDialogProps) {
  const { toast } = useToast();
  const [gradeInput, setGradeInput] = useState("");

  useEffect(() => {
    if (target) {
      const existing = anchors.find(a => a.textId === target.textId);
      setGradeInput(existing ? existing.grade.toFixed(1) : target.currentGrade.toFixed(1));
    }
  }, [target, anchors]);

  const handleSave = async () => {
    if (!target) return;
    const grade = parseFloat(gradeInput);
    if (isNaN(grade) || grade < gradingConfig.min || grade > gradingConfig.max) {
      toast({ title: "Ongeldig cijfer", description: `Voer een cijfer in tussen ${gradingConfig.min} en ${gradingConfig.max}`, variant: "destructive" });
      return;
    }
    await onSave(target.textId, grade);
    onOpenChange(false);
  };

  const isExistingAnchor = target ? anchors.some(a => a.textId === target.textId) : false;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Ijkpunt instellen</DialogTitle>
        </DialogHeader>
        {target && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Welk cijfer hoort bij <strong>{target.name}</strong>? De overige cijfers worden automatisch herschaald.
            </p>
            <div className="flex items-center gap-3">
              <Input
                type="number"
                min={gradingConfig.min}
                max={gradingConfig.max}
                step="0.1"
                value={gradeInput}
                onChange={(e) => setGradeInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleSave(); }}
                className="w-24 text-center text-lg font-bold"
                autoFocus
              />
              <span className="text-sm text-muted-foreground">
                (huidig relatief: {target.currentGrade.toFixed(1)})
              </span>
            </div>
            <div className="flex justify-between">
              {isExistingAnchor && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-destructive hover:text-destructive"
                  onClick={async () => {
                    if (!confirm(`Verwijder het ijkpunt voor "${target.name}"?`)) return;
                    await onRemove(target.textId);
                    onOpenChange(false);
                  }}
                >
                  Verwijder ijkpunt
                </Button>
              )}
              <div className="flex gap-2 ml-auto">
                <Button variant="outline" onClick={() => onOpenChange(false)}>
                  Annuleren
                </Button>
                <Button onClick={handleSave}>
                  Opslaan
                </Button>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
