// src/components/results/FeedbackDialog.tsx
import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Download } from "lucide-react";

interface FeedbackDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onExport: (showGrades: boolean) => void;
}

export function FeedbackDialog({ open, onOpenChange, onExport }: FeedbackDialogProps) {
  const [showGrades, setShowGrades] = useState(true);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Leerlingfeedback exporteren</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Exporteer per leerling alle verzamelde opmerkingen als PDF.
          </p>
          <div className="flex items-center gap-2">
            <Checkbox
              id="feedback-grades"
              checked={showGrades}
              onCheckedChange={(checked) => setShowGrades(checked === true)}
            />
            <Label htmlFor="feedback-grades" className="text-sm cursor-pointer">
              Toon cijfer, label en rang
            </Label>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Annuleren
            </Button>
            <Button onClick={() => {
              onExport(showGrades);
              onOpenChange(false);
            }}>
              <Download className="w-4 h-4 mr-2" />
              Exporteer PDF
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
