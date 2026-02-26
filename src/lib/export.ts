import ExcelJS from 'exceljs';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Score, Text } from './db';

export interface ExportData {
  textId?: number;          // intern, niet geëxporteerd
  anonymizedName: string;
  rank: number;
  label: string;
  grade: number;
  anchoredGrade?: number;  // geijkt cijfer (PLAN-6)
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
  const hasAnchored = data.some(d => d.anchoredGrade != null);
  const headers = [
    'Tekst', 'Rang', 'Label', 'Cijfer',
    ...(hasAnchored ? ['Geijkt cijfer'] : []),
    'Theta', 'SE', 'Betrouwbaarheid', 'Aantal beoordelingen', 'Opmerkingen'
  ];
  const rows = data.map(d => [
    d.anonymizedName,
    d.rank,
    d.label,
    d.grade.toFixed(1),
    ...(hasAnchored ? [d.anchoredGrade != null ? d.anchoredGrade.toFixed(1) : ''] : []),
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

  const hasAnchored = data.some(d => d.anchoredGrade != null);
  worksheet.columns = [
    { header: 'Tekst', key: 'tekst', width: 20 },
    { header: 'Rang', key: 'rang', width: 10 },
    { header: 'Label', key: 'label', width: 15 },
    { header: 'Cijfer', key: 'cijfer', width: 10 },
    ...(hasAnchored ? [{ header: 'Geijkt cijfer', key: 'geijktCijfer', width: 12 }] : []),
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
      ...(hasAnchored ? { geijktCijfer: d.anchoredGrade != null ? d.anchoredGrade.toFixed(1) : '' } : {}),
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
  const hasAnchored = data.some(d => d.anchoredGrade != null);
  const pdfHeaders = ['Tekst', 'Rang', 'Label', 'Cijfer'];
  if (hasAnchored) pdfHeaders.push('Geijkt cijfer');
  pdfHeaders.push('Betrouwbaarheid', 'Opmerkingen');

  autoTable(doc, {
    startY: 35,
    head: [pdfHeaders],
    body: data.map(d => {
      const row = [
        d.anonymizedName,
        d.rank.toString(),
        d.label,
        d.grade.toFixed(1),
      ];
      if (hasAnchored) row.push(d.anchoredGrade != null ? d.anchoredGrade.toFixed(1) : '–');
      row.push(d.reliability, d.comments || '');
      return row;
    }),
    theme: 'striped',
    headStyles: { fillColor: [37, 99, 235] },
    styles: { fontSize: 8 },
    columnStyles: { [pdfHeaders.length - 1]: { cellWidth: 50 } }
  });

  doc.save(`${assignmentTitle}_resultaten.pdf`);
}

/**
 * Export results to JSON
 */
/**
 * Per-student feedback data for the feedback PDF
 */
export interface StudentFeedback {
  anonymizedName: string;
  grade: number;
  anchoredGrade?: number;
  label: string;
  rank: number;
  comments: { text: string; raterName?: string }[];
}

/**
 * Export per-student feedback as a PDF — one section per student.
 * Designed to be handed to students: shows grade, label, and all
 * collected comments as bullet points. No technical details.
 */
export function exportFeedbackPDF(students: StudentFeedback[], assignmentTitle: string, hasMultipleRaters: boolean) {
  // Only include students that have at least one comment
  const withFeedback = students.filter(s => s.comments.length > 0);

  if (withFeedback.length === 0) {
    return false; // signal: nothing to export
  }

  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 14;
  const usable = pageWidth - 2 * margin;

  for (let i = 0; i < withFeedback.length; i++) {
    const s = withFeedback[i];
    if (i > 0) doc.addPage();

    let y = 20;

    // Assignment title
    doc.setFontSize(11);
    doc.setTextColor(120, 120, 120);
    doc.text(assignmentTitle, margin, y);
    y += 10;

    // Student name
    doc.setFontSize(20);
    doc.setTextColor(0, 0, 0);
    doc.text(`Feedback: ${s.anonymizedName}`, margin, y);
    y += 10;

    // Grade + label line
    const displayGrade = s.anchoredGrade != null ? s.anchoredGrade : s.grade;
    doc.setFontSize(13);
    doc.setTextColor(60, 60, 60);
    doc.text(`Cijfer: ${displayGrade.toFixed(1)}     ${s.label}     (rang ${s.rank} van ${students.length})`, margin, y);
    y += 4;

    // Divider
    doc.setDrawColor(200, 200, 200);
    doc.line(margin, y, margin + usable, y);
    y += 8;

    // Feedback section heading
    doc.setFontSize(12);
    doc.setTextColor(0, 0, 0);
    doc.text('Feedback van beoordelaars:', margin, y);
    y += 8;

    // Deduplicate comments (same text from same rater = duplicate)
    const seen = new Set<string>();
    const unique: { text: string; raterName?: string }[] = [];
    for (const c of s.comments) {
      const key = `${c.raterName ?? ''}::${c.text}`;
      if (!seen.has(key)) {
        seen.add(key);
        unique.push(c);
      }
    }

    // Render comments as bullet points
    doc.setFontSize(10);
    for (const c of unique) {
      // Wrap long comments
      const prefix = hasMultipleRaters && c.raterName ? `${c.raterName}: ` : '';
      const fullText = `${prefix}${c.text}`;
      const lines = doc.splitTextToSize(fullText, usable - 8);

      // Check page overflow
      if (y + lines.length * 5 + 4 > doc.internal.pageSize.getHeight() - 15) {
        doc.addPage();
        y = 20;
      }

      // Bullet
      doc.setTextColor(100, 100, 100);
      doc.text('•', margin, y);
      doc.setTextColor(40, 40, 40);
      doc.text(lines, margin + 6, y);
      y += lines.length * 5 + 3;
    }
  }

  doc.save(`${assignmentTitle}_feedback.pdf`);
  return true;
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
