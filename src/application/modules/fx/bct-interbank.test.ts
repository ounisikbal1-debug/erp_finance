import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseBctInterbankRates } from './bct-interbank';

const SYNTHETIC_BCT_HTML = `
<h3>Cours Moyens des Devises Cotées en dinar tunisien</h3>
<h5>Journée du 29/10/2026</h5>
<table>
  <tr><th>Monnaie</th><th>Sigle</th><th>Unité</th><th>Valeur</th></tr>
  <tr><td>EURO</td><td>EUR</td><td>1</td><td>3,4</td></tr>
  <tr><td>DIRHAM DES EAU</td><td>AED</td><td>10</td><td>8,0</td></tr>
</table>
<h3>Cours Moyens en dinar tunisien pour le Change Manuel</h3>`;

describe('BCT interbank rate parsing', () => {
  it('normalizes published rate units and preserves effective dates', () => {
    assert.deepEqual(parseBctInterbankRates(SYNTHETIC_BCT_HTML), {
      effectiveDate: '2026-10-29',
      rates: [
        { baseCurrency: 'EUR', quoteCurrency: 'TND', rate: 3.4, sourceUnit: 1, sourceValue: 3.4 },
        { baseCurrency: 'AED', quoteCurrency: 'TND', rate: 0.8, sourceUnit: 10, sourceValue: 8 },
      ],
    });
  });

  it('fails explicitly when the source layout or published date is missing', () => {
    assert.throws(() => parseBctInterbankRates('<html>No rates</html>'), /section des cours interbancaires/);
    assert.throws(() => parseBctInterbankRates(SYNTHETIC_BCT_HTML.replace('29/10/2026', 'inconnue')), /date effective/);
  });
});
