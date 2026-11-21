import { createCanvas } from '@napi-rs/canvas';
import ExcelJS from 'exceljs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { createWorker, OEM } from 'tesseract.js';

export const MAX_INVOICE_FILE_BYTES = 8 * 1024 * 1024;
export const MAX_INVOICE_PDF_PAGES = 5;
export const MAX_INVOICE_SPREADSHEET_ROWS = 250;
export const MAX_INVOICE_TEXT_LENGTH = 24_000;

export const PDF_MIME_TYPE = 'application/pdf';
export const XLSX_MIME_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

export class InvoiceDocumentError extends Error {
  constructor(message: string, readonly status = 422) {
    super(message);
    this.name = 'InvoiceDocumentError';
  }
}

export interface ExtractedInvoiceDocument {
  format: 'pdf' | 'xlsx';
  text: string;
  pageCount?: number;
  rowCount?: number;
}

export interface PdfPageContent {
  text: string;
  image?: Buffer;
}

export interface InvoiceDocumentAdapters {
  renderPdfPages: (buffer: Buffer) => Promise<PdfPageContent[]>;
  recognizeImage: (image: Buffer) => Promise<string>;
}

const nodeRequire = createRequire(__filename);
const MAX_XLSX_EXPANDED_BYTES = 50 * 1024 * 1024;
const MAX_XLSX_ENTRIES = 2_000;
const MAX_XLSX_COLUMNS = 60;
const MIN_TEXT_PDF_PAGE_LENGTH = 24;
const MAX_PAGE_PIXELS = 2_000_000;
const PDFJS_STANDARD_FONT_DATA_PATH = `${path.resolve(
  path.dirname(nodeRequire.resolve('pdfjs-dist/legacy/build/pdf.mjs')),
  '../../standard_fonts',
).replace(/\\/g, '/')}/`;

let workerPromise: ReturnType<typeof createWorker> | null = null;
let ocrQueue: Promise<void> = Promise.resolve();
let queuedOcrRequests = 0;

function isPdf(buffer: Buffer): boolean {
  return buffer.length >= 5 && buffer.subarray(0, 5).toString('ascii') === '%PDF-';
}

function isZip(buffer: Buffer): boolean {
  return buffer.length >= 4
    && buffer[0] === 0x50
    && buffer[1] === 0x4B
    && buffer[2] === 0x03
    && buffer[3] === 0x04;
}

function validateXlsxArchive(buffer: Buffer): void {
  const searchStart = Math.max(0, buffer.length - 65_557);
  let endOffset = -1;
  for (let offset = buffer.length - 22; offset >= searchStart; offset -= 1) {
    if (buffer.readUInt32LE(offset) === 0x06054B50) {
      endOffset = offset;
      break;
    }
  }
  if (endOffset < 0 || endOffset + 22 > buffer.length) {
    throw new InvoiceDocumentError('Le classeur Excel est invalide ou incomplet.');
  }

  const entryCount = buffer.readUInt16LE(endOffset + 10);
  const centralDirectorySize = buffer.readUInt32LE(endOffset + 12);
  const centralDirectoryOffset = buffer.readUInt32LE(endOffset + 16);
  if (
    entryCount === 0xFFFF
    || centralDirectorySize === 0xFFFFFFFF
    || centralDirectoryOffset === 0xFFFFFFFF
    || entryCount > MAX_XLSX_ENTRIES
    || centralDirectoryOffset + centralDirectorySize > endOffset
  ) {
    throw new InvoiceDocumentError('Le classeur Excel dépasse les limites de lecture prises en charge.');
  }

  let offset = centralDirectoryOffset;
  let expandedSize = 0;
  for (let entry = 0; entry < entryCount; entry += 1) {
    if (offset + 46 > buffer.length || buffer.readUInt32LE(offset) !== 0x02014B50) {
      throw new InvoiceDocumentError('La structure du classeur Excel est invalide.');
    }
    const flags = buffer.readUInt16LE(offset + 8);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const uncompressedSize = buffer.readUInt32LE(offset + 24);
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    if ((flags & 0x0001) !== 0 || uncompressedSize === 0xFFFFFFFF || compressedSize === 0xFFFFFFFF) {
      throw new InvoiceDocumentError('Les classeurs Excel chiffrés ou ZIP64 ne sont pas pris en charge.');
    }
    if (
      uncompressedSize > 0
      && (compressedSize === 0 || uncompressedSize / compressedSize > 2_000)
    ) {
      throw new InvoiceDocumentError('Le taux de compression du classeur Excel dépasse la limite de sécurité.');
    }
    expandedSize += uncompressedSize;
    if (expandedSize > MAX_XLSX_EXPANDED_BYTES) {
      throw new InvoiceDocumentError('Le classeur Excel décompressé dépasse la limite de sécurité.');
    }
    offset += 46 + nameLength + extraLength + commentLength;
  }
  if (offset > centralDirectoryOffset + centralDirectorySize) {
    throw new InvoiceDocumentError('La structure du classeur Excel est invalide.');
  }
}

