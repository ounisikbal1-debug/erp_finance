import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildWorkbookConnectorRequestPreview,
  buildWorkbookConnectorResponsePreview,
  mapWorkbookConnectorFields,
} from './workbook-connector-adapter';

const configuration = {
  contractVersion: 'sandbox-1',
  baseUrl: 'https://sandbox.example.test',
  resourcePath: '/v1/tenders',
  credentialProvider: 'SECRET_MANAGER',
  requestMapping: {
    tenderNumber: 'tender.reference',
    'company.taxId': 'company.fiscalId',
  },
  responseMapping: {
    id: 'remoteReference',
    'status.code': 'status',
  },
};

describe('workbook connector sandbox adapter', () => {
  it('previews nested mappings without making a network request', () => {
    const preview = buildWorkbookConnectorRequestPreview(configuration, {
      tenderNumber: 'AO-001',
      company: { taxId: 'SYNTHETIC-001' },
    });

    assert.equal(preview.status, 'NOT_CONNECTED');
    assert.equal(preview.url, 'https://sandbox.example.test/v1/tenders');
    assert.deepEqual(preview.body, {
      tender: { reference: 'AO-001' },
      company: { fiscalId: 'SYNTHETIC-001' },
    });
    assert.match(preview.notice, /aucune connexion.*requête réseau/i);
    assert.equal(Object.keys(preview).includes('authorization'), false);
  });

  it('maps synthetic response fields in the opposite direction', () => {
    assert.deepEqual(
      buildWorkbookConnectorResponsePreview(configuration, {
        id: 'sandbox-42',
        status: { code: 'RECEIVED' },
      }),
      {
        status: 'NOT_CONNECTED',
        contractVersion: 'sandbox-1',
        mappedResponse: { remoteReference: 'sandbox-42', status: 'RECEIVED' },
        notice: 'Réponse synthétique remappée localement; elle ne provient pas du fournisseur externe.',
      },
    );
  });

  it('fails closed on absent paths and prototype-polluting destinations', () => {
    const originalPrototypeValue = Reflect.get(Object.prototype, 'polluted');
    assert.throws(
      () => mapWorkbookConnectorFields({}, { absent: 'target' }),
      /champ source.*absent/i,
    );
    assert.throws(
      () => mapWorkbookConnectorFields({ value: true }, { value: '__proto__.polluted' }),
      /segment interdit/i,
    );
    assert.throws(
      () => buildWorkbookConnectorRequestPreview({
        ...configuration,
        requestMapping: { value: '__proto__.polluted' },
      }, { value: true }),
      /segment de chemin interdit/i,
    );
    assert.equal(Reflect.get(Object.prototype, 'polluted'), originalPrototypeValue);
  });
});
