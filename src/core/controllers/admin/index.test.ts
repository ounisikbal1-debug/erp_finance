import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import express from 'express';
import { describe, it } from 'node:test';
import { authenticate, authorize, createAccessToken, getModuleRoles } from '../../../application/auth';
import AdminLocalizationService, {
  AdminCountryNotFoundError,
  AdminRegulatoryRevisionNotFoundError,
} from '../../../application/modules/admin/service';
import { CountryConfigurationValidationError } from '../../../application/modules/admin/country-configuration';
import { RegulatoryRevisionValidationError } from '../../../application/modules/admin/regulatory-revisions';
import adminRouter from './index';

const secret = 'a-synthetic-access-policy-test-secret';

describe('admin access policy API', () => {
  it('requires an administrator and returns the effective API policy snapshot', async () => {
    const app = express();
    app.use(express.json());
    app.use(authenticate, authorize(...(getModuleRoles('admin') ?? [])));
    app.use(adminRouter);
    const server = createServer(app);
    const originalSecret = process.env.SAFE_ERP_AUTH_SECRET;
    process.env.SAFE_ERP_AUTH_SECRET = secret;

    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    try {
      const address = server.address();
      assert.ok(address && typeof address !== 'string');
      const url = `http://127.0.0.1:${address.port}/access-policies`;
      const noToken = await fetch(url);
      assert.equal(noToken.status, 401);
      const usersUrl = `http://127.0.0.1:${address.port}/users`;
      assert.equal((await fetch(usersUrl)).status, 401);
      const customsTariffsUrl = `http://127.0.0.1:${address.port}/countries/TN/customs-tariffs`;
      const countryTaxRulesUrl = `http://127.0.0.1:${address.port}/countries/TN/tax-rules`;
      const customsTariffPreviewUrl = `${customsTariffsUrl}/import-preview`;
      const customsTariffImportUrl = `${customsTariffsUrl}/import`;
      assert.equal((await fetch(customsTariffsUrl)).status, 401);
      assert.equal((await fetch(countryTaxRulesUrl)).status, 401);
      assert.equal((await fetch(countryTaxRulesUrl, { method: 'POST' })).status, 401);
      assert.equal((await fetch(customsTariffPreviewUrl, { method: 'POST' })).status, 401);
      assert.equal((await fetch(customsTariffImportUrl, { method: 'POST' })).status, 401);
      const featureUrl = `http://127.0.0.1:${address.port}/workbook-features/TEST_entity`;
      const featureValidateUrl = `${featureUrl}/offline-sync/validate`;
      const featureRevisionsUrl = `${featureUrl}/offline-sync/revisions`;
      const connectorCredentialsUrl = `${featureUrl}/tuneps-connector/credentials`;
      const connectorTestUrl = `${featureUrl}/tuneps-connector/test-connection`;
      const scoreUrl = `http://127.0.0.1:${address.port}/workbook-features/TEST_entity/scores`;
      const disputesUrl = `http://127.0.0.1:${address.port}/workbook-features/TEST_entity/disputes`;
      const disputeListUrl = `${disputesUrl}/CUSTOMER/customer-1`;
      const disputeStatusUrl = `${disputesUrl}/dispute-1/status`;
      assert.equal((await fetch(featureUrl)).status, 401);
      assert.equal((await fetch(featureValidateUrl, { method: 'POST' })).status, 401);
      assert.equal((await fetch(featureRevisionsUrl)).status, 401);
      assert.equal((await fetch(connectorCredentialsUrl)).status, 401);
      assert.equal((await fetch(connectorTestUrl, { method: 'POST' })).status, 401);
      assert.equal((await fetch(scoreUrl, { method: 'POST' })).status, 401);
      assert.equal((await fetch(disputeListUrl)).status, 401);
      assert.equal((await fetch(disputesUrl, { method: 'POST' })).status, 401);
      assert.equal((await fetch(disputeStatusUrl, { method: 'PUT' })).status, 401);

      const financeToken = createAccessToken({
        id: 'TEST_finance',
        username: 'TEST_finance',
        role: 'FINANCIAL_MANAGER',
        entityId: 'TEST_entity',
      }, secret);
      const forbidden = await fetch(url, { headers: { Authorization: `Bearer ${financeToken}` } });
      assert.equal(forbidden.status, 403);
      assert.equal((await fetch(usersUrl, { headers: { Authorization: `Bearer ${financeToken}` } })).status, 403);
      assert.equal((await fetch(customsTariffsUrl, { headers: { Authorization: `Bearer ${financeToken}` } })).status, 403);
      assert.equal((await fetch(countryTaxRulesUrl, { headers: { Authorization: `Bearer ${financeToken}` } })).status, 403);
      assert.equal((await fetch(customsTariffPreviewUrl, {
        method: 'POST',
        headers: { Authorization: `Bearer ${financeToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ csv: '', settings: {} }),
      })).status, 403);
      assert.equal((await fetch(customsTariffImportUrl, {
        method: 'POST',
        headers: { Authorization: `Bearer ${financeToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ importConfirmed: true }),
      })).status, 403);
      assert.equal((await fetch(featureUrl, { headers: { Authorization: `Bearer ${financeToken}` } })).status, 403);
      assert.equal((await fetch(featureValidateUrl, {
        method: 'POST',
        headers: { Authorization: `Bearer ${financeToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ configuration: {} }),
      })).status, 403);
      assert.equal((await fetch(featureRevisionsUrl, {
        headers: { Authorization: `Bearer ${financeToken}` },
      })).status, 403);
      assert.equal((await fetch(connectorCredentialsUrl, {
        headers: { Authorization: `Bearer ${financeToken}` },
      })).status, 403);
      assert.equal((await fetch(connectorTestUrl, {
        method: 'POST',
        headers: { Authorization: `Bearer ${financeToken}` },
      })).status, 403);
      assert.equal((await fetch(scoreUrl, {
        method: 'POST',
        headers: { Authorization: `Bearer ${financeToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ subjectType: 'CUSTOMER', partnerId: 'customer-1', metrics: {} }),
      })).status, 403);
      assert.equal((await fetch(disputeListUrl, {
        headers: { Authorization: `Bearer ${financeToken}` },
      })).status, 403);
      assert.equal((await fetch(disputesUrl, {
        method: 'POST',
        headers: { Authorization: `Bearer ${financeToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ partnerType: 'CUSTOMER', partnerId: 'customer-1', note: 'Litige test' }),
      })).status, 403);
      assert.equal((await fetch(disputeStatusUrl, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${financeToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'RESOLVED', resolutionNote: 'Résolu' }),
      })).status, 403);

      const adminToken = createAccessToken({
        id: 'TEST_admin',
        username: 'TEST_admin',
        role: 'ADMIN',
        entityId: 'TEST_entity',
      }, secret);
      const otherEntityFeatureUrl = `http://127.0.0.1:${address.port}/workbook-features/OTHER_entity`;
      const otherEntityValidationUrl = `${otherEntityFeatureUrl}/offline-sync/validate`;
      const otherEntityDisputesUrl = `http://127.0.0.1:${address.port}/workbook-features/OTHER_entity/disputes/CUSTOMER/customer-1`;
      assert.equal((await fetch(otherEntityFeatureUrl, {
        headers: { Authorization: `Bearer ${adminToken}` },
      })).status, 403);
      assert.equal((await fetch(otherEntityValidationUrl, {
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ configuration: {} }),
      })).status, 403);
      assert.equal((await fetch(otherEntityDisputesUrl, {
        headers: { Authorization: `Bearer ${adminToken}` },
      })).status, 403);
      const response = await fetch(url, { headers: { Authorization: `Bearer ${adminToken}` } });
      assert.equal(response.status, 200);
      const snapshot: unknown = await response.json();
      assert.ok(snapshot && typeof snapshot === 'object' && 'policies' in snapshot);
      assert.ok(Array.isArray(snapshot.policies));
      assert.ok(snapshot.policies.some((policy: { module?: unknown }) => policy.module === 'consolidation'));
      const validOfflinePolicy = await fetch(featureValidateUrl, {
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          configuration: {
            supportedDocumentTypes: ['SALES_ORDER'],
            conflictPolicy: 'MANUAL_REVIEW',
            syncMode: 'AUTO_ONLINE',
            requireOnlineReauthentication: true,
            maxPendingItems: 10,
            maxDraftAgeHours: 24,
          },
        }),
      });
      assert.equal(validOfflinePolicy.status, 200);
      const validationResult: unknown = await validOfflinePolicy.json();
      assert.ok(validationResult && typeof validationResult === 'object' && 'valid' in validationResult);
      assert.equal((validationResult as { valid: unknown }).valid, true);
      assert.ok(validationResult && typeof validationResult === 'object' && 'activationAvailable' in validationResult);
      if (validationResult && typeof validationResult === 'object' && 'activationAvailable' in validationResult) {
        assert.equal(validationResult.activationAvailable, true);
      }
      const invalidOfflinePolicy = await fetch(featureValidateUrl, {
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ configuration: { syncMode: 'AUTOMATIC' } }),
      });
      assert.equal(invalidOfflinePolicy.status, 400);
      const invalidScore = await fetch(scoreUrl, {
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ subjectType: 'OTHER', partnerId: 'customer-1', metrics: {} }),
      });
      assert.equal(invalidScore.status, 400);
      const missingHealthMetrics = await fetch(scoreUrl, {
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ subjectType: 'HEALTH', partnerId: 'TEST_entity' }),
      });
      assert.equal(missingHealthMetrics.status, 400);
      const invalidDispute = await fetch(disputesUrl, {
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ partnerType: 'OTHER', partnerId: 'customer-1', note: 'Invalid type' }),
      });
      assert.equal(invalidDispute.status, 400);
      const invalidDisputeResolution = await fetch(disputeStatusUrl, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'OPEN', resolutionNote: 'Not a final state' }),
      });
      assert.equal(invalidDisputeResolution.status, 400);
      const activationAttempt = await fetch(`${featureUrl}/cloud-ai`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ configuration: { consent: true }, enabled: true }),
      });
      assert.equal(activationAttempt.status, 409);
      const connectorActivationAttempt = await fetch(`${featureUrl}/tuneps-connector`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          configuration: {
            contractVersion: '2026-draft-1',
            baseUrl: 'https://api.example.tn',
            resourcePath: '/v1/tenders',
            credentialProvider: 'SECRET_MANAGER',
            requestMapping: { tenderNumber: 'tender.reference' },
            responseMapping: { remoteId: 'id' },
          },
          enabled: true,
          confirmConfiguration: true,
          confirmationNote: 'Contrat examiné par un administrateur.',
        }),
      });
      assert.equal(connectorActivationAttempt.status, 409);
      const unknownFeature = await fetch(`${featureUrl}/not-in-catalog`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ configuration: {} }),
      });
      assert.equal(unknownFeature.status, 404);
      const invalidAccount = await fetch(usersUrl, {
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'test.user', password: 'short', role: 'ACCOUNTANT' }),
      });
      assert.equal(invalidAccount.status, 400);

      const originalListCountries = AdminLocalizationService.listCountries;
      const originalGetCountryByCode = AdminLocalizationService.getCountryByCode;
      const originalListRegulatoryRevisions = AdminLocalizationService.listRegulatoryRevisions;
      const originalUpdateCountryProfile = AdminLocalizationService.updateCountryProfile;
      const originalCreateRegulatoryRevision = AdminLocalizationService.createRegulatoryRevision;
      const originalTransitionRegulatoryRevision = AdminLocalizationService.transitionRegulatoryRevision;
      const originalConsoleError = console.error;
      const loggedErrors: unknown[][] = [];
      const syntheticDiagnostic = 'synthetic database connection detail';
      try {
        console.error = (...args: any[]) => loggedErrors.push(args);
        AdminLocalizationService.listCountries = async () => {
          throw Object.assign(new Error(syntheticDiagnostic), { code: 'P2021' });
        };
        const countriesResponse = await fetch(`http://127.0.0.1:${address.port}/countries`, {
          headers: { Authorization: `Bearer ${adminToken}` },
        });
        assert.equal(countriesResponse.status, 500);
        assert.equal(countriesResponse.headers.get('content-type')?.includes('application/json'), true);
        assert.deepEqual(await countriesResponse.json(), { error: 'Impossible de charger la liste des pays.' });

        AdminLocalizationService.getCountryByCode = async () => {
          throw Object.assign(new Error(syntheticDiagnostic), { code: 'P2021' });
        };
        const databaseErrorResponse = await fetch(`http://127.0.0.1:${address.port}/countries/TN`, {
          headers: { Authorization: `Bearer ${adminToken}` },
        });
        assert.equal(databaseErrorResponse.status, 500);
        assert.deepEqual(await databaseErrorResponse.json(), { error: 'Impossible de charger la configuration du pays.' });

        AdminLocalizationService.listRegulatoryRevisions = async () => {
          throw Object.assign(new Error(syntheticDiagnostic), { code: 'P2021' });
        };
        const revisionsDatabaseError = await fetch(`http://127.0.0.1:${address.port}/countries/TN/revisions`, {
          headers: { Authorization: `Bearer ${adminToken}` },
        });
        assert.equal(revisionsDatabaseError.status, 500);
        assert.deepEqual(await revisionsDatabaseError.json(), {
          error: 'Impossible de charger l’historique des révisions réglementaires.',
        });
        AdminLocalizationService.listRegulatoryRevisions = async () => {
          throw new AdminCountryNotFoundError('TN');
        };
        const missingCountryRevisions = await fetch(`http://127.0.0.1:${address.port}/countries/TN/revisions`, {
          headers: { Authorization: `Bearer ${adminToken}` },
        });
        assert.equal(missingCountryRevisions.status, 404);
        assert.deepEqual(await missingCountryRevisions.json(), { error: 'Pays introuvable pour le code TN' });

        AdminLocalizationService.getCountryByCode = async () => {
          throw new AdminCountryNotFoundError('TN');
        };
        const missingCountryResponse = await fetch(`http://127.0.0.1:${address.port}/countries/TN`, {
          headers: { Authorization: `Bearer ${adminToken}` },
        });
        assert.equal(missingCountryResponse.status, 404);
        assert.deepEqual(await missingCountryResponse.json(), { error: 'Pays introuvable pour le code TN' });

        AdminLocalizationService.updateCountryProfile = async () => {
          throw new CountryConfigurationValidationError('Configuration synthétique invalide.');
        };
        const invalidCountryUpdate = await fetch(`http://127.0.0.1:${address.port}/countries/TN`, {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${adminToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({}),
        });
        assert.equal(invalidCountryUpdate.status, 400);
        assert.deepEqual(await invalidCountryUpdate.json(), { error: 'Configuration synthétique invalide.' });

        AdminLocalizationService.updateCountryProfile = async () => {
          throw Object.assign(new Error(syntheticDiagnostic), { code: 'P2021' });
        };
        const updateDatabaseError = await fetch(`http://127.0.0.1:${address.port}/countries/TN`, {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${adminToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({}),
        });
        assert.equal(updateDatabaseError.status, 500);
        assert.deepEqual(await updateDatabaseError.json(), {
          error: 'Impossible de mettre à jour la configuration du pays.',
        });

        AdminLocalizationService.updateCountryProfile = async () => {
          throw new AdminCountryNotFoundError('TN');
        };
        const missingCountryUpdate = await fetch(`http://127.0.0.1:${address.port}/countries/TN`, {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${adminToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({}),
        });
        assert.equal(missingCountryUpdate.status, 404);
        assert.deepEqual(await missingCountryUpdate.json(), { error: 'Pays introuvable pour le code TN' });

        AdminLocalizationService.createRegulatoryRevision = async () => {
          throw new RegulatoryRevisionValidationError('Révision synthétique invalide.');
        };
        const invalidRevision = await fetch(`http://127.0.0.1:${address.port}/countries/TN/revisions`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${adminToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({}),
        });
        assert.equal(invalidRevision.status, 400);
        assert.deepEqual(await invalidRevision.json(), { error: 'Révision synthétique invalide.' });

        AdminLocalizationService.createRegulatoryRevision = async () => {
          throw Object.assign(new Error(syntheticDiagnostic), { code: 'P2021' });
        };
        const revisionDatabaseError = await fetch(`http://127.0.0.1:${address.port}/countries/TN/revisions`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${adminToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({}),
        });
        assert.equal(revisionDatabaseError.status, 500);
        assert.deepEqual(await revisionDatabaseError.json(), {
          error: 'Impossible de traiter la révision réglementaire.',
        });

        AdminLocalizationService.createRegulatoryRevision = async () => {
          throw new AdminCountryNotFoundError('TN');
        };
        const revisionCountryNotFound = await fetch(`http://127.0.0.1:${address.port}/countries/TN/revisions`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${adminToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({}),
        });
        assert.equal(revisionCountryNotFound.status, 404);
        assert.deepEqual(await revisionCountryNotFound.json(), { error: 'Pays introuvable pour le code TN' });

        AdminLocalizationService.transitionRegulatoryRevision = async () => {
          throw new AdminRegulatoryRevisionNotFoundError();
        };
        const revisionNotFound = await fetch(`http://127.0.0.1:${address.port}/countries/TN/revisions/revision-1/status`, {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${adminToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ status: 'APPROVED', note: 'Validation synthétique' }),
        });
        assert.equal(revisionNotFound.status, 404);
        assert.deepEqual(await revisionNotFound.json(), { error: 'Version réglementaire introuvable pour ce pays.' });

        assert.equal(JSON.stringify(loggedErrors).includes(syntheticDiagnostic), false);
        assert.deepEqual(loggedErrors.map(([, metadata]) => metadata), [
          { errorType: 'Error', errorCode: 'P2021' },
          { errorType: 'Error', errorCode: 'P2021' },
          { errorType: 'Error', errorCode: 'P2021' },
          { errorType: 'Error', errorCode: 'P2021' },
          { errorType: 'Error', errorCode: 'P2021' },
        ]);
      } finally {
        AdminLocalizationService.listCountries = originalListCountries;
        AdminLocalizationService.getCountryByCode = originalGetCountryByCode;
        AdminLocalizationService.listRegulatoryRevisions = originalListRegulatoryRevisions;
        AdminLocalizationService.updateCountryProfile = originalUpdateCountryProfile;
        AdminLocalizationService.createRegulatoryRevision = originalCreateRegulatoryRevision;
        AdminLocalizationService.transitionRegulatoryRevision = originalTransitionRegulatoryRevision;
        console.error = originalConsoleError;
      }
    } finally {
      if (originalSecret === undefined) delete process.env.SAFE_ERP_AUTH_SECRET;
      else process.env.SAFE_ERP_AUTH_SECRET = originalSecret;
      await new Promise<void>((resolve, reject) => {
        server.close((error) => error ? reject(error) : resolve());
      });
    }
  });
});
