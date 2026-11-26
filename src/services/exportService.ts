import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export interface ExportColumn {
  header: string;
  key: string;
  align?: 'left' | 'right';
}

export function exportToExcel(
  filename: string,
  sheetName: string,
  columns: ExportColumn[],
  rows: Array<Record<string, string | number>>
): void {
  const data = rows.map((row) => {
    const out: Record<string, string | number> = {};
    columns.forEach((col) => {
      out[col.header] = row[col.key] ?? '';
    });
    return out;
  });

  const worksheet = XLSX.utils.json_to_sheet(data);
  // Auto-size columns for clean readability in Excel
  worksheet['!cols'] = columns.map((col) => {
    const maxLen = Math.max(
      col.header.length,
      ...rows.map((r) => String(r[col.key] ?? '').length)
    );
    return { wch: Math.min(Math.max(maxLen + 4, 12), 45) };
  });
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName.slice(0, 31));
  XLSX.writeFile(workbook, `${filename}.xlsx`);
}

function sanitizePdfText(val: unknown): string {
  return String(val ?? '—').replace(/₹/g, 'Rs. ');
}

export function exportToPDF(
  filename: string,
  reportTitle: string,
  subtitle: string,
  columns: ExportColumn[],
  rows: Array<Record<string, string | number>>
): void {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });

  doc.setFontSize(15);
  doc.setTextColor(234, 88, 12);
  doc.text('Piramal Petroleum Pvt. Ltd.', 40, 38);

  doc.setFontSize(11.5);
  doc.setTextColor(28, 25, 23);
  doc.text(sanitizePdfText(reportTitle), 40, 56);

  doc.setFontSize(9);
  doc.setTextColor(120, 113, 108);
  doc.text(sanitizePdfText(subtitle), 40, 72);

  const columnStyles: Record<number, { halign: 'left' | 'right' }> = {};
  columns.forEach((col, idx) => {
    if (col.align === 'right') {
      columnStyles[idx] = { halign: 'right' };
    }
  });

  autoTable(doc, {
    startY: 88,
    head: [columns.map((c) => sanitizePdfText(c.header))],
    body: rows.map((r) => columns.map((c) => sanitizePdfText(r[c.key]))),
    columnStyles,
    styles: {
      fontSize: 8.5,
      cellPadding: 6,
      textColor: [28, 25, 23],
    },
    headStyles: {
      fillColor: [28, 25, 23],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
    },
    alternateRowStyles: {
      fillColor: [251, 247, 242],
    },
  });

  doc.save(`${filename}.pdf`);
}

export function printReport(): void {
  window.print();
}
