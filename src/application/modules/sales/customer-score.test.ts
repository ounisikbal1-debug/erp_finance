import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import prisma from '../../../core/models/prisma';
import { SalesRequestError } from './errors';
import { SalesService } from './service';

function stub(target: object, property: string, value: unknown): () => void {
  const original = Object.getOwnPropertyDescriptor(target, property);
  Object.defineProperty(target, property, { configurable: true, value });
  return () => {
    if (original) Object.defineProperty(target, property, original);
    else Reflect.deleteProperty(target, property);
  };
}

describe('SalesService.getCustomerScore', () => {
  it('returns the latest entity-scoped customer snapshot and indicates its configuration status', async () => {
    const restorers = [
      stub(prisma.customer, 'findFirst', async (query: unknown) => {
        assert.deepEqual(query, {
          where: { id: 'customer-a', entityId: 'entity-a' },
          select: { id: true },
        });
        return { id: 'customer-a' };
      }),
      stub(prisma.partnerScoreSnapshot, 'findFirst', async (query: unknown) => {
        assert.deepEqual(query, {
          where: { entityId: 'entity-a', scoreType: 'CUSTOMER', partnerId: 'customer-a' },
          orderBy: [{ calculatedAt: 'desc' }, { id: 'desc' }],
          select: {
            score: true,
            alertThreshold: true,
            alertTriggered: true,
            configurationVersion: true,
            calculatedAt: true,
          },
        });
        return {
          score: 82,
          alertThreshold: 45,
          alertTriggered: false,
          configurationVersion: 3,
          calculatedAt: new Date('2026-11-13T10:00:00.000Z'),
        };
      }),
      stub(prisma.workbookFeatureConfiguration, 'findUnique', async (query: unknown) => {
        assert.deepEqual(query, {
          where: { entityId_featureKey: { entityId: 'entity-a', featureKey: 'customer-supplier-scoring' } },
          select: { enabled: true, confirmedAt: true, version: true },
        });
        return { enabled: true, confirmedAt: new Date('2026-11-12T10:00:00.000Z'), version: 3 };
      }),
    ];
    try {
      const score = await SalesService.getCustomerScore('customer-a', 'entity-a');
      assert.deepEqual(score, {
        score: 82,
        alertThreshold: 45,
        alertTriggered: false,
        configurationVersion: 3,
        calculatedAt: new Date('2026-11-13T10:00:00.000Z'),
        isCurrent: true,
      });
    } finally {
      restorers.reverse().forEach((restore) => restore());
    }
  });

  it('does not present a historical score as current when scoring is no longer confirmed', async () => {
    const restorers = [
      stub(prisma.customer, 'findFirst', async () => ({ id: 'customer-a' })),
      stub(prisma.partnerScoreSnapshot, 'findFirst', async () => ({
        score: 82,
        alertThreshold: 45,
        alertTriggered: false,
        configurationVersion: 3,
        calculatedAt: new Date('2026-11-13T10:00:00.000Z'),
      })),
      stub(prisma.workbookFeatureConfiguration, 'findUnique', async () => ({
        enabled: false,
        confirmedAt: null,
        version: 3,
      })),
    ];
    try {
      assert.equal((await SalesService.getCustomerScore('customer-a', 'entity-a'))?.isCurrent, false);
    } finally {
      restorers.reverse().forEach((restore) => restore());
    }
  });

  it('rejects clients outside the authenticated entity before reading score snapshots', async () => {
    let scoreReads = 0;
    const restoreCustomer = stub(prisma.customer, 'findFirst', async () => null);
    const restoreScores = stub(prisma.partnerScoreSnapshot, 'findFirst', async () => {
      scoreReads += 1;
      return null;
    });
    const restoreConfiguration = stub(prisma.workbookFeatureConfiguration, 'findUnique', async () => null);
    try {
      await assert.rejects(
        SalesService.getCustomerScore('customer-a', 'entity-b'),
        (error: unknown) => error instanceof SalesRequestError && error.statusCode === 404,
      );
      assert.equal(scoreReads, 0);
    } finally {
      restoreConfiguration();
      restoreScores();
      restoreCustomer();
    }
  });
});
