// src/hooks/use-dashboard-data.ts
// Data loading, CRUD operations, and file import for the Dashboard page.

import { useEffect, useState, useRef, useCallback } from "react";
import { db, Assignment } from "@/lib/db";
import { importDataset, importCSV, importResultsFromXLSX, exportDataset } from "@/lib/exportImport";
import { calculateBradleyTerry } from "@/lib/bradley-terry";
import { SE_RELIABLE } from "@/lib/constants";
import { useToast } from "@/hooks/use-toast";

export interface AssignmentStats {
  texts: number;
  judgements: number;
  reliabilityPct: number;
  raterCount: number;
}

export function useDashboardData() {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [stats, setStats] = useState<Map<number, AssignmentStats>>(new Map());
  const [importing, setImporting] = useState(false);

  const loadAssignments = useCallback(async () => {
    const allAssignments = await db.assignments.orderBy('createdAt').reverse().toArray();
    setAssignments(allAssignments);

    const statsMap = new Map<number, AssignmentStats>();
    for (const assign of allAssignments) {
      const texts = await db.texts.where('assignmentId').equals(assign.id!).count();
      const judgements = await db.judgements.where('assignmentId').equals(assign.id!).count();

      let reliabilityPct = 0;
      let raterCount = 0;
      if (judgements > 0 && texts > 0) {
        const textsData = await db.texts.where('assignmentId').equals(assign.id!).toArray();
        const judgementsData = await db.judgements.where('assignmentId').equals(assign.id!).toArray();

        const results = calculateBradleyTerry(textsData, judgementsData);
        const reliableCount = results.filter(r => r.standardError <= SE_RELIABLE).length;
        reliabilityPct = Math.round((reliableCount / results.length) * 100);

        const raters = new Set(judgementsData.map(j => j.raterId ?? 'unknown'));
        raterCount = raters.size;
      }

      statsMap.set(assign.id!, { texts, judgements, reliabilityPct, raterCount });
    }
    setStats(statsMap);
  }, []);

  useEffect(() => {
    void loadAssignments();
  }, [loadAssignments]);

  // ─── CRUD ───

  const handleEdit = useCallback(async (assignmentId: number, newTitle: string) => {
    try {
      await db.assignments.update(assignmentId, { title: newTitle, updatedAt: new Date() });
      toast({ title: 'Titel aangepast', description: `Titel is bijgewerkt naar "${newTitle}"` });
      await loadAssignments();
    } catch (error) {
      console.error('Update error:', error);
      toast({ title: 'Fout bij opslaan', variant: 'destructive' });
    }
  }, [toast, loadAssignments]);

  const handleExport = useCallback(async (assignmentId: number, title: string) => {
    try {
      await exportDataset(assignmentId);
      toast({ title: 'Export gelukt', description: `"${title}" is geëxporteerd als JSON` });
    } catch (error) {
      console.error('Export error:', error);
      toast({ title: 'Fout bij exporteren', variant: 'destructive' });
    }
  }, [toast]);

  const handleDelete = useCallback(async (id: number, title: string) => {
    if (!confirm(`Weet je zeker dat je "${title}" wilt verwijderen?`)) return;
    try {
      await db.texts.where('assignmentId').equals(id).delete();
      await db.judgements.where('assignmentId').equals(id).delete();
      await db.scores.where('assignmentId').equals(id).delete();
      await db.assignments.delete(id);
      toast({ title: 'Opdracht verwijderd', description: `"${title}" is verwijderd` });
      await loadAssignments();
    } catch (error) {
      console.error('Delete error:', error);
      toast({ title: 'Fout bij verwijderen', variant: 'destructive' });
    }
  }, [toast, loadAssignments]);

  // ─── Import ───

  const handleImport = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImporting(true);
    try {
      const fileName = file.name.toLowerCase();

      if (fileName.endsWith('.xlsx') || fileName.endsWith('.xls')) {
        const result = await importResultsFromXLSX(file);
        toast({ title: 'Excel resultaten geïmporteerd', description: `${result.assignmentTitle}: ${result.newTexts} teksten toegevoegd` });
      } else if (fileName.endsWith('.csv')) {
        const result = await importCSV(file);
        toast({ title: 'CSV dataset geïmporteerd', description: `${result.assignmentTitle}: ${result.newTexts} nieuwe teksten, ${result.newJudgements} nieuwe oordelen` });
        if (!result.isConnected) {
          toast({ title: 'Let op: grafiek niet verbonden', description: 'Sommige teksten zijn nog niet gekoppeld – voer extra vergelijkingen uit.', variant: 'default' });
        }
      } else if (fileName.endsWith('.json')) {
        const result = await importDataset(file);
        toast({ title: 'JSON dataset geïmporteerd', description: `${result.assignmentTitle}: ${result.newTexts} nieuwe teksten, ${result.newJudgements} nieuwe oordelen` });
        if (!result.isConnected) {
          toast({ title: 'Let op: grafiek niet verbonden', description: 'Sommige teksten zijn nog niet gekoppeld – voer extra vergelijkingen uit.', variant: 'default' });
        }
      } else {
        throw new Error('Ongeldig bestandsformaat. Gebruik .xlsx, .csv of .json');
      }

      await loadAssignments();
    } catch (error) {
      console.error('Import error:', error);
      toast({ title: 'Import mislukt', description: error instanceof Error ? error.message : 'Ongeldig bestandsformaat', variant: 'destructive' });
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }, [toast, loadAssignments]);

  return {
    assignments,
    stats,
    importing,
    fileInputRef,
    loadAssignments,
    handleEdit,
    handleExport,
    handleDelete,
    handleImport,
  };
}
