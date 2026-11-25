/**
 * exportUtils.ts
 * Module universel d'Import / Export multi-formats (Excel multi-onglets, CSV, PDF, PowerPoint)
 * avec imputation automatique et traçabilité systématique de la date et heure.
 */

import { getHtmlLanguage, isRightToLeft, translateBusinessText, type InterfaceLanguage } from './localization';
import { readInitialInterfaceLanguage } from './language-preference';

export interface ExportColumn {
  header: string;
  key: string;
}

export interface ExportMetadata {
  moduleName: string;
  language?: InterfaceLanguage;
  companyName?: string;
  currency?: string;
  customDate?: string;
}

export function resolveExportCurrency(currency?: string): string {
  return currency?.trim() || 'Devise non précisée';
}

export interface ExcelSheetData {
  sheetName: string;
  columns: ExportColumn[];
  data: any[];
}

export async function readImportFile(file: File): Promise<Array<Record<string, unknown>>> {
  const extension = file.name.toLowerCase().split('.').pop();
  if (file.size > 5 * 1024 * 1024) throw new Error('Limite d’import : 5 Mo par fichier.');
  if (extension === 'csv') return parseCsv(await file.text());
  if (extension !== 'xlsx') throw new Error('Formats acceptés : CSV UTF-8 ou Excel .xlsx.');

  const { default: ExcelJS } = await import('exceljs');
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await file.arrayBuffer());
  const sheet = workbook.worksheets[0];
  if (!sheet || sheet.rowCount < 2) throw new Error('Le classeur doit contenir un onglet avec une ligne d’en-têtes et au moins une ligne de données.');
  const firstCell = String(sheet.getCell(1, 1).value ?? '');
  const headerRowNumber = firstCell.startsWith('SAFE_ERP - ') ? 3 : 1;
  const headerValues = sheet.getRow(headerRowNumber).values;
  const headers = (Array.isArray(headerValues) ? headerValues.slice(1) : [])
    .map((value) => String(value ?? '').trim());
  if (!headers.length || headers.some((header) => !header) || new Set(headers).size !== headers.length) {
    throw new Error('Les en-têtes Excel doivent être renseignés et uniques.');
  }
  const rows: Array<Record<string, unknown>> = [];
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber <= headerRowNumber) return;
    const record: Record<string, unknown> = {};
    headers.forEach((header, index) => {
      const value = row.getCell(index + 1).value;
      if (value && typeof value === 'object' && 'formula' in value) {
        throw new Error(`Les formules Excel ne sont pas acceptées (ligne ${rowNumber}, colonne ${header}).`);
      }
      record[header] = value && typeof value === 'object' && 'text' in value
        ? value.text
        : value && typeof value === 'object' && 'result' in value
          ? value.result
          : value;
    });
    if (Object.values(record).some((value) => value !== null && value !== undefined && String(value).trim())) {
      rows.push(record);
    }
  });
  if (rows.length === 0) throw new Error('Le classeur ne contient aucune ligne de données à importer.');
  return rows;
}

function parseCsv(text: string): Array<Record<string, unknown>> {
  const rows: string[][] = [];
  let row: string[] = [];
  let value = '';
  let quoted = false;
  const input = text.replace(/^\uFEFF/, '');
  const separator = input.split(/\r?\n/, 1)[0].includes(';') ? ';' : ',';
  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];
    if (char === '"') {
      if (quoted && input[index + 1] === '"') {
        value += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (char === separator && !quoted) {
      row.push(value);
      value = '';
    } else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && input[index + 1] === '\n') index += 1;
      row.push(value);
      if (row.some((cell) => cell.trim())) rows.push(row);
      row = [];
      value = '';
    } else {
      value += char;
    }
  }
  row.push(value);
  if (row.some((cell) => cell.trim())) rows.push(row);
  if (quoted) throw new Error('Le fichier CSV contient un champ entre guillemets non terminé.');
  if (rows.length < 2) throw new Error('Le fichier CSV doit contenir des en-têtes et au moins une ligne.');

  const headers = rows[0].map((header) => header.trim());
  if (headers.some((header) => !header) || new Set(headers).size !== headers.length) {
    throw new Error('Les en-têtes CSV doivent être renseignés et uniques.');
  }
  return rows.slice(1).map((cells, rowIndex) => {
    if (cells.length !== headers.length) throw new Error(`La ligne ${rowIndex + 2} ne contient pas le même nombre de colonnes que l’en-tête.`);
    return Object.fromEntries(headers.map((header, index) => [header, cells[index]]));
  });
}