function getLocalOcrWorker(): ReturnType<typeof createWorker> {
  if (!workerPromise) {
    const langPath = path.join(path.dirname(nodeRequire.resolve('@tesseract.js-data/fra')), '4.0.0');
    workerPromise = createWorker('fra', OEM.LSTM_ONLY, { langPath, gzip: true }).catch((error: unknown) => {
      workerPromise = null;
      throw new InvoiceDocumentError(
        error instanceof Error ? `Le moteur OCR local est indisponible : ${error.message}` : 'Le moteur OCR local est indisponible.',
        503,
      );
    });
  }
  return workerPromise;
}

export async function recognizeInvoiceImage(image: Buffer): Promise<string> {
  if (queuedOcrRequests >= 3) {
    throw new InvoiceDocumentError('Le moteur OCR local est occupé. Réessayez lorsque les analyses en cours seront terminées.', 429);
  }
  queuedOcrRequests += 1;
  const task = ocrQueue.then(async () => {
    const worker = await getLocalOcrWorker();
    const result = await worker.recognize(image);
    return result.data.text.trim();
  });
  ocrQueue = task.then(() => undefined, () => undefined);
  try {
    return await task;
  } finally {
    queuedOcrRequests -= 1;
  }
}

export async function terminateInvoiceOcrWorker(): Promise<void> {
  await ocrQueue;
  if (workerPromise) {
    const worker = await workerPromise;
    await worker.terminate();
    workerPromise = null;
  }
}

async function renderPdfPages(buffer: Buffer): Promise<PdfPageContent[]> {
  const loadingTask = getDocument({
    data: new Uint8Array(buffer),
    standardFontDataUrl: PDFJS_STANDARD_FONT_DATA_PATH,
    useSystemFonts: false,
  });
  try {
    const document = await loadingTask.promise;
    if (document.numPages < 1 || document.numPages > MAX_INVOICE_PDF_PAGES) {
      throw new InvoiceDocumentError(`Le PDF doit contenir entre 1 et ${MAX_INVOICE_PDF_PAGES} pages.`);
    }
    const pages: PdfPageContent[] = [];
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const textContent = await page.getTextContent();
      const text = textContent.items
        .map((item) => ('str' in item && typeof item.str === 'string' ? item.str : ''))
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();
      if (text.length >= MIN_TEXT_PDF_PAGE_LENGTH) {
        pages.push({ text });
        continue;
      }

      const initialViewport = page.getViewport({ scale: 1 });
      const scale = Math.min(1.5, Math.sqrt(MAX_PAGE_PIXELS / (initialViewport.width * initialViewport.height)));
      const viewport = page.getViewport({ scale });
      const canvas = createCanvas(Math.max(1, Math.ceil(viewport.width)), Math.max(1, Math.ceil(viewport.height)));
      const context = canvas.getContext('2d');
      await page.render({
        canvas: canvas as unknown as HTMLCanvasElement,
        canvasContext: context as unknown as CanvasRenderingContext2D,
        viewport,
      }).promise;
      pages.push({ text, image: canvas.toBuffer('image/png') });
    }
    return pages;
  } catch (error) {
    if (error instanceof InvoiceDocumentError) throw error;
    throw new InvoiceDocumentError('Le PDF ne peut pas être lu localement.');
  } finally {
    await loadingTask.destroy();
  }
}

