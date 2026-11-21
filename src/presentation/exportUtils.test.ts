import assert from 'node:assert/strict';
import { inflateRawSync } from 'node:zlib';
import ExcelJS from 'exceljs';
import PptxGenJS from 'pptxgenjs';
import { describe, it } from 'node:test';
import { buildWorkbook, exportToCSV, exportToPDF, exportToPowerPoint, getImputedDate, readImportFile, resolveExportCurrency } from './exportUtils';

async function withDownloadCapture(
  action: (downloads: Array<{ blob: Blob; filename: string }>) => Promise<void> | void,
) {
  const downloads: Array<{ blob: Blob; filename: string }> = [];
  let clickedAnchor: { href: string; download: string; click: () => void } | undefined;
  const createObjectURLDescriptor = Object.getOwnPropertyDescriptor(URL, 'createObjectURL');
  const revokeObjectURLDescriptor = Object.getOwnPropertyDescriptor(URL, 'revokeObjectURL');
  const documentDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'document');
  const windowDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'window');

  Object.defineProperty(URL, 'createObjectURL', {
    configurable: true,
    value: (blob: Blob) => {
      downloads.push({ blob, filename: clickedAnchor?.download ?? '' });
      return 'blob:test-download';
    },
  });
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: () => undefined });
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: {
      createElement: () => {
        clickedAnchor = {
          href: '',
          download: '',
          click: () => {
            const latest = downloads[downloads.length - 1];
            if (latest) latest.filename = clickedAnchor?.download ?? '';
          },
        };
        return clickedAnchor;
      },
      body: { appendChild: () => undefined, removeChild: () => undefined },
    } as unknown as Document,
  });
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: { setTimeout: (callback: () => void) => { callback(); return 0; } } as unknown as Window,
  });

  try {
    await action(downloads);
  } finally {
    if (createObjectURLDescriptor) Object.defineProperty(URL, 'createObjectURL', createObjectURLDescriptor);
    else Reflect.deleteProperty(URL, 'createObjectURL');
    if (revokeObjectURLDescriptor) Object.defineProperty(URL, 'revokeObjectURL', revokeObjectURLDescriptor);
    else Reflect.deleteProperty(URL, 'revokeObjectURL');
    if (documentDescriptor) Object.defineProperty(globalThis, 'document', documentDescriptor);
    else Reflect.deleteProperty(globalThis, 'document');
    if (windowDescriptor) Object.defineProperty(globalThis, 'window', windowDescriptor);
    else Reflect.deleteProperty(globalThis, 'window');
  }
}

function readZipEntry(archive: Buffer, entryName: string): Buffer {
  let endOfCentralDirectory = -1;
  for (let offset = archive.length - 22; offset >= Math.max(0, archive.length - 65_557); offset -= 1) {
    if (archive.readUInt32LE(offset) === 0x06054B50) {
      endOfCentralDirectory = offset;
      break;
    }
  }
  assert.notEqual(endOfCentralDirectory, -1, 'PPTX must contain a ZIP directory');

  const entryCount = archive.readUInt16LE(endOfCentralDirectory + 10);
  let centralOffset = archive.readUInt32LE(endOfCentralDirectory + 16);
  for (let index = 0; index < entryCount; index += 1) {
    assert.equal(archive.readUInt32LE(centralOffset), 0x02014B50, 'PPTX ZIP directory entry is valid');
    const compressionMethod = archive.readUInt16LE(centralOffset + 10);
    const compressedSize = archive.readUInt32LE(centralOffset + 20);
    const fileNameLength = archive.readUInt16LE(centralOffset + 28);
    const extraLength = archive.readUInt16LE(centralOffset + 30);
    const commentLength = archive.readUInt16LE(centralOffset + 32);
    const localHeaderOffset = archive.readUInt32LE(centralOffset + 42);
    const nameStart = centralOffset + 46;
    const currentName = archive.toString('utf8', nameStart, nameStart + fileNameLength);

    if (currentName === entryName) {
      assert.equal(archive.readUInt32LE(localHeaderOffset), 0x04034B50, 'PPTX ZIP local file entry is valid');
      const localNameLength = archive.readUInt16LE(localHeaderOffset + 26);
      const localExtraLength = archive.readUInt16LE(localHeaderOffset + 28);
      const dataStart = localHeaderOffset + 30 + localNameLength + localExtraLength;
      const compressed = archive.subarray(dataStart, dataStart + compressedSize);
      if (compressionMethod === 0) return compressed;
      assert.equal(compressionMethod, 8, 'PPTX uses a supported ZIP compression method');
      return inflateRawSync(compressed);
    }

    centralOffset = nameStart + fileNameLength + extraLength + commentLength;
  }
  throw new Error(`PPTX archive is missing ${entryName}`);
}

