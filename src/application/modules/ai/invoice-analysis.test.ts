import assert from 'node:assert/strict';
import { createCanvas } from '@napi-rs/canvas';
import ExcelJS from 'exceljs';
import { after, describe, it } from 'node:test';
import { FinanceService } from '../finance/service';
import LocalInvoiceAnalysisService from './invoice-analysis';
import {
  extractInvoiceDocument,
  PDF_MIME_TYPE,
  terminateInvoiceOcrWorker,
  XLSX_MIME_TYPE,
} from './invoice-document';
import { LocalAiError } from './service';

async function createSyntheticWorkbook(): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Facture');
  worksheet.addRow(['Description', 'Montant']);
  worksheet.addRow(['Rouleau papier thermique', 25.5]);
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

function createSyntheticPdf(text: string): Buffer {
  const content = `BT /F1 28 Tf 40 700 Td (${text}) Tj ET`;
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`,
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  for (const [index, object] of objects.entries()) {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  }
  const xrefOffset = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets.slice(1)) pdf += `${String(offset).padStart(10, '0')} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return Buffer.from(pdf);
}

describe('local invoice analysis', () => {
  after(async () => {
    await terminateInvoiceOcrWorker();
  });

  it('extracts local OCR text from a synthetic scanned PDF without storing the file', async () => {
    let recognizedImage = false;
    const result = await extractInvoiceDocument(
      Buffer.from('%PDF-1.7 synthetic invoice'),
      PDF_MIME_TYPE,
      {
        renderPdfPages: async () => [{ text: '', image: Buffer.from('synthetic-page-image') }],
        recognizeImage: async () => {
          recognizedImage = true;
          return 'FACTURE TEST-001 Rouleau papier thermique 25,500 TND';
        },
      },
    );

    assert.equal(recognizedImage, true);
    assert.equal(result.format, 'pdf');
    assert.equal(result.pageCount, 1);
    assert.match(result.text, /Rouleau papier thermique/);
  });

  it('reads bounded XLSX rows locally and rejects unsupported formats', async () => {
    const workbook = await createSyntheticWorkbook();
    const result = await extractInvoiceDocument(workbook, XLSX_MIME_TYPE);
    assert.equal(result.format, 'xlsx');
    assert.equal(result.rowCount, 2);
    assert.match(result.text, /Rouleau papier thermique/);
    await assert.rejects(
      () => extractInvoiceDocument(Buffer.from('%PDF-not-a-pdf'), 'application/octet-stream'),
      (error: unknown) => error instanceof Error && error.name === 'InvoiceDocumentError',
    );
  });

  it('renders a short-text PDF locally before applying OCR', async () => {
    const result = await extractInvoiceDocument(
      createSyntheticPdf('FACTURE 12345'),
      PDF_MIME_TYPE,
    );
    assert.equal(result.format, 'pdf');
    assert.equal(result.pageCount, 1);
    assert.ok((result.text.toUpperCase().match(/FACTURE/g) ?? []).length >= 2);
  });

  it('uses the entity chart, validates account ids and returns traceable suggestions without posting', async () => {
    const originalEnabled = process.env.SAFE_ERP_AI_ENABLED;
    const originalHardwareReady = process.env.SAFE_ERP_AI_HARDWARE_READY;
    const originalModelApproved = process.env.SAFE_ERP_AI_MODEL_APPROVED;
    const originalProvider = process.env.SAFE_ERP_AI_PROVIDER;
    const originalModel = process.env.SAFE_ERP_AI_MODEL;
    const originalUrl = process.env.SAFE_ERP_AI_OLLAMA_URL;
    const originalFetch = globalThis.fetch;
    const originalAccounts = Object.getOwnPropertyDescriptor(FinanceService, 'getChartOfAccounts');
    let queriedEntityId = '';
    process.env.SAFE_ERP_AI_ENABLED = 'true';
    process.env.SAFE_ERP_AI_HARDWARE_READY = 'true';
    process.env.SAFE_ERP_AI_MODEL_APPROVED = 'true';
    process.env.SAFE_ERP_AI_PROVIDER = 'ollama-local';
    process.env.SAFE_ERP_AI_MODEL = 'TEST-local-model';
    process.env.SAFE_ERP_AI_OLLAMA_URL = 'http://127.0.0.1:11434';
    Object.defineProperty(FinanceService, 'getChartOfAccounts', {
      configurable: true,
      value: async (entityId: string) => {
        queriedEntityId = entityId;
        return [
          { code: '606', description: 'Fournitures papier de bureau', type: 'Expense', classNumber: 6, isPostingAllowed: true },
          { code: '6060', description: 'Compte de regroupement', type: 'Expense', classNumber: 6, isPostingAllowed: false },
          { code: '401', description: 'Fournisseurs', type: 'Liability', classNumber: 4, isPostingAllowed: true },
        ];
      },
    });
    globalThis.fetch = async (input, init) => {
      assert.equal(String(input), 'http://127.0.0.1:11434/api/generate');
      const request = JSON.parse(String(init?.body)) as { prompt: string; format: string };
      assert.equal(request.format, 'json');
      assert.match(request.prompt, /Rouleau papier thermique/);
      assert.match(request.prompt, /Fournitures papier de bureau/);
      assert.doesNotMatch(request.prompt, /Fournisseurs/);
      return new Response(JSON.stringify({
        response: JSON.stringify({
          invoice: { supplierName: 'TEST_VENDOR', invoiceNumber: 'TEST-001', invoiceDate: '2026-01-05' },
          suggestions: [{
            description: 'Rouleau papier thermique',
            sourceQuote: 'Rouleau papier thermique',
            amount: 25.5,
            accountCode: '606',
            confidence: 'medium',
            rationale: 'Le libellé de la facture correspond aux fournitures de bureau.',
          }],
        }),
      }), { status: 200 });
    };

    try {
      const workbook = await createSyntheticWorkbook();
      const result = await LocalInvoiceAnalysisService.analyze(
        'TEST_entity',
        workbook,
        XLSX_MIME_TYPE,
      );
      assert.equal(queriedEntityId, 'TEST_entity');
      assert.equal(result.provider, 'ollama-local');
      assert.equal(result.suggestions[0].accountCode, '606');
      assert.deepEqual(result.suggestions[0].explanation.matchedTerms, ['papier']);
      assert.deepEqual(result.suggestions[0].explanation.score, { matchedTermCount: 1, citedTermCount: 3 });
      assert.equal(result.suggestions[0].explanation.ruleChecks.every(({ passed }) => passed), true);
      assert.equal(result.approvalRequired, true);
      assert.equal(result.postingCreated, false);
    } finally {
      if (originalEnabled === undefined) delete process.env.SAFE_ERP_AI_ENABLED;
      else process.env.SAFE_ERP_AI_ENABLED = originalEnabled;
      if (originalHardwareReady === undefined) delete process.env.SAFE_ERP_AI_HARDWARE_READY;
      else process.env.SAFE_ERP_AI_HARDWARE_READY = originalHardwareReady;
      if (originalModelApproved === undefined) delete process.env.SAFE_ERP_AI_MODEL_APPROVED;
      else process.env.SAFE_ERP_AI_MODEL_APPROVED = originalModelApproved;
      if (originalProvider === undefined) delete process.env.SAFE_ERP_AI_PROVIDER;
      else process.env.SAFE_ERP_AI_PROVIDER = originalProvider;
      if (originalModel === undefined) delete process.env.SAFE_ERP_AI_MODEL;
      else process.env.SAFE_ERP_AI_MODEL = originalModel;
      if (originalUrl === undefined) delete process.env.SAFE_ERP_AI_OLLAMA_URL;
      else process.env.SAFE_ERP_AI_OLLAMA_URL = originalUrl;
      globalThis.fetch = originalFetch;
      if (originalAccounts) Object.defineProperty(FinanceService, 'getChartOfAccounts', originalAccounts);
      else Reflect.deleteProperty(FinanceService, 'getChartOfAccounts');
    }
  });

  it('rejects a model-selected account outside the supplied posting accounts', async () => {
    const originalEnabled = process.env.SAFE_ERP_AI_ENABLED;
    const originalHardwareReady = process.env.SAFE_ERP_AI_HARDWARE_READY;
    const originalModelApproved = process.env.SAFE_ERP_AI_MODEL_APPROVED;
    const originalProvider = process.env.SAFE_ERP_AI_PROVIDER;
    const originalModel = process.env.SAFE_ERP_AI_MODEL;
    const originalUrl = process.env.SAFE_ERP_AI_OLLAMA_URL;
    const originalFetch = globalThis.fetch;
    const originalAccounts = Object.getOwnPropertyDescriptor(FinanceService, 'getChartOfAccounts');
    process.env.SAFE_ERP_AI_ENABLED = 'true';
    process.env.SAFE_ERP_AI_HARDWARE_READY = 'true';
    process.env.SAFE_ERP_AI_MODEL_APPROVED = 'true';
    process.env.SAFE_ERP_AI_PROVIDER = 'ollama-local';
    process.env.SAFE_ERP_AI_MODEL = 'TEST-local-model';
    process.env.SAFE_ERP_AI_OLLAMA_URL = 'http://127.0.0.1:11434';
    Object.defineProperty(FinanceService, 'getChartOfAccounts', {
      configurable: true,
      value: async () => [
        { code: '606', description: 'Fournitures de bureau', type: 'Expense', classNumber: 6, isPostingAllowed: true },
      ],
    });
    globalThis.fetch = async () => new Response(JSON.stringify({
      response: JSON.stringify({
        invoice: { supplierName: null, invoiceNumber: null, invoiceDate: null },
        suggestions: [{
          description: 'Rouleau papier thermique',
          sourceQuote: 'Rouleau papier thermique',
          amount: 25.5,
          accountCode: '999',
          confidence: 'high',
          rationale: 'Compte proposé.',
        }],
      }),
    }), { status: 200 });

    try {
      const workbook = await createSyntheticWorkbook();
      await assert.rejects(
        () => LocalInvoiceAnalysisService.analyze('TEST_entity', workbook, XLSX_MIME_TYPE),
        (error: unknown) => error instanceof LocalAiError && error.status === 502,
      );
    } finally {
      if (originalEnabled === undefined) delete process.env.SAFE_ERP_AI_ENABLED;
      else process.env.SAFE_ERP_AI_ENABLED = originalEnabled;
      if (originalHardwareReady === undefined) delete process.env.SAFE_ERP_AI_HARDWARE_READY;
      else process.env.SAFE_ERP_AI_HARDWARE_READY = originalHardwareReady;
      if (originalModelApproved === undefined) delete process.env.SAFE_ERP_AI_MODEL_APPROVED;
      else process.env.SAFE_ERP_AI_MODEL_APPROVED = originalModelApproved;
      if (originalProvider === undefined) delete process.env.SAFE_ERP_AI_PROVIDER;
      else process.env.SAFE_ERP_AI_PROVIDER = originalProvider;
      if (originalModel === undefined) delete process.env.SAFE_ERP_AI_MODEL;
      else process.env.SAFE_ERP_AI_MODEL = originalModel;
      if (originalUrl === undefined) delete process.env.SAFE_ERP_AI_OLLAMA_URL;
      else process.env.SAFE_ERP_AI_OLLAMA_URL = originalUrl;
      globalThis.fetch = originalFetch;
      if (originalAccounts) Object.defineProperty(FinanceService, 'getChartOfAccounts', originalAccounts);
      else Reflect.deleteProperty(FinanceService, 'getChartOfAccounts');
    }
  });

  it('runs the French OCR engine locally against a synthetic image', async () => {
    const canvas = createCanvas(720, 140);
    const context = canvas.getContext('2d');
    context.fillStyle = '#FFFFFF';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = '#000000';
    context.font = 'bold 52px Arial';
    context.fillText('FACTURE TEST 12345', 20, 92);

    const text = await import('./invoice-document').then(({ recognizeInvoiceImage }) => (
      recognizeInvoiceImage(canvas.toBuffer('image/png'))
    ));
    assert.match(text.toUpperCase(), /FACTURE/);
  });
});
