import Dexie, { Table } from 'dexie';

export interface Assignment {
  id?: number;
  title: string;
  genre: string;
  numComparisons: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface Text {
  id?: number;
  assignmentId: number;
  content: string;
  originalFilename: string;
  anonymizedName: string;
  createdAt: Date;
}

export interface Judgement {
  id?: number;
  assignmentId: number;
  textAId: number;
  textBId: number;
  winner: 'A' | 'B' | 'EQUAL';
  comment?: string;
  createdAt: Date;
  raterId?: string;
  sessionId?: string;
  source?: 'human' | 'ai';
  supersedesJudgementId?: number;
  isFinal?: boolean;
  pairKey?: string; // "smallId-bigId" voor snellere queries
}

export interface Score {
  id?: number;
  assignmentId: number;
  textId: number;
  theta: number;
  standardError: number;
  rank: number;
  label: string;
  grade: number;
  reliability: string;
  calculatedAt: Date;
}

export interface PreviousFit {
  id?: number;
  assignmentId: number;
  results: { textId: number; rank: number; grade: number }[];
  calculatedAt: Date;
}

export interface AssignmentMeta {
  assignmentId: number;
  judgementMode?: 'accumulate' | 'replace' | 'moderate';
  seRepeatThreshold?: number;
}

export class AssessmentDB extends Dexie {
  assignments!: Table<Assignment, number>;
  texts!: Table<Text, number>;
  judgements!: Table<Judgement, number>;
  scores!: Table<Score, number>;
  previousFits!: Table<PreviousFit, number>;
  assignmentMeta!: Table<AssignmentMeta, number>;

  constructor() {
    super('AssessmentDB');
    
    this.version(1).stores({
      assignments: '++id, title, createdAt',
      texts: '++id, assignmentId, anonymizedName',
      judgements: '++id, assignmentId, textAId, textBId',
      scores: '++id, assignmentId, textId, rank'
    });
    
    this.version(2).stores({
      assignments: '++id, title, createdAt',
      texts: '++id, assignmentId, anonymizedName',
      judgements: '++id, assignmentId, textAId, textBId',
      scores: '++id, assignmentId, textId, rank',
      previousFits: '++id, assignmentId, calculatedAt'
    });

    this.version(3).stores({
      assignments: '++id, title, createdAt',
      texts: '++id, assignmentId, anonymizedName',
      judgements: '++id, assignmentId, pairKey, raterId, supersedesJudgementId, createdAt',
      scores: '++id, assignmentId, textId, rank',
      previousFits: '++id, assignmentId, calculatedAt',
      assignmentMeta: 'assignmentId'
    }).upgrade(async tx => {
      // Migreer bestaande judgements: zet defaults en pairKey
      await tx.table('judgements').toCollection().modify(j => {
        if (j.source === undefined) j.source = 'human';
        if (j.isFinal === undefined) j.isFinal = false;
        if (!j.pairKey) {
          j.pairKey = [j.textAId, j.textBId].sort((a, b) => a - b).join('-');
        }
      });
      
      // Maak assignmentMeta entries voor bestaande assignments (idempotent)
      const assignments = await tx.table('assignments').toArray();
      const metaTable = tx.table('assignmentMeta');
      for (const a of assignments) {
        const exists = await metaTable.get(a.id!);
        if (!exists) {
          await metaTable.put({
            assignmentId: a.id!,
            judgementMode: 'accumulate',
            seRepeatThreshold: 0.8
          });
        }
      }
    });

    this.version(4).stores({
      assignments: '++id, title, createdAt',
      texts: '++id, assignmentId, anonymizedName',
      // voeg pairKey en createdAt toe voor snelle lookups/sort
      judgements: '++id, assignmentId, pairKey, textAId, textBId, raterId, supersedesJudgementId, createdAt',
      scores: '++id, assignmentId, textId, rank',
      previousFits: '++id, assignmentId, calculatedAt',
      assignmentMeta: 'assignmentId'
    }).upgrade(async tx => {
      // backfill pairKey en defaults
      await tx.table('judgements').toCollection().modify((j: any) => {
        if (!j.pairKey) {
          const a = Math.min(j.textAId, j.textBId);
          const b = Math.max(j.textAId, j.textBId);
          j.pairKey = `${a}-${b}`;
        }
        if (j.source === undefined) j.source = 'human';
        if (j.isFinal === undefined) j.isFinal = false;
      });

      // assignmentMeta idempotent aanmaken
      const assignments = await tx.table('assignments').toArray();
      const meta = tx.table('assignmentMeta');
      for (const a of assignments) {
        const exists = await meta.get(a.id!);
        if (!exists) {
          await meta.put({ assignmentId: a.id!, judgementMode: 'accumulate', seRepeatThreshold: 0.8 });
        }
      }
    });
  }
}

export const db = new AssessmentDB();
