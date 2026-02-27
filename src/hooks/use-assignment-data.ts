// src/hooks/use-assignment-data.ts
// Shared hook: loads assignment + texts + judgements + meta from IndexedDB.
// Used by Results, Compare, and Dashboard pages.

import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { db, Assignment, Text, Judgement, AssignmentMeta } from "@/lib/db";
import { getEffectiveJudgements } from "@/lib/effective-judgements";
import { useToast } from "@/hooks/use-toast";
import type { Anchor } from "@/lib/db";

export interface AssignmentData {
  assignment: Assignment;
  texts: Text[];
  allJudgements: Judgement[];       // raw from DB
  effectiveJudgements: Judgement[];  // after dedup + moderation
  meta: AssignmentMeta;
  anchors: Anchor[];
}

interface UseAssignmentDataOptions {
  /** Redirect to this path if assignment not found (default: "/") */
  notFoundRedirect?: string;
  /** Redirect here when there are no judgements (e.g., compare page) */
  noJudgementsRedirect?: string;
  /** Skip effective judgement filtering (for performance when not needed) */
  skipEffective?: boolean;
}

export function useAssignmentData(
  assignmentId: string | undefined,
  options: UseAssignmentDataOptions = {},
) {
  const { notFoundRedirect = "/", noJudgementsRedirect, skipEffective } = options;
  const navigate = useNavigate();
  const { toast } = useToast();

  const [data, setData] = useState<AssignmentData | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const id = parseInt(assignmentId!);
      if (!Number.isFinite(id)) {
        toast({ title: "Ongeldige opdracht", variant: "destructive" });
        navigate(notFoundRedirect);
        return null;
      }

      const assignment = await db.assignments.get(id);
      if (!assignment) {
        toast({ title: "Opdracht niet gevonden", variant: "destructive" });
        navigate(notFoundRedirect);
        return null;
      }

      const texts = await db.texts.where("assignmentId").equals(id).toArray();
      const allJudgements = await db.judgements.where("assignmentId").equals(id).toArray();
      const effectiveJudgements = skipEffective ? [] : getEffectiveJudgements(allJudgements);

      if (noJudgementsRedirect && effectiveJudgements.length === 0) {
        toast({ title: "Geen beoordelingen", description: "Begin met vergelijken om resultaten te zien" });
        navigate(noJudgementsRedirect);
        return null;
      }

      let meta = await db.assignmentMeta.get(id);
      if (!meta) {
        meta = {
          assignmentId: id,
          judgementMode: "accumulate",
          seRepeatThreshold: 1.0,
        };
        await db.assignmentMeta.put(meta);
      }

      const anchors = meta.anchors ?? [];

      const result: AssignmentData = {
        assignment,
        texts,
        allJudgements,
        effectiveJudgements,
        meta,
        anchors,
      };

      setData(result);
      setLoading(false);
      return result;
    } catch (error) {
      console.error("useAssignmentData error:", error);
      toast({ title: "Fout bij laden", variant: "destructive" });
      navigate(notFoundRedirect);
      return null;
    }
  }, [assignmentId, navigate, toast, notFoundRedirect, noJudgementsRedirect, skipEffective]);

  useEffect(() => {
    void load();
  }, [load]);

  return { data, loading, reload: load };
}