async function readXlsx(buffer: Buffer): Promise<{ text: string; rowCount: number }> {
  validateXlsxArchive(buffer);
  const workbook = new ExcelJS.Workbook();
  try {
    const data = Uint8Array.from(buffer);
    await workbook.xlsx.load(data.buffer as ArrayBuffer);
  } catch {
    throw new InvoiceDocumentError('Le classeur Excel ne peut pas être lu.');
  }
  const worksheet = workbook.worksheets[0];
  if (!worksheet) throw new InvoiceDocumentError('Le classeur Excel ne contient aucune feuille lisible.');
  if (worksheet.rowCount > MAX_INVOICE_SPREADSHEET_ROWS) {
    throw new InvoiceDocumentError(`La première feuille Excel dépasse ${MAX_INVOICE_SPREADSHEET_ROWS} lignes.`);
  }
  const rows: string[] = [];
  let textLength = 0;
  worksheet.eachRow({ includeEmpty: false }, (row) => {
    if (row.cellCount > MAX_XLSX_COLUMNS) {
      throw new InvoiceDocumentError(`Une ligne Excel dépasse ${MAX_XLSX_COLUMNS} colonnes.`);
    }
    const cells: string[] = [];
    row.eachCell({ includeEmpty: false }, (cell) => {
      const value = cell.text.replace(/[\u0000-\u001F\u007F]/g, ' ').trim();
      if (value) cells.push(value);
    });
    if (cells.length > 0) {
      const line = `Ligne ${row.number}: ${cells.join(' | ')}`;
      textLength += line.length;
      if (textLength > MAX_INVOICE_TEXT_LENGTH) {
        throw new InvoiceDocumentError('Le contenu Excel dépasse la limite de texte analysable.');
      }
      rows.push(line);
    }
  });
  if (rows.length === 0) throw new InvoiceDocumentError('La première feuille Excel ne contient aucune donnée.');
  return { text: rows.join('\n'), rowCount: rows.length };
}

const defaultAdapters: InvoiceDocumentAdapters = {
  renderPdfPages,
  recognizeImage: recognizeInvoiceImage,
};

export async function extractInvoiceDocument(
  buffer: Buffer,
  contentType: string | undefined,
  adapters: InvoiceDocumentAdapters = defaultAdapters,
): Promise<ExtractedInvoiceDocument> {
  const normalizedType = contentType?.split(';', 1)[0].trim().toLowerCase();
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    if (normalizedType !== PDF_MIME_TYPE && normalizedType !== XLSX_MIME_TYPE) {
      throw new InvoiceDocumentError('Format invalide : fournissez un PDF ou un classeur Excel .xlsx.', 415);
    }
    throw new InvoiceDocumentError('Le fichier de facture est vide ou invalide.', 400);
  }
  if (buffer.length > MAX_INVOICE_FILE_BYTES) {
    throw new InvoiceDocumentError(`Le fichier dépasse la limite de ${MAX_INVOICE_FILE_BYTES / (1024 * 1024)} Mo.`, 413);
  }

  if (normalizedType === PDF_MIME_TYPE && isPdf(buffer)) {
    const pages = await adapters.renderPdfPages(buffer);
    if (pages.length < 1 || pages.length > MAX_INVOICE_PDF_PAGES) {
      throw new InvoiceDocumentError(`Le PDF doit contenir entre 1 et ${MAX_INVOICE_PDF_PAGES} pages.`);
    }
    const pageTexts: string[] = [];
    let textLength = 0;
    for (const [index, page] of pages.entries()) {
      const pageText = page.text.trim();
      const ocrText = page.image ? await adapters.recognizeImage(page.image) : '';
      const recognizedText = [pageText, ocrText.trim()].filter(Boolean).join('\n');
      if (recognizedText.trim()) {
        const pageText = `Page ${index + 1}: ${recognizedText.trim()}`;
        textLength += pageText.length;
        if (textLength > MAX_INVOICE_TEXT_LENGTH) {
          throw new InvoiceDocumentError('Le texte extrait du PDF dépasse la limite analysable.');
        }
        pageTexts.push(pageText);
      }
    }
    const text = pageTexts.join('\n');
    if (!text) throw new InvoiceDocumentError('Aucun texte lisible n’a été extrait du PDF.');
    return { format: 'pdf', text, pageCount: pages.length };
  }
  if (normalizedType === XLSX_MIME_TYPE && isZip(buffer)) {
    const spreadsheet = await readXlsx(buffer);
    return { format: 'xlsx', ...spreadsheet };
  }
  throw new InvoiceDocumentError('Format invalide : fournissez un PDF ou un classeur Excel .xlsx.', 415);
}
