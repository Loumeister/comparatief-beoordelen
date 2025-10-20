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

export class AssessmentDB extends Dexie {
  assignments!: Table<Assignment, number>;
  texts!: Table<Text, number>;
  judgements!: Table<Judgement, number>;
  scores!: Table<Score, number>;

  constructor() {
    super('AssessmentDB');
    
    this.version(1).stores({
      assignments: '++id, title, createdAt',
      texts: '++id, assignmentId, anonymizedName',
      judgements: '++id, assignmentId, textAId, textBId',
      scores: '++id, assignmentId, textId, rank'
    });
  }
}

export const db = new AssessmentDB();
