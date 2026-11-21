import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  MAX_INVOICE_UPLOAD_BYTES,
  PDF_UPLOAD_TYPE,
  validateInvoiceUpload,
  XLSX_UPLOAD_TYPE,
} from './invoice-upload-validation';

describe('invoice upload validation', () => {
  it('accepts supported document extensions and infers an omitted browser MIME type', () => {
    assert.deepEqual(validateInvoiceUpload({ name: 'invoice.PDF', size: 10, type: '' }), {
      valid: true,
      contentType: PDF_UPLOAD_TYPE,
    });
    assert.deepEqual(validateInvoiceUpload({ name: 'invoice.xlsx', size: 10, type: XLSX_UPLOAD_TYPE }), {
      valid: true,
      contentType: XLSX_UPLOAD_TYPE,
    });
  });

  it('rejects empty, oversized, unsupported, or MIME-mismatched files', () => {
    for (const file of [
      { name: 'invoice.pdf', size: 0, type: PDF_UPLOAD_TYPE },
      { name: 'invoice.pdf', size: MAX_INVOICE_UPLOAD_BYTES + 1, type: PDF_UPLOAD_TYPE },
      { name: 'invoice.docx', size: 10, type: '' },
      { name: 'invoice.pdf', size: 10, type: XLSX_UPLOAD_TYPE },
    ]) {
      assert.equal(validateInvoiceUpload(file).valid, false);
    }
  });
});
