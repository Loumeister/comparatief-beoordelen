// src/components/dashboard/AssignmentCard.tsx
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FileText, BarChart3, Trash2, Pencil, Download, Users, Settings, UserCheck } from "lucide-react";
import type { Assignment } from "@/lib/db";
import type { AssignmentStats } from "@/hooks/use-dashboard-data";

interface AssignmentCardProps {
  assignment: Assignment;
  stats: AssignmentStats;
  onEdit: (assignment: Assignment) => void;
  onDelete: (id: number, title: string) => void;
  onExport: (id: number, title: string) => void;
  onManageStudents: (id: number, title: string) => void;
  onManageGrading: (id: number, title: string) => void;
}

export function AssignmentCard({
  assignment,
  stats,
  onEdit,
  onDelete,
  onExport,
  onManageStudents,
  onManageGrading,
}: AssignmentCardProps) {
  const navigate = useNavigate();

  return (
    <Card className="hover:shadow-lg transition-shadow border-l-[3px] border-l-primary/40">
      <CardHeader>
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <CardTitle className="text-xl">{assignment.title}</CardTitle>
            <CardDescription>{assignment.genre}</CardDescription>
          </div>
          <div className="flex gap-1">
            <Button variant="ghost" size="sm" onClick={() => onEdit(assignment)}>
              <Pencil className="w-4 h-4" />
            </Button>
            <Button variant="ghost" size="sm" onClick={() => onDelete(assignment.id!, assignment.title)}>
              <Trash2 className="w-4 h-4 text-destructive" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-2 flex-wrap mb-4 text-sm text-muted-foreground">
          <div className="flex items-center gap-1.5 bg-muted/60 rounded px-2 py-0.5">
            <FileText className="w-3.5 h-3.5" />
            <span>{stats.texts} teksten</span>
          </div>
          <div className="flex items-center gap-1.5 bg-muted/60 rounded px-2 py-0.5">
            <BarChart3 className="w-3.5 h-3.5" />
            <span>{stats.judgements} vergelijkingen</span>
          </div>
          {stats.judgements > 0 && (
            <div className="flex items-center gap-1.5 bg-muted/60 rounded px-2 py-0.5">
              <span>{stats.reliabilityPct}% betrouwbaar</span>
            </div>
          )}
          {stats.raterCount > 1 && (
            <div className="flex items-center gap-1.5 bg-muted/60 rounded px-2 py-0.5">
              <UserCheck className="w-3.5 h-3.5" />
              <span>{stats.raterCount} beoordelaars</span>
            </div>
          )}
        </div>

        <div className="flex gap-2">
          <Button variant="default" onClick={() => navigate(`/compare/${assignment.id}`)}>
            Vergelijk
          </Button>
          {stats.judgements > 0 && (
            <Button variant="outline" onClick={() => navigate(`/results/${assignment.id}`)}>
              Resultaten
            </Button>
          )}
          <Button variant="outline" onClick={() => onManageStudents(assignment.id!, assignment.title)}>
            <Users className="w-4 h-4 mr-2" />
            Leerlingbeheer
          </Button>
          <Button variant="outline" onClick={() => onManageGrading(assignment.id!, assignment.title)}>
            <Settings className="w-4 h-4 mr-2" />
            Cijferinstellingen
          </Button>
          <Button variant="outline" onClick={() => onExport(assignment.id!, assignment.title)}>
            <Download className="w-4 h-4 mr-2" />
            Export
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