/**
 * Récupère la date et heure courante imputée
 */
export const getImputedDate = (customDate?: string, now = new Date()): string => {
  if (customDate) return customDate;
  return now.toLocaleDateString('fr-TN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
};

/**
 * Télécharge un Blob avec le nom de fichier spécifié
 */
const downloadBlob = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
};

/**
 * 1. EXPORT CSV (Conforme Excel avec encodage UTF-8 BOM et séparateur point-virgule)
 */
export const exportToCSV = (
  filename: string,
  columns: ExportColumn[],
  data: any[],
  meta: ExportMetadata
) => {
  let csvContent = '\uFEFF'; // BOM UTF-8 pour Excel
  csvContent += columns.map((c) => `"${c.header}"`).join(';') + '\r\n';

  // Lignes de données
  data.forEach((row) => {
    const line = columns
      .map((c) => {
        const val = row[c.key] !== undefined && row[c.key] !== null ? String(row[c.key]) : '';
        return `"${val.replace(/"/g, '""')}"`;
      })
      .join(';');
    csvContent += line + '\r\n';
  });

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  downloadBlob(blob, `${filename}_${new Date().toISOString().slice(0, 10)}.csv`);
};

/**
 * 2. EXPORT EXCEL SIMPLE (classeur .xlsx avec mise en page complète)
 */
export const exportToExcel = (
  filename: string,
  columns: ExportColumn[],
  data: any[],
  meta: ExportMetadata
) => {
  const sheetName = meta.moduleName.replace(/[^\w\s-]/g, '').slice(0, 30) || 'Feuille 1';
  exportMultiSheetExcel(filename, [{ sheetName, columns, data }], meta);
};

/**
 * 2b. EXPORT EXCEL MULTI-FEUILLES (Chaque état principal sur son propre onglet)
 */
export const exportMultiSheetExcel = async (
  filename: string,
  sheets: ExcelSheetData[],
  meta: ExportMetadata
): Promise<void> => {
  try {
    await buildWorkbook(filename, sheets, meta);
  } catch (error: unknown) {
    console.error('Erreur lors de la génération du classeur Excel:', error);
    throw error instanceof Error
      ? error
      : new Error('Impossible de générer le classeur Excel. Vérifiez le fichier et réessayez.');
  }
};

export async function buildWorkbook(filename: string, sheets: ExcelSheetData[], meta: ExportMetadata): Promise<void> {
  const dateImputation = getImputedDate(meta.customDate);
  const company = meta.companyName || 'Société non précisée';
  const excelModule = await import('exceljs');
  const ExcelJS = (excelModule as { default?: typeof excelModule }).default ?? excelModule;
  const WorkbookCtor = ExcelJS.Workbook ?? excelModule.Workbook;
  if (!WorkbookCtor) {
    throw new Error('Bibliothèque ExcelJS indisponible pour la génération du classeur.');
  }
  const workbook = new WorkbookCtor();
  workbook.creator = 'SAFE_ERP';
  workbook.created = new Date();
  sheets.forEach((sheet) => {
    const cleanSheetName = sheet.sheetName.replace(/[:\\/?*\[\]]/g, '').slice(0, 31) || 'Onglet';
    const worksheet = workbook.addWorksheet(cleanSheetName);
    worksheet.addRow([`SAFE_ERP - ${cleanSheetName}`]);
    worksheet.addRow([`Société : ${company} | Module : ${meta.moduleName} | Date : ${dateImputation}`]);
    worksheet.addRow(sheet.columns.map((column) => column.header));
    worksheet.getRow(3).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    worksheet.getRow(3).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0A3D62' } };
    worksheet.views = [{ state: 'frozen', ySplit: 3 }];
    worksheet.autoFilter = { from: { row: 3, column: 1 }, to: { row: 3, column: sheet.columns.length } };
    sheet.data.forEach((record) => worksheet.addRow(sheet.columns.map((column) => record[column.key] ?? null)));
    sheet.columns.forEach((column, index) => {
      const maxLength = Math.max(
        column.header.length,
        ...sheet.data.slice(0, 100).map((record) => String(record[column.key] ?? '').length),
      );
      worksheet.getColumn(index + 1).width = Math.min(Math.max(maxLength + 2, 12), 40);
    });
  });
  const buffer = await workbook.xlsx.writeBuffer();
  downloadBlob(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
    `${filename}_${new Date().toISOString().slice(0, 10)}.xlsx`);
}

