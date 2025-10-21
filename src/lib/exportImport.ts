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
 * Importeer beoordelingsdata uit een CSV-bestand
 * CSV moet de volgende kolommen hebben: title, genre, originalFilename, anonymizedName, textAAnonymizedName, textBAnonymizedName, winner
 */
export async function importCSV(file: File): Promise<{
  newTexts: number;
  newJudgements: number;
  assignmentTitle: string;
  isConnected: boolean;
}> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = async (e) => {
      try {
        const csv = e.target?.result as string;
        const lines = csv.split('\n').filter(line => line.trim());
        
        if (lines.length < 2) {
          throw new Error('CSV bestand is leeg of heeft geen data');
        }

        // Parse header
        const header = lines[0].split(',').map(h => h.trim());
        const requiredColumns = ['title', 'genre', 'originalFilename', 'anonymizedName'];
        const hasRequired = requiredColumns.every(col => header.includes(col));
        
        if (!hasRequired) {
          throw new Error(`CSV moet de volgende kolommen bevatten: ${requiredColumns.join(', ')}`);
        }

        // Parse rows
        const rows = lines.slice(1).map(line => {
          const values = line.split(',').map(v => v.trim());
          const row: Record<string, string> = {};
          header.forEach((col, i) => {
            row[col] = values[i] || '';
          });
          return row;
        });

        if (rows.length === 0) {
          throw new Error('Geen data gevonden in CSV');
        }

        // Extract assignment info from first row
        const firstRow = rows[0];
        const assignmentTitle = firstRow.title;
        const genre = firstRow.genre || 'Algemeen';

        // Check if assignment exists
        const existing = await db.assignments
          .where('title')
          .equals(assignmentTitle)
          .filter(a => a.genre === genre)
          .first();

        let assignmentId: number;
        let numComparisons = 10; // default

        if (existing) {
          assignmentId = existing.id!;
          numComparisons = existing.numComparisons;
        } else {
          // Create new assignment
          assignmentId = await db.assignments.add({
            title: assignmentTitle,
            genre,
            numComparisons,
            createdAt: new Date(),
            updatedAt: new Date(),
          });
        }

        // Import texts
        let newTextsCount = 0;
        const textMap = new Map<string, number>(); // anonymizedName -> id

        // Get unique texts from rows
        const uniqueTexts = new Map<string, { originalFilename: string; anonymizedName: string }>();
        rows.forEach(row => {
          if (row.originalFilename && row.anonymizedName) {
            uniqueTexts.set(row.anonymizedName, {
              originalFilename: row.originalFilename,
              anonymizedName: row.anonymizedName,
            });
          }
        });

        for (const [anonymizedName, textData] of uniqueTexts) {
          const existingText = await db.texts
            .where('assignmentId')
            .equals(assignmentId)
            .filter(t => t.anonymizedName === anonymizedName)
            .first();

          if (existingText) {
            textMap.set(anonymizedName, existingText.id!);
          } else {
            const newId = await db.texts.add({
              assignmentId,
              originalFilename: textData.originalFilename,
              anonymizedName: textData.anonymizedName,
              content: '', // CSV doesn't contain content
              createdAt: new Date(),
            });
            textMap.set(anonymizedName, newId);
            newTextsCount++;
          }
        }

        // Import judgements if columns exist
        let newJudgementsCount = 0;
        const judgedPairs = new Set<string>();

        // Get existing judgements
        const existingJudgements = await db.judgements
          .where('assignmentId')
          .equals(assignmentId)
          .toArray();

        existingJudgements.forEach(j => {
          const pairKey = [j.textAId, j.textBId].sort().join('-');
          judgedPairs.add(pairKey);
        });

        // Check if judgement columns exist
        const hasJudgements = header.includes('textAAnonymizedName') && 
                              header.includes('textBAnonymizedName') && 
                              header.includes('winner');

        if (hasJudgements) {
          for (const row of rows) {
            const textAName = row.textAAnonymizedName;
            const textBName = row.textBAnonymizedName;
            const winner = row.winner;

            if (!textAName || !textBName || !winner) continue;

            const textAId = textMap.get(textAName);
            const textBId = textMap.get(textBName);

            if (!textAId || !textBId) {
              console.warn('Judgement overgeslagen: tekst niet gevonden', { textAName, textBName });
              continue;
            }

            // Check duplicate
            const pairKey = [textAId, textBId].sort().join('-');
            if (judgedPairs.has(pairKey)) {
              continue;
            }

            // Add judgement
            await db.judgements.add({
              assignmentId,
              textAId,
              textBId,
              winner: winner === 'tie' || winner === 'EQUAL' ? 'EQUAL' : (winner === textAName ? 'A' : 'B'),
              createdAt: new Date(),
            });

            judgedPairs.add(pairKey);
            newJudgementsCount++;
          }
        }

        // Check connectivity
        const allTexts = await db.texts.where('assignmentId').equals(assignmentId).toArray();
        const allJudgements = await db.judgements.where('assignmentId').equals(assignmentId).toArray();
        const connected = isConnected(allTexts, allJudgements);

        resolve({
          newTexts: newTextsCount,
          newJudgements: newJudgementsCount,
          assignmentTitle,
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
