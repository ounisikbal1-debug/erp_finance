import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import prisma from '../../../core/models/prisma';
import { PurchaseRequestError } from './errors';
import { PurchasesService } from './service';

function stub(target: object, property: string, value: unknown): () => void {
  const original = Object.getOwnPropertyDescriptor(target, property);
  Object.defineProperty(target, property, { configurable: true, value });
  return () => {
    if (original) Object.defineProperty(target, property, original);
    else Reflect.deleteProperty(target, property);
  };
}

describe('PurchasesService.getSupplierScore', () => {
  it('returns the latest supplier snapshot with current-configuration status', async () => {
    const restorers = [
      stub(prisma.vendor, 'findFirst', async (query: unknown) => {
        assert.deepEqual(query, {
          where: { id: 'vendor-a', entityId: 'entity-a' },
          select: { id: true },
        });
        return { id: 'vendor-a' };
      }),
      stub(prisma.partnerScoreSnapshot, 'findFirst', async (query: unknown) => {
        assert.deepEqual(query, {
          where: { entityId: 'entity-a', scoreType: 'SUPPLIER', partnerId: 'vendor-a' },
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
          score: 55,
          alertThreshold: 40,
          alertTriggered: false,
          configurationVersion: 2,
          calculatedAt: new Date('2026-11-13T10:00:00.000Z'),
        };
      }),
      stub(prisma.workbookFeatureConfiguration, 'findUnique', async () => ({
        enabled: true,
        confirmedAt: new Date('2026-11-12T10:00:00.000Z'),
        version: 3,
      })),
    ];
    try {
      const score = await PurchasesService.getSupplierScore('vendor-a', 'entity-a');
      assert.deepEqual(score, {
        score: 55,
        alertThreshold: 40,
        alertTriggered: false,
        configurationVersion: 2,
        calculatedAt: new Date('2026-11-13T10:00:00.000Z'),
        isCurrent: false,
      });
    } finally {
      restorers.reverse().forEach((restore) => restore());
    }
  });

  it('does not read snapshots for a supplier outside the entity', async () => {
    let scoreReads = 0;
    const restoreVendor = stub(prisma.vendor, 'findFirst', async () => null);
    const restoreScore = stub(prisma.partnerScoreSnapshot, 'findFirst', async () => {
      scoreReads += 1;
      return null;
    });
    const restoreConfiguration = stub(prisma.workbookFeatureConfiguration, 'findUnique', async () => null);
    try {
      await assert.rejects(
        PurchasesService.getSupplierScore('vendor-a', 'entity-b'),
        (error: unknown) => error instanceof PurchaseRequestError && error.statusCode === 404,
      );
      assert.equal(scoreReads, 0);
    } finally {
      restoreConfiguration();
      restoreScore();
      restoreVendor();
    }
  });
});