/**
 * 3. Printable generic report template; regulatory layouts are not implied.
 */
export const exportToPDF = (
  title: string,
  columns: ExportColumn[],
  data: any[],
  meta: ExportMetadata
) => {
  const reportDate = getImputedDate(meta.customDate);
  const generatedAt = getImputedDate();
  const company = meta.companyName || 'Safe Tunisie Industries SARL';
  const language = meta.language ?? readInitialInterfaceLanguage();
  const direction = isRightToLeft(language) ? 'rtl' : 'ltr';
  const localize = (value: string) => translateBusinessText(language, value);
  const escapeHtml = (value: unknown) => String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

  const printWindow = window.open('', '_blank');
  if (!printWindow) {
    alert("Veuillez autoriser les fenêtres pop-up pour l'exportation PDF.");
    return;
  }

  const html = `<!DOCTYPE html>
<html lang="${getHtmlLanguage(language)}" dir="${direction}">
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(localize(title))} - SAFE_ERP</title>
  <style>
    body { font-family: 'Segoe UI', Arial, sans-serif; margin: 30px; color: #2d3436; direction: ${direction}; }
    .header { border-bottom: 2px solid #0984e3; padding-bottom: 12px; margin-bottom: 20px; display: flex; justify-content: space-between; align-items: flex-end; }
    .company { font-size: 20px; font-weight: bold; color: #0984e3; }
    .meta { font-size: 12px; color: #636e72; }
    h1 { font-size: 18px; margin: 15px 0; color: #2d3436; }
    table { width: 100%; border-collapse: collapse; margin-top: 15px; font-size: 12px; }
    th { background-color: #0984e3; color: white; padding: 10px 8px; text-align: start; }
    td { padding: 8px; border-bottom: 1px solid #dfe6e9; }
    tr:nth-child(even) { background-color: #f9f9f9; }
    .footer { margin-top: 40px; border-top: 1px solid #b2bec3; padding-top: 10px; font-size: 11px; color: #636e72; display: flex; justify-content: space-between; }
    @media print {
      button { display: none; }
      body { margin: 15mm; }
    }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <div class="company">${escapeHtml(company)}</div>
      <div class="meta">${escapeHtml(localize('Système SAFE_ERP • Système d’Analyse Financière des Entreprises'))}</div>
    </div>
    <div style="text-align: end;">
      <div class="meta">${escapeHtml(localize('Date / période :'))} <strong><bdi dir="ltr">${escapeHtml(reportDate)}</bdi></strong></div>
      <div class="meta">${escapeHtml(localize('Devise :'))} <bdi dir="ltr">${escapeHtml(resolveExportCurrency(meta.currency))}</bdi></div>
    </div>
  </div>

  <h1>${escapeHtml(localize(title))} - ${escapeHtml(localize('Module :'))} ${escapeHtml(localize(meta.moduleName))}</h1>

  <table>
    <thead>
      <tr>
        ${columns.map((c) => `<th>${escapeHtml(localize(c.header))}</th>`).join('')}
      </tr>
    </thead>
    <tbody>
      ${data
        .map(
          (row) => `
        <tr>
          ${columns.map((c) => `<td><bdi dir="auto">${escapeHtml(row[c.key] ?? '-')}</bdi></td>`).join('')}
        </tr>`
        )
        .join('')}
    </tbody>
  </table>

  <div class="footer">
    <span>${escapeHtml(localize('Document de travail généré par SAFE_ERP • Non certifié'))}</span>
    <span>${escapeHtml(localize('Page 1 / 1 • Généré le'))} <bdi dir="ltr">${escapeHtml(generatedAt)}</bdi></span>
  </div>

  <script>
    window.onload = function() {
      setTimeout(function() {
        window.print();
      }, 500);
    };
  </script>
</body>
</html>`;

  printWindow.document.write(html);
  printWindow.document.close();
};

/**
 * 4. EXPORT POWERPOINT (Génère une présentation exécutive .ppt structurée compatible PowerPoint)
 */
