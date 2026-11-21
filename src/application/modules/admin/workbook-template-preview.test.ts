import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildWorkbookArabicTemplatePreview,
  buildWorkbookTaxFormPreview,
} from './workbook-template-preview';

describe('workbook local template previews', () => {
  it('previews configured DGI mappings without generating an official filing', () => {
    const preview = buildWorkbookTaxFormPreview('G50', {
      templateVersion: 'draft-1',
      sourceReference: 'https://example.test/g50.pdf',
      templates: [{
        documentType: 'G50',
        fields: [{ formFieldReference: 'taxpayer.id', sourceFieldReference: 'entity.taxIdentifier' }],
      }],
      humanReviewRequired: true,
      automaticPrefill: false,
      exportEnabled: false,
    }, { entity: { taxIdentifier: 'SYNTHETIC-123' } });

    assert.equal(preview.status, 'NON_OFFICIAL_PREVIEW');
    assert.equal(preview.fields[0].value, 'SYNTHETIC-123');
    assert.equal(preview.fields[0].available, true);
    assert.match(preview.notice, /ni un document officiel DGI/);
  });

  it('keeps Arabic layout RTL and flags fields missing from the local sample', () => {
    const preview = buildWorkbookArabicTemplatePreview({
      templateVersion: 'draft-2',
      sourceReference: 'https://example.test/layout.pdf',
      labels: [{ fieldReference: 'invoice.total', fr: 'Total', ar: 'المجموع' }],
      rtlArabic: true,
      latinNumbersLtr: true,
      humanReviewRequired: true,
      renderingEnabled: false,
    }, {});

    assert.equal(preview.direction, 'rtl');
    assert.equal(preview.numberDirection, 'ltr');
    assert.equal(preview.fields[0].available, false);
    assert.equal(preview.fields[0].value, null);
    assert.match(preview.notice, /conformité PDF restent à valider/);
  });
});