async function withPrintWindowCapture(
  action: (capture: { html: string; closed: boolean; opened: boolean }) => void,
) {
  const capture = { html: '', closed: false, opened: false };
  const windowDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const alertDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'alert');
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      open: (url: string, target: string) => {
        assert.equal(url, '');
        assert.equal(target, '_blank');
        capture.opened = true;
        return {
          document: {
            write: (html: string) => { capture.html = html; },
            close: () => { capture.closed = true; },
          },
        };
      },
    } as unknown as Window,
  });
  Object.defineProperty(globalThis, 'alert', { configurable: true, value: () => undefined });

  try {
    action(capture);
  } finally {
    if (windowDescriptor) Object.defineProperty(globalThis, 'window', windowDescriptor);
    else Reflect.deleteProperty(globalThis, 'window');
    if (alertDescriptor) Object.defineProperty(globalThis, 'alert', alertDescriptor);
    else Reflect.deleteProperty(globalThis, 'alert');
  }
}

describe('resolveExportCurrency', () => {
  it('preserves a configured currency code', () => {
    assert.equal(resolveExportCurrency('EUR'), 'EUR');
  });

  describe('imputed export date', () => {
    it('uses the supplied current date instead of a fixed historical timestamp', () => {
      const now = new Date('2026-11-13T12:00:00Z');
      const expected = now.toLocaleDateString('fr-TN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });

      assert.equal(getImputedDate(undefined, now), expected);
      assert.equal(getImputedDate('Date comptable saisie'), 'Date comptable saisie');
      assert.notEqual(getImputedDate(undefined, now), '31/10/2026 18:35');
    });
  });

  describe('readImportFile', () => {
    it('parses quoted CSV fields and escaped quotes', async () => {
      const file = new File([
        '\uFEFFcustomerCode;description;quantity\r\nC-1;"Profilé; aluminium ""A""";2\r\n',
      ], 'import.csv', { type: 'text/csv' });
      assert.deepEqual(await readImportFile(file), [{
        customerCode: 'C-1',
        description: 'Profilé; aluminium "A"',
        quantity: '2',
      }]);
    });

    it('reads the first worksheet of a valid XLSX workbook', async () => {
      const workbook = new ExcelJS.Workbook();
      const sheet = workbook.addWorksheet('Import');
      sheet.addRow(['customerCode', 'description', 'quantity']);
      sheet.addRow(['C-1', 'Article de démonstration', 2]);
      const file = new File([new Uint8Array(await workbook.xlsx.writeBuffer())], 'import.xlsx');
      assert.deepEqual(await readImportFile(file), [{
        customerCode: 'C-1',
        description: 'Article de démonstration',
        quantity: 2,
      }]);
    });

    it('rejects XLSX worksheets without data rows or with duplicate headers', async () => {
      const emptyWorkbook = new ExcelJS.Workbook();
      emptyWorkbook.addWorksheet('Import').addRow(['customerCode', 'quantity']);
      const emptyFile = new File([new Uint8Array(await emptyWorkbook.xlsx.writeBuffer())], 'empty.xlsx');
      await assert.rejects(readImportFile(emptyFile), /au moins une ligne de données/);

      const duplicateWorkbook = new ExcelJS.Workbook();
      const duplicateSheet = duplicateWorkbook.addWorksheet('Import');
      duplicateSheet.addRow(['customerCode', 'customerCode']);
      duplicateSheet.addRow(['C-1', 'C-2']);
      const duplicateFile = new File([new Uint8Array(await duplicateWorkbook.xlsx.writeBuffer())], 'duplicate.xlsx');
      await assert.rejects(readImportFile(duplicateFile), /en-têtes Excel doivent être renseignés et uniques/);
    });

    it('rejects malformed CSV rows and unsupported formats', async () => {
      const malformed = new File(['code,name\r\n1'], 'bad.csv');
      const unsupported = new File(['not a spreadsheet'], 'input.pdf');
      await assert.rejects(readImportFile(malformed), /même nombre de colonnes/);
      await assert.rejects(readImportFile(unsupported), /Formats acceptés/);
    });
  });

  it('does not label an export as TND when currency metadata is missing', () => {
    assert.equal(resolveExportCurrency(undefined), 'Devise non précisée');
    assert.equal(resolveExportCurrency('  '), 'Devise non précisée');
  });

  it('generates a downloadable UTF-8 CSV with escaped values and the expected filename', async () => {
    await withDownloadCapture(async (downloads) => {
      exportToCSV('Export_test', [
        { header: 'Code', key: 'code' },
        { header: 'Description', key: 'description' },
      ], [{ code: 'A-1', description: 'Profilé; "A"' }], { moduleName: 'Test' });

      assert.equal(downloads.length, 1);
      assert.match(downloads[0].filename, /^Export_test_\d{4}-\d{2}-\d{2}\.csv$/);
      assert.equal(downloads[0].blob.type, 'text/csv;charset=utf-8;');
      const csvBytes = new Uint8Array(await downloads[0].blob.arrayBuffer());
      assert.deepEqual(Array.from(csvBytes.slice(0, 3)), [0xEF, 0xBB, 0xBF]);
      assert.equal(Buffer.from(csvBytes.slice(3)).toString('utf8'), '"Code";"Description"\r\n"A-1";"Profilé; ""A"""\r\n');
    });
  });

  it('generates a downloadable XLSX workbook with metadata and exported row values', async () => {
    await withDownloadCapture(async (downloads) => {
      await buildWorkbook('Export_test', [{
        sheetName: 'Grand livre',
        columns: [{ header: 'Code', key: 'code' }, { header: 'Montant', key: 'amount' }],
        data: [{ code: 'A-1', amount: 1250 }],
      }], { moduleName: 'Finance', companyName: 'Société test', customDate: '2026-03-31' });

      assert.equal(downloads.length, 1);
      assert.match(downloads[0].filename, /^Export_test_\d{4}-\d{2}-\d{2}\.xlsx$/);
      assert.equal(downloads[0].blob.type, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(await downloads[0].blob.arrayBuffer());
      const sheet = workbook.getWorksheet('Grand livre');
      assert.ok(sheet);
      assert.equal(sheet.getCell('A1').value, 'SAFE_ERP - Grand livre');
      assert.equal(sheet.getCell('A2').value, 'Société : Société test | Module : Finance | Date : 2026-03-31');
      const headerValues = sheet.getRow(3).values;
      const dataValues = sheet.getRow(4).values;
      assert.deepEqual(Array.isArray(headerValues) ? headerValues.slice(1) : [], ['Code', 'Montant']);
      assert.deepEqual(Array.isArray(dataValues) ? dataValues.slice(1) : [], ['A-1', 1250]);
    });
  });

  it('writes escaped print HTML and invokes the browser print path without claiming a PDF binary', () => {
    withPrintWindowCapture((capture) => {
      exportToPDF('<Rapport>', [
        { header: 'Libellé', key: 'label' },
        { header: 'Valeur', key: 'value' },
      ], [{ label: '<script>alert(1)</script>', value: 'A & B' }], {
        moduleName: 'Synthèse',
        companyName: 'Société & Fils',
        currency: 'EUR',
        customDate: '2026-03-31',
      });

      assert.equal(capture.opened, true);
      assert.equal(capture.closed, true);
      assert.match(capture.html, /&lt;Rapport&gt; - SAFE_ERP/);
      assert.match(capture.html, /Société &amp; Fils/);
      assert.match(capture.html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
      assert.match(capture.html, /A &amp; B/);
      assert.match(capture.html, /window\.print\(\)/);
      assert.doesNotMatch(capture.html, /<script>alert\(1\)<\/script>/);

      exportToPDF('Trésorerie comptable', [
        { header: 'Date', key: 'date' },
      ], [{ date: '2026-03-31' }], {
        moduleName: 'Trésorerie comptable',
        language: 'AR',
        currency: 'TND',
        customDate: '2026-03-31',
      });
      assert.match(capture.html, /<html lang="ar-TN" dir="rtl">/);
      assert.match(capture.html, /الخزينة المحاسبية/);
      assert.match(capture.html, /<bdi dir="ltr">TND<\/bdi>/);
      assert.match(capture.html, /<bdi dir="auto">2026-03-31<\/bdi>/);
    });
  });

  it('generates a valid PPTX archive with executive and detail slide content', async () => {
    const writeFileDescriptor = Object.getOwnPropertyDescriptor(PptxGenJS.prototype, 'writeFile');
    const alertDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'alert');
    let pptxArtifact: Buffer | undefined;
    let exportAlert = '';

    Object.defineProperty(PptxGenJS.prototype, 'writeFile', {
      configurable: true,
      writable: true,
      value: async function (this: PptxGenJS, props?: PptxGenJS.WriteFileProps): Promise<string> {
        const output = await this.write({ outputType: 'nodebuffer' });
        assert.ok(output instanceof Uint8Array);
        pptxArtifact = Buffer.from(output);
        return props?.fileName ?? '';
      },
    });
    Object.defineProperty(globalThis, 'alert', {
      configurable: true,
      writable: true,
      value: (message: string) => { exportAlert = message; },
    });

    try {
      await exportToPowerPoint('Test_direction', [
        { header: 'Code', key: 'code' },
        { header: 'Montant', key: 'amount' },
      ], [{ code: 'A-1', amount: 1250 }], {
        moduleName: 'Synthèse financière',
        companyName: 'Société test',
        currency: 'EUR',
        customDate: '2026-03-31',
      }, [{ label: 'Résultat', value: '1 250 EUR' }]);

      assert.equal(exportAlert, '');
      assert.ok(pptxArtifact);
      assert.deepEqual(Array.from(pptxArtifact.subarray(0, 4)), [0x50, 0x4B, 0x03, 0x04]);
      const presentation = readZipEntry(pptxArtifact, 'ppt/presentation.xml').toString('utf8');
      const titleSlide = readZipEntry(pptxArtifact, 'ppt/slides/slide1.xml').toString('utf8');
      const detailSlide = readZipEntry(pptxArtifact, 'ppt/slides/slide2.xml').toString('utf8');
      assert.equal((presentation.match(/<p:sldId\b/g) ?? []).length, 2);
      assert.match(titleSlide, /Rapport Exécutif de Direction/);
      assert.match(titleSlide, /Société test/);
      assert.match(titleSlide, /Résultat/);
      assert.match(detailSlide, /A-1/);
      assert.match(detailSlide, /1250/);
    } finally {
      if (writeFileDescriptor) Object.defineProperty(PptxGenJS.prototype, 'writeFile', writeFileDescriptor);
      else Reflect.deleteProperty(PptxGenJS.prototype, 'writeFile');
      if (alertDescriptor) Object.defineProperty(globalThis, 'alert', alertDescriptor);
      else Reflect.deleteProperty(globalThis, 'alert');
    }
  });
});
