import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { calculateStraightLineSchedule, FixedAssetsService, type AssetData } from './assets-service';

describe('Immobilisations SAFE: Fixed Assets & Depreciation Engine', () => {
  it('calculates a straight-line depreciation schedule with prorata temporis', () => {
    // Machine d'usinage de 120 000 DT, durée 5 ans (60 mois), mise en service au 1er juillet 2026
    const schedule = calculateStraightLineSchedule(
      120000000, // 120 000 DT (en millimes)
      0,
      60,
      new Date('2026-07-01T00:00:00Z'),
    );

    assert.equal(schedule.length, 6, 'Should span over 6 fiscal calendar years with prorata');
    
    // Année 1: 6 mois (juillet à décembre) -> 120 000 / 5 * (6/12) = 12 000 DT
    assert.equal(schedule[0].year, 2026);
    assert.equal(schedule[0].depreciationAmount, 12000000);
    assert.equal(schedule[0].endingBookValue, 108000000);

    // Année 2: 12 mois -> 24 000 DT
    assert.equal(schedule[1].year, 2027);
    assert.equal(schedule[1].depreciationAmount, 24000000);
    assert.equal(schedule[1].endingBookValue, 84000000);

    // Dernière année: solde de 6 mois -> 12 000 DT et VNC = 0
    const last = schedule[schedule.length - 1];
    assert.equal(last.depreciationAmount, 12000000);
    assert.equal(last.endingBookValue, 0);
    assert.equal(last.accumulatedDepreciation, 120000000);
  });

  it('posts a balanced journal entry and seals it into SHA-256 audit chain', async () => {
    let createdEntry: any = null;

    const mockPrisma: any = {
      $transaction: async (callback: any) => {
        const tx = {
          monthlyCloseLock: { findFirst: async () => null },
          journalEntry: {
            findFirst: async () => null,
            create: async (args: any) => {
              createdEntry = {
                id: 'je-dot-1',
                entityId: args.data.entityId,
                entryNumber: args.data.entryNumber,
                date: args.data.date,
                status: 'POSTED',
                createdAt: new Date(),
                lines: args.data.lines.create.map((l: any, idx: number) => ({ id: `line-${idx}`, ...l })),
              };
              return createdEntry;
            },
            findUnique: async () => createdEntry,
          },
          journalEntryAuditChainHead: {
            findUnique: async () => null,
            upsert: async () => ({ lastSequence: 0, lastHash: null, hashVersion: 1 }),
            update: async () => ({}),
          },
          journalEntryAuditRecord: {
            findUnique: async () => null,
            create: async () => ({}),
          },
          journalEntryWorkflowEvent: {
            create: async () => ({}),
          },
        };
        return callback(tx);
      },
    };

    const service = new FixedAssetsService(mockPrisma);
    const asset: AssetData = {
      id: 'ast-1',
      entityId: 'ent-1',
      code: 'IMMO-001',
      name: 'Ligne de Production CNC',
      category: 'EQUIPMENT_MACHINERY',
      assetAccountCode: '215000',
      depreciationAccountCode: '281500',
      expenseAccountCode: '681100',
      acquisitionDate: '2026-01-01',
      inServiceDate: '2026-01-01',
      grossValue: 50000000,
      salvageValue: 0,
      usefulLifeMonths: 60,
      method: 'STRAIGHT_LINE',
      accumulatedDepreciation: 0,
      bookValue: 50000000,
      status: 'IN_SERVICE',
    };

    const result = await service.postDepreciationEntry(
      'ent-1',
      asset,
      2026,
      10000000,
      { id: 'usr-1', username: 'admin' },
    );

    assert.equal(result.depreciationAmount, 10000000);
    assert.equal(result.newBookValue, 40000000);
    assert.equal(createdEntry.status, 'POSTED');
    assert.equal(createdEntry.lines.length, 2);

    const debitLine = createdEntry.lines.find((l: any) => l.debit > 0);
    const creditLine = createdEntry.lines.find((l: any) => l.credit > 0);
    assert.equal(debitLine.accountCode, '681100');
    assert.equal(creditLine.accountCode, '281500');
    assert.equal(debitLine.debit, creditLine.credit);
  });

  it('computes gain or loss on disposal and generates balanced journal entry', async () => {
    let createdEntry: any = null;
    const mockPrisma: any = {
      $transaction: async (callback: any) => {
        const tx = {
          monthlyCloseLock: { findFirst: async () => null },
          journalEntry: {
            create: async (args: any) => {
              createdEntry = {
                id: 'je-ces-1',
                entityId: args.data.entityId,
                entryNumber: args.data.entryNumber,
                date: args.data.date,
                status: 'POSTED',
                createdAt: new Date(),
                lines: args.data.lines.create.map((l: any, idx: number) => ({ id: `line-${idx}`, ...l })),
              };
              return createdEntry;
            },
            findUnique: async () => createdEntry,
          },
          journalEntryAuditChainHead: {
            findUnique: async () => null,
            upsert: async () => ({ lastSequence: 0, lastHash: null, hashVersion: 1 }),
            update: async () => ({}),
          },
          journalEntryAuditRecord: {
            findUnique: async () => null,
            create: async () => ({}),
          },
          journalEntryWorkflowEvent: { create: async () => ({}) },
        };
        return callback(tx);
      },
    };

    const service = new FixedAssetsService(mockPrisma);
    const asset: AssetData = {
      id: 'ast-2',
      entityId: 'ent-1',
      code: 'VEH-002',
      name: 'Fourgonnette de Livraison',
      category: 'TRANSPORT',
      assetAccountCode: '218200',
      depreciationAccountCode: '281820',
      expenseAccountCode: '681100',
      acquisitionDate: '2023-01-01',
      inServiceDate: '2023-01-01',
      grossValue: 40000000, // 40 000 DT
      salvageValue: 0,
      usefulLifeMonths: 48,
      method: 'STRAIGHT_LINE',
      accumulatedDepreciation: 30000000, // Amortis 30 000 DT -> VNC = 10 000 DT
      bookValue: 10000000,
      status: 'IN_SERVICE',
    };

    // Vente pour 14 000 DT -> Plus-value de 4 000 DT (compte 756)
    const result = await service.postAssetDisposal(
      'ent-1',
      asset,
      14000000,
      '532000', // Banque
      { id: 'usr-1', username: 'admin' },
    );

    assert.equal(result.gainOrLoss, 4000000);
    assert.equal(result.status, 'DISPOSED');

    const totalDebits = createdEntry.lines.reduce((acc: number, l: any) => acc + (l.debit || 0), 0);
    const totalCredits = createdEntry.lines.reduce((acc: number, l: any) => acc + (l.credit || 0), 0);
    assert.equal(totalDebits, totalCredits, 'Disposal entry must be strictly balanced');
    assert.equal(totalDebits, 44000000);
  });
});
