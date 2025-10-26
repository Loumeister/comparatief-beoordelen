import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Score, Text } from './db';

export interface ExportData {
  anonymizedName: string;
  rank: number;
  label: string;
  grade: number;
  theta: number;
  standardError: number;
  reliability: string;
  judgementCount: number;
}

/**
 * Export results to CSV
 */
export function exportToCSV(data: ExportData[], assignmentTitle: string) {
  const headers = ['Tekst', 'Rang', 'Label', 'Cijfer', 'Theta', 'SE', 'Betrouwbaarheid', 'Aantal beoordelingen'];
  const rows = data.map(d => [
    d.anonymizedName,
    d.rank,
    d.label,
    d.grade.toFixed(1),
    d.theta.toFixed(3),
    d.standardError.toFixed(3),
    d.reliability,
    d.judgementCount
  ]);

  const csv = [headers, ...rows]
    .map(row => row.join(','))
    .join('\n');

  downloadFile(csv, `${assignmentTitle}_resultaten.csv`, 'text/csv');
}

/**
 * Export results to Excel
 */
export function exportToXLSX(data: ExportData[], assignmentTitle: string, numComparisons?: number) {
  const worksheet = XLSX.utils.json_to_sheet(
    data.map(d => ({
      'Tekst': d.anonymizedName,
      'Rang': d.rank,
      'Label': d.label,
      'Cijfer': d.grade.toFixed(1),
      'Theta': d.theta.toFixed(3),
      'SE': d.standardError.toFixed(3),
      'Betrouwbaarheid': d.reliability,
      'Aantal beoordelingen': d.judgementCount
    }))
  );

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Resultaten');

  XLSX.writeFile(workbook, `${assignmentTitle}_resultaten.xlsx`);
}

/**
 * Export results to PDF
 */
export function exportToPDF(data: ExportData[], assignmentTitle: string) {
  const doc = new jsPDF();

  // Title
  doc.setFontSize(18);
  doc.text(assignmentTitle, 14, 20);
  
  doc.setFontSize(12);
  doc.text('Vergelijkende beoordeling - Resultaten', 14, 28);

  // Table
  autoTable(doc, {
    startY: 35,
    head: [['Tekst', 'Rang', 'Label', 'Cijfer', 'Betrouwbaarheid']],
    body: data.map(d => [
      d.anonymizedName,
      d.rank.toString(),
      d.label,
      d.grade.toFixed(1),
      d.reliability
    ]),
    theme: 'striped',
    headStyles: { fillColor: [37, 99, 235] },
  });

  doc.save(`${assignmentTitle}_resultaten.pdf`);
}

/**
 * Export results to JSON
 */
export function exportToJSON(data: ExportData[], assignmentTitle: string) {
  const json = JSON.stringify(data, null, 2);
  downloadFile(json, `${assignmentTitle}_resultaten.json`, 'application/json');
}

function downloadFile(content: string, filename: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
