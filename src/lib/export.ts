import ExcelJS from 'exceljs';
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
  comments?: string;
  infit?: number;
  infitLabel?: string;
}

/**
 * Export results to CSV
 */
export function exportToCSV(data: ExportData[], assignmentTitle: string) {
  const headers = ['Tekst', 'Rang', 'Label', 'Cijfer', 'Theta', 'SE', 'Betrouwbaarheid', 'Aantal beoordelingen', 'Opmerkingen'];
  const rows = data.map(d => [
    d.anonymizedName,
    d.rank,
    d.label,
    d.grade.toFixed(1),
    d.theta.toFixed(3),
    d.standardError.toFixed(3),
    d.reliability,
    d.judgementCount,
    d.comments ? `"${d.comments.replace(/"/g, '""')}"` : ''
  ]);

  const csv = [headers, ...rows]
    .map(row => row.join(','))
    .join('\n');

  downloadFile(csv, `${assignmentTitle}_resultaten.csv`, 'text/csv');
}

/**
 * Export results to Excel
 */
export async function exportToXLSX(data: ExportData[], assignmentTitle: string, numComparisons?: number) {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Resultaten');

  worksheet.columns = [
    { header: 'Tekst', key: 'tekst', width: 20 },
    { header: 'Rang', key: 'rang', width: 10 },
    { header: 'Label', key: 'label', width: 15 },
    { header: 'Cijfer', key: 'cijfer', width: 10 },
    { header: 'Theta', key: 'theta', width: 10 },
    { header: 'SE', key: 'se', width: 10 },
    { header: 'Betrouwbaarheid', key: 'betrouwbaarheid', width: 20 },
    { header: 'Aantal beoordelingen', key: 'aantalBeoordelingen', width: 20 },
    { header: 'Opmerkingen', key: 'opmerkingen', width: 30 }
  ];

  data.forEach(d => {
    worksheet.addRow({
      tekst: d.anonymizedName,
      rang: d.rank,
      label: d.label,
      cijfer: d.grade.toFixed(1),
      theta: d.theta.toFixed(3),
      se: d.standardError.toFixed(3),
      betrouwbaarheid: d.reliability,
      aantalBeoordelingen: d.judgementCount,
      opmerkingen: d.comments || ''
    });
  });

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${assignmentTitle}_resultaten.xlsx`;
  link.click();
  URL.revokeObjectURL(url);
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
    head: [['Tekst', 'Rang', 'Label', 'Cijfer', 'Betrouwbaarheid', 'Opmerkingen']],
    body: data.map(d => [
      d.anonymizedName,
      d.rank.toString(),
      d.label,
      d.grade.toFixed(1),
      d.reliability,
      d.comments || ''
    ]),
    theme: 'striped',
    headStyles: { fillColor: [37, 99, 235] },
    styles: { fontSize: 8 },
    columnStyles: { 5: { cellWidth: 50 } }
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
