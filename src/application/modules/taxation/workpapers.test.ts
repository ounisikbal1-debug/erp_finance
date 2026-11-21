import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  parseTaxDeclarationWorkpaperInput,
  TaxDeclarationWorkpaperError,
} from './workpapers';

describe('tax declaration workpapers', () => {
  it('accepts a G50 VAT component review without allowing a manually entered amount', () => {
    assert.deepEqual(parseTaxDeclarationWorkpaperInput({
      period: '2025-01',
      section: 'G50',
      sourceReference: 'G50-TVA-2025-01',
      reviewNote: 'Composant TVA synthétique, à vérifier.',
      confirmed: true,
    }), {
      period: '2025-01',
      section: 'G50',
      sourceReference: 'G50-TVA-2025-01',
      reviewNote: 'Composant TVA synthétique, à vérifier.',
      confirmed: true,
    });

    assert.throws(() => parseTaxDeclarationWorkpaperInput({
      period: '2025-01',
      section: 'G50',
      sourceReference: 'G50-TVA-2025-01',
      reviewNote: 'Composant TVA synthétique, à vérifier.',
      confirmed: true,
      amount: 10,
    }), /composant TVA G50 est calculé/);
  });

  it('requires an explicit completeness attestation for a certificate-based RS total', () => {
    assert.throws(() => parseTaxDeclarationWorkpaperInput({
      period: '2026-10',
      section: 'RS',
      sourceReference: 'RS-REC-2026-10',
      reviewNote: 'Rapprochement vérifié avec la comptabilité.',
      confirmed: false,
    }), TaxDeclarationWorkpaperError);

    assert.throws(() => parseTaxDeclarationWorkpaperInput({
      period: '2026-10',
      section: 'RS',
      sourceReference: 'RS-REC-2026-10',
      reviewNote: 'Rapprochement vérifié avec la comptabilité.',
      confirmed: true,
      amount: 10,
    }), /Le total RS est calculé depuis les certificats émis/);
  });

  it('requires both a source-backed IS base and amount at millime precision', () => {
    assert.throws(() => parseTaxDeclarationWorkpaperInput({
      period: '2026-10',
      section: 'IS',
      sourceReference: 'IS-WORK-2026',
      reviewNote: 'Dossier fiscal examiné et validé.',
      confirmed: true,
      amount: 200,
    }), /base issue du dossier fiscal validé sont obligatoires/);

    assert.throws(() => parseTaxDeclarationWorkpaperInput({
      period: '2026-10',
      section: 'IS',
      sourceReference: 'IS-WORK-2026',
      reviewNote: 'Dossier fiscal examiné et validé.',
      confirmed: true,
      amount: 200.0001,
      taxableBase: 1000,
    }), /exprimé au millime/);
  });

  it('accepts a source-referenced IS workpaper without applying an unverified tax formula', () => {
    assert.deepEqual(parseTaxDeclarationWorkpaperInput({
      period: '2026-10',
      section: 'IS',
      sourceReference: 'IS-WORK-2026',
      reviewNote: 'Dossier fiscal examiné et validé.',
      confirmed: true,
      amount: 200,
      taxableBase: 1000,
    }), {
      period: '2026-10',
      section: 'IS',
      sourceReference: 'IS-WORK-2026',
      reviewNote: 'Dossier fiscal examiné et validé.',
      confirmed: true,
      amount: 200,
      taxableBase: 1000,
    });
  });
});
