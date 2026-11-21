import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { WorkbookFeatureConfigurationError } from './workbook-feature-errors';
import {
  createWorkbookPartnerDispute,
  resolveWorkbookPartnerDispute,
} from './workbook-partner-data';

const admin = { id: 'TEST_admin', username: 'test-admin' };

describe('workbook partner dispute validation', () => {
  it('rejects malformed or underspecified disputes before looking up a partner', async () => {
    for (const input of [
      null,
      { partnerType: 'OTHER', partnerId: 'customer-1', note: 'Issue' },
      { partnerType: 'CUSTOMER', partnerId: '', note: 'Issue' },
      { partnerType: 'CUSTOMER', partnerId: 'customer-1', note: 'No' },
    ]) {
      await assert.rejects(
        createWorkbookPartnerDispute('TEST_entity', input, admin),
        (error: unknown) => error instanceof WorkbookFeatureConfigurationError && error.statusCode === 400,
      );
    }
  });

  it('requires an allowed final status and a resolution note', async () => {
    await assert.rejects(
      resolveWorkbookPartnerDispute('TEST_entity', 'dispute-1', null, admin),
      (error: unknown) => error instanceof WorkbookFeatureConfigurationError && error.statusCode === 400,
    );
    await assert.rejects(
      resolveWorkbookPartnerDispute('TEST_entity', 'dispute-1', { status: 'OPEN', resolutionNote: 'Done' }, admin),
      (error: unknown) => error instanceof WorkbookFeatureConfigurationError && error.statusCode === 400,
    );
    await assert.rejects(
      resolveWorkbookPartnerDispute('TEST_entity', 'dispute-1', { status: 'RESOLVED', resolutionNote: 'No' }, admin),
      (error: unknown) => error instanceof WorkbookFeatureConfigurationError && error.statusCode === 400,
    );
  });
});