export const exportToPowerPoint = async (
  filename: string,
  columns: ExportColumn[],
  data: any[],
  meta: ExportMetadata,
  kpis?: Array<{ label: string; value: string | number; change?: string }>
) => {
  try {
    const { default: PptxGenJS } = await import('pptxgenjs');
    const pptx = new PptxGenJS();
    pptx.layout = 'LAYOUT_16x9';

    const company = meta.companyName || 'Société non précisée';
    const dateImputation = getImputedDate(meta.customDate);
    const cleanTitle = meta.moduleName || filename;

    // Diapositive 1 : Titre et Synthèse
    const slide1 = pptx.addSlide();
    slide1.background = { color: '0B0F19' };

    slide1.addText('SAFE_ERP • SYSTÈME D’ANALYSE FINANCIÈRE DES ENTREPRISES', {
      x: 0.8,
      y: 0.8,
      w: 8.5,
      h: 0.4,
      fontSize: 12,
      bold: true,
      color: '3B82F6',
      fontFace: 'Calibri',
    });

    slide1.addText(`Rapport Exécutif de Direction\n${cleanTitle}`, {
      x: 0.8,
      y: 1.4,
      w: 8.5,
      h: 1.2,
      fontSize: 26,
      bold: true,
      color: 'FFFFFF',
      fontFace: 'Calibri',
    });

    slide1.addText(`Société : ${company}\nDate du rapport : ${dateImputation}\nDevise : ${resolveExportCurrency(meta.currency)} • Document de travail non certifié`, {
      x: 0.8,
      y: 2.8,
      w: 8.5,
      h: 1.0,
      fontSize: 14,
      color: '9CA3AF',
      fontFace: 'Calibri',
    });

    if (kpis && kpis.length > 0) {
      kpis.slice(0, 4).forEach((kpi, idx) => {
        slide1.addShape(pptx.ShapeType.rect, {
          x: 0.8 + idx * 2.15,
          y: 4.2,
          w: 2.0,
          h: 1.2,
          fill: { color: '1F2937' },
          line: { color: '3B82F6', width: 1.5 },
        });
        slide1.addText(`${kpi.label}\n${kpi.value}${kpi.change ? ' (' + kpi.change + ')' : ''}`, {
          x: 0.85 + idx * 2.15,
          y: 4.25,
          w: 1.9,
          h: 1.1,
          fontSize: 11,
          bold: true,
          color: '34D399',
          align: 'center',
        });
      });
    }

    // Diapositive 2 : Données Opérationnelles Détaillées
    const slide2 = pptx.addSlide();
    slide2.background = { color: '0B0F19' };

    slide2.addText(`${cleanTitle} - Détail des Opérations Détaillées`, {
      x: 0.5,
      y: 0.4,
      w: 9.0,
      h: 0.5,
      fontSize: 18,
      bold: true,
      color: '60A5FA',
      fontFace: 'Calibri',
    });

    const headers = columns.map((col) => ({
      text: col.header,
      options: { bold: true, color: 'FFFFFF', fill: { color: '1E3A8A' }, align: 'center', fontSize: 10 },
    }));

    const rows = data.map((row) =>
      columns.map((col) => ({
        text: String(row[col.key] !== undefined && row[col.key] !== null ? row[col.key] : '-'),
        options: { color: 'E5E7EB', fill: { color: '111827' }, fontSize: 9 },
      }))
    );

    slide2.addTable([headers, ...rows], {
      x: 0.5,
      y: 1.0,
      w: 9.0,
      autoPage: true,
      border: { pt: 1, color: '374151' },
    });

    await pptx.writeFile({ fileName: `Presentation_${filename}_${new Date().toISOString().slice(0, 10)}.pptx` });
  } catch (err) {
    console.error('Erreur export PowerPoint:', err);
    alert('Erreur lors de la génération de la présentation PowerPoint.');
  }
};

export const importFromCSV = (file: File): Promise<any[]> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = e.target?.result as string;
        const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
        if (lines.length < 2) return resolve([]);

        // Détection du séparateur (; ou ,)
        const separator = lines[0].includes(';') ? ';' : ',';

        // Nettoyage entêtes
        const headers = lines[0].split(separator).map((h) => h.replace(/^["']|["']$/g, '').trim());

        const result: any[] = [];
        for (let i = 1; i < lines.length; i++) {
          const values = lines[i].split(separator).map((v) => v.replace(/^["']|["']$/g, '').trim());
          const obj: any = {};
          headers.forEach((h, index) => {
            const rawVal = values[index];
            const num = Number(rawVal);
            obj[h] = !isNaN(num) && rawVal !== '' ? num : rawVal;
          });
          result.push(obj);
        }
        resolve(result);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(new Error('Erreur de lecture du fichier CSV'));
    reader.readAsText(file, 'UTF-8');
  });
};

