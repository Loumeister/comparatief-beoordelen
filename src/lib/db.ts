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
      judgements: '++id, assignmentId, textAId, textBId, raterId, supersedesJudgementId',
      scores: '++id, assignmentId, textId, rank',
      previousFits: '++id, assignmentId, calculatedAt',
      assignmentMeta: 'assignmentId'
    }).upgrade(async tx => {
      // Migreer bestaande judgements: zet defaults
      await tx.table('judgements').toCollection().modify(j => {
        if (j.source === undefined) j.source = 'human';
        if (j.isFinal === undefined) j.isFinal = false;
      });
      
      // Maak assignmentMeta entries voor bestaande assignments
      const assignments = await tx.table('assignments').toArray();
      for (const a of assignments) {
        await tx.table('assignmentMeta').put({
          assignmentId: a.id!,
          judgementMode: 'accumulate',
          seRepeatThreshold: 0.8
        });
      }
    });
  }
}

export const db = new AssessmentDB();
