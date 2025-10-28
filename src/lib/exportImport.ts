import { db, Assignment, Text, Judgement } from './db';
import { isConnected } from './graph';
import ExcelJS from 'exceljs';

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
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
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
            createdAt: assignmentData.createdAt ? new Date(assignmentData.createdAt) : new Date(),
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
              t.anonymizedName === text.anonymizedName &&
              (!text.originalFilename || t.originalFilename === text.originalFilename)
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
              createdAt: textData.createdAt ? new Date(textData.createdAt) : new Date(),
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
            createdAt: judgementData.createdAt ? new Date(judgementData.createdAt) : new Date(),
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
 * Helper: map winner value (tolerant voor 'A'|'B'|'EQUAL'|'TIE' of namen)
 */
function mapWinner(raw: string, textAName: string, textBName: string): 'A' | 'B' | 'EQUAL' | null {
  const w = (raw || '').trim().toUpperCase();
  if (w === 'A' || w === 'B' || w === 'EQUAL') return w as 'A' | 'B' | 'EQUAL';
  if (w === 'TIE') return 'EQUAL';
  if (raw === textAName) return 'A';
  if (raw === textBName) return 'B';
  return null; // onbekend -> overslaan
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

        // Detect delimiter (comma vs semicolon)
        const rawHeader = lines[0];
        const delimiter = rawHeader.includes(';') && !rawHeader.includes(',') ? ';' : ',';
        
        // Parse header
        const header = rawHeader.split(delimiter).map(h => h.trim());
        const requiredColumns = ['title', 'genre', 'originalFilename', 'anonymizedName'];
        const hasRequired = requiredColumns.every(col => header.includes(col));
        
        if (!hasRequired) {
          throw new Error(`CSV moet de volgende kolommen bevatten: ${requiredColumns.join(', ')}`);
        }

        // Parse rows
        const rows = lines.slice(1).map(line => {
          const values = line.split(delimiter).map(v => v.trim());
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

            // Map winner
            const mapped = mapWinner(winner, textAName, textBName);
            if (!mapped) {
              console.warn('Judgement overgeslagen: ongeldige winner waarde', { winner, textAName, textBName });
              continue;
            }

            // Add judgement
            await db.judgements.add({
              assignmentId,
              textAId,
              textBId,
              winner: mapped,
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
 * Importeer resultaten uit een Excel-bestand (geëxporteerd via Results.tsx)
 * Excel moet de volgende kolommen hebben: Tekst, Rang, Label, Cijfer, Theta, SE, Betrouwbaarheid
 */
export async function importResultsFromXLSX(file: File): Promise<{
  newTexts: number;
  assignmentTitle: string;
}> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = async (e) => {
      try {
        const buffer = e.target?.result as ArrayBuffer;
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(buffer);
        
        // Lees eerste sheet
        const worksheet = workbook.worksheets[0];
        
        if (!worksheet) {
          throw new Error('Excel bestand bevat geen sheets');
        }

        const jsonData: any[] = [];
        const headers: string[] = [];
        
        worksheet.eachRow((row, rowNumber) => {
          if (rowNumber === 1) {
            // Header row
            row.eachCell((cell) => {
              headers.push(String(cell.value || ''));
            });
          } else {
            // Data rows
            const rowData: any = {};
            row.eachCell((cell, colNumber) => {
              const header = headers[colNumber - 1];
              if (header) {
                rowData[header] = cell.value;
              }
            });
            jsonData.push(rowData);
          }
        });
        
        if (jsonData.length === 0) {
          throw new Error('Excel bestand bevat geen data');
        }

        // Valideer kolommen
        const firstRow = jsonData[0];
        const requiredColumns = ['Tekst', 'Rang', 'Label', 'Cijfer', 'Theta', 'SE', 'Betrouwbaarheid'];
        const missingColumns = requiredColumns.filter(col => !(col in firstRow));
        
        if (missingColumns.length > 0) {
          throw new Error(`Excel mist de volgende kolommen: ${missingColumns.join(', ')}`);
        }

        // Haal aantal vergelijkingen uit eerste rij (indien aanwezig)
        const numComparisons = firstRow['Aantal vergelijkingen'] 
          ? parseInt(String(firstRow['Aantal vergelijkingen'])) 
          : 10;

        // Haal titel uit bestandsnaam (verwijder _resultaten.xlsx suffix)
        const assignmentTitle = file.name
          .replace(/_resultaten\.xlsx$/i, '')
          .replace(/\.xlsx$/i, '')
          .trim() || 'Geïmporteerde opdracht';

        // Check of assignment al bestaat
        const existing = await db.assignments
          .where('title')
          .equals(assignmentTitle)
          .first();

        let assignmentId: number;

        if (existing) {
          // Gebruik bestaande opdracht
          assignmentId = existing.id!;
          
          // Verwijder oude scores
          await db.scores.where('assignmentId').equals(assignmentId).delete();
        } else {
          // Maak nieuwe opdracht aan
          assignmentId = await db.assignments.add({
            title: assignmentTitle,
            genre: 'Geïmporteerd',
            numComparisons,
            createdAt: new Date(),
            updatedAt: new Date(),
          });
        }

        // Import teksten en scores
        let newTextsCount = 0;
        
        for (const row of jsonData) {
          const anonymizedName = String(row['Tekst'] || '').trim();
          const rank = parseInt(String(row['Rang'] || '0'));
          const label = String(row['Label'] || 'Gemiddeld').trim();
          const grade = parseFloat(String(row['Cijfer'] || '7').replace(',', '.'));
          const theta = parseFloat(String(row['Theta'] || '0').replace(',', '.'));
          const se = parseFloat(String(row['SE'] || '1').replace(',', '.'));
          const reliability = String(row['Betrouwbaarheid'] || 'Onvoldoende gegevens').trim();

          if (!anonymizedName) {
            console.warn('Rij overgeslagen: geen tekst naam', row);
            continue;
          }

          // Check of tekst al bestaat
          const existingText = await db.texts
            .where('assignmentId')
            .equals(assignmentId)
            .filter(t => t.anonymizedName === anonymizedName)
            .first();

          let textId: number;

          if (existingText) {
            textId = existingText.id!;
          } else {
            // Maak nieuwe tekst aan (zonder content)
            textId = await db.texts.add({
              assignmentId,
              originalFilename: anonymizedName,
              anonymizedName: anonymizedName,
              content: '',
              createdAt: new Date(),
            });
            newTextsCount++;
          }

          // Voeg score toe
          await db.scores.add({
            assignmentId,
            textId,
            theta,
            standardError: se,
            rank,
            label,
            grade,
            reliability,
            calculatedAt: new Date(),
          });
        }

        resolve({
          newTexts: newTextsCount,
          assignmentTitle,
        });
      } catch (error) {
        reject(error);
      }
    };

    reader.onerror = () => reject(new Error('Fout bij lezen bestand'));
    reader.readAsArrayBuffer(file);
  });
}

