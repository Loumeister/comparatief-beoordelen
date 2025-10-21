import { db, Assignment, Text, Judgement } from './db';

export interface DatasetExport {
  assignment: Assignment;
  texts: Text[];
  judgements: Judgement[];
}

/**
 * Exporteer beoordelingsdata voor een specifieke opdracht als JSON
 */
export async function exportDataset(assignmentId: number): Promise<void> {
  const assignment = await db.assignments.get(assignmentId);
  if (!assignment) {
    throw new Error('Opdracht niet gevonden');
  }

  const texts = await db.texts.where('assignmentId').equals(assignmentId).toArray();
  const judgements = await db.judgements.where('assignmentId').equals(assignmentId).toArray();

  const data: DatasetExport = {
    assignment,
    texts,
    judgements,
  };

  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${assignment.title}_data.json`;
  link.click();
  URL.revokeObjectURL(url);
}

/**
 * Importeer beoordelingsdata uit een JSON-bestand
 * Retourneert stats over toegevoegde data
 */
export async function importDataset(file: File): Promise<{
  newTexts: number;
  newJudgements: number;
  assignmentTitle: string;
  isConnected: boolean;
}> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = async (e) => {
      try {
        const json = e.target?.result as string;
        const data: DatasetExport = JSON.parse(json);

        // Valideer data structuur
        if (!data.assignment || !data.texts || !data.judgements) {
          throw new Error('Ongeldig bestandsformaat');
        }

        const { assignment, texts, judgements } = data;

        // Check of assignment al bestaat (op basis van title + genre)
        const existing = await db.assignments
          .where('title')
          .equals(assignment.title)
          .filter(a => a.genre === assignment.genre)
          .first();

        let assignmentId: number;

        if (existing) {
          // Gebruik bestaande opdracht
          assignmentId = existing.id!;
        } else {
          // Maak nieuwe opdracht aan (zonder id, laat Dexie auto-increment)
          const { id, ...assignmentData } = assignment;
          assignmentId = await db.assignments.add({
            ...assignmentData,
            createdAt: new Date(assignmentData.createdAt),
            updatedAt: new Date(),
          });
        }

        // Import texts - vermijd duplicaten op originalFilename + anonymizedName
        let newTextsCount = 0;
        const textIdMap = new Map<number, number>(); // oude id -> nieuwe id

        for (const text of texts) {
          const existingText = await db.texts
            .where('assignmentId')
            .equals(assignmentId)
            .filter(t => 
              t.originalFilename === text.originalFilename && 
              t.anonymizedName === text.anonymizedName
            )
            .first();

          if (existingText) {
            // Map oude id naar bestaande id
            textIdMap.set(text.id!, existingText.id!);
          } else {
            // Voeg nieuwe tekst toe
            const oldId = text.id!;
            const { id, ...textData } = text;
            const newId = await db.texts.add({
              ...textData,
              assignmentId,
              createdAt: new Date(textData.createdAt),
            });
            textIdMap.set(oldId, newId);
            newTextsCount++;
          }
        }

        // Import judgements - vermijd duplicaten op textAId + textBId combinatie
        let newJudgementsCount = 0;
        const judgedPairs = new Set<string>();

        // Haal bestaande oordelen op voor deze opdracht
        const existingJudgements = await db.judgements
          .where('assignmentId')
          .equals(assignmentId)
          .toArray();

        existingJudgements.forEach(j => {
          const pairKey = [j.textAId, j.textBId].sort().join('-');
          judgedPairs.add(pairKey);
        });

        for (const judgement of judgements) {
          // Map oude text IDs naar nieuwe IDs
          const newTextAId = textIdMap.get(judgement.textAId);
          const newTextBId = textIdMap.get(judgement.textBId);

          if (!newTextAId || !newTextBId) {
            console.warn('Judgement overgeslagen: tekst niet gevonden', judgement);
            continue;
          }

          // Check duplicaat
          const pairKey = [newTextAId, newTextBId].sort().join('-');
          if (judgedPairs.has(pairKey)) {
            continue; // Skip duplicaat
          }

          // Voeg oordeel toe
          const { id, ...judgementData } = judgement;
          await db.judgements.add({
            ...judgementData,
            assignmentId,
            textAId: newTextAId,
            textBId: newTextBId,
            createdAt: new Date(judgementData.createdAt),
          });
          
          judgedPairs.add(pairKey);
          newJudgementsCount++;
        }

        // Check of grafiek verbonden is
        const allTexts = await db.texts.where('assignmentId').equals(assignmentId).toArray();
        const allJudgements = await db.judgements.where('assignmentId').equals(assignmentId).toArray();
        const connected = isConnected(allTexts, allJudgements);

        resolve({
          newTexts: newTextsCount,
          newJudgements: newJudgementsCount,
          assignmentTitle: assignment.title,
          isConnected: connected,
        });
      } catch (error) {
        reject(error);
      }
    };

    reader.onerror = () => reject(new Error('Fout bij lezen bestand'));
    reader.readAsText(file);
  });
}

/**
 * Check of de vergelijkingsgrafiek verbonden is
 * (alle teksten zijn bereikbaar via judgements)
 */
export function isConnected(texts: Text[], judgements: Judgement[]): boolean {
  if (texts.length === 0) return true;
  if (texts.length === 1) return true;
  if (judgements.length === 0) return false;

  // DSU (Disjoint Set Union) om verbondenheid te checken
  const parent = new Map<number, number>();
  const rank = new Map<number, number>();

  function find(x: number): number {
    if (!parent.has(x)) {
      parent.set(x, x);
      rank.set(x, 0);
    }
    if (parent.get(x) !== x) {
      parent.set(x, find(parent.get(x)!));
    }
    return parent.get(x)!;
  }

  function union(x: number, y: number): void {
    const rootX = find(x);
    const rootY = find(y);
    if (rootX === rootY) return;

    const rankX = rank.get(rootX) || 0;
    const rankY = rank.get(rootY) || 0;

    if (rankX < rankY) {
      parent.set(rootX, rootY);
    } else if (rankX > rankY) {
      parent.set(rootY, rootX);
    } else {
      parent.set(rootY, rootX);
      rank.set(rootX, rankX + 1);
    }
  }

  // Initialiseer alle teksten
  texts.forEach(t => find(t.id!));

  // Union alle gekoppelde teksten
  judgements.forEach(j => {
    union(j.textAId, j.textBId);
  });

  // Check of alle teksten dezelfde root hebben
  const roots = new Set(texts.map(t => find(t.id!)));
  return roots.size === 1;
}
