import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import prisma from '../../../data/prisma/client';
import { TaxationService } from './service';

const accountant = { id: 'user-1', username: 'accountant', role: 'ACCOUNTANT' };

function installStub(target: object, property: string, value: unknown, restorers: Array<() => void>) {
  const original = Object.getOwnPropertyDescriptor(target, property);
  Object.defineProperty(target, property, { configurable: true, value });
  restorers.push(() => {
    if (original) Object.defineProperty(target, property, original);
    else Reflect.deleteProperty(target, property);
  });
}

describe('TaxationService.recordTaxDeclarationWorkpaper', () => {
  it('stores the calculated VAT component for a G50 workpaper without accepting manual amounts', async () => {
    const restorers: Array<() => void> = [];
    let created: Record<string, unknown> | undefined;
    installStub(prisma.entity, 'findUnique', async () => ({ country: { code: 'TN', corporateTax: 20 } }), restorers);
    installStub(TaxationService, 'getMonthlyTaxDeclaration', async () => ({
      tvaDue: 17.765,
      tvaDetailsCollected: [{ baseHT: 100 }, { baseHT: 25.5 }],
    }), restorers);
    installStub(prisma, '$transaction', async (callback: (tx: unknown) => Promise<unknown>) => callback({
      taxDeclarationWorkpaper: {
        findFirst: async () => null,
        create: async ({ data }: { data: Record<string, unknown> }) => {
          created = data;
          return data;
        },
      },
    }), restorers);

    try {
      const workpaper = await TaxationService.recordTaxDeclarationWorkpaper({
        period: '2025-01',
        section: 'G50',
        sourceReference: 'G50-TVA-2025-01',
        reviewNote: 'Composant TVA synthétique, à vérifier.',
        confirmed: true,
      }, 'entity-1', accountant);
      assert.equal(created?.amount, 17.765);
      assert.equal(created?.taxableBase, 125.5);
      assert.equal(created?.taxRateSnapshot, null);
      assert.equal(workpaper.sourceCurrent, true);
    } finally {
      restorers.reverse().forEach((restore) => restore());
    }
  });

  it('refuses a G50 workpaper when the TVA component is incomplete', async () => {
    const restorers: Array<() => void> = [];
    installStub(prisma.entity, 'findUnique', async () => ({ country: { code: 'TN', corporateTax: 20 } }), restorers);
    installStub(TaxationService, 'getMonthlyTaxDeclaration', async () => ({
      tvaDue: null,
      tvaDetailsCollected: [],
    }), restorers);

    try {
      await assert.rejects(TaxationService.recordTaxDeclarationWorkpaper({
        period: '2025-01',
        section: 'G50',
        sourceReference: 'G50-TVA-2025-01',
        reviewNote: 'Composant TVA synthétique, à vérifier.',
        confirmed: true,
      }, 'entity-1', accountant), /composant TVA G50 est incomplet/);
    } finally {
      restorers.reverse().forEach((restore) => restore());
    }
  });

  it('snapshots only issued RS certificates and creates a new immutable version', async () => {
    const restorers: Array<() => void> = [];
    let created: Record<string, unknown> | undefined;
    installStub(prisma.entity, 'findUnique', async () => ({ country: { code: 'TN', corporateTax: 20 } }), restorers);
    installStub(prisma, '$transaction', async (callback: (tx: unknown) => Promise<unknown>) => callback({
      withholdingCertificate: {
        findMany: async () => [
          { status: 'ISSUED', withholdingAmount: 10.125, currencyCode: 'TND' },
          { status: 'ISSUED', withholdingAmount: 2.375, currencyCode: 'TND' },
          { status: 'CANCELLED', withholdingAmount: 50, currencyCode: 'TND' },
        ],
      },
      taxDeclarationWorkpaper: {
        findFirst: async () => ({ version: 3 }),
        updateMany: async () => ({ count: 1 }),
        create: async ({ data }: { data: Record<string, unknown> }) => {
          created = data;
          return data;
        },
      },
    }), restorers);

    try {
      await TaxationService.recordTaxDeclarationWorkpaper({
        period: '2026-10',
        section: 'RS',
        sourceReference: 'RS-REC-2026-10',
        reviewNote: 'Rapprochement complet revu.',
        confirmed: true,
      }, 'entity-1', accountant);
      assert.equal(created?.amount, 12.5);
      assert.equal(created?.certificateCount, 2);
      assert.equal(created?.version, 4);
      assert.equal(created?.approvedByUserId, accountant.id);
    } finally {
      restorers.reverse().forEach((restore) => restore());
    }
  });

  it('stores the externally reviewed IS amount and rate snapshot without calculating it', async () => {
    const restorers: Array<() => void> = [];
    let created: Record<string, unknown> | undefined;
    installStub(prisma.entity, 'findUnique', async () => ({ country: { code: 'TN', corporateTax: 20 } }), restorers);
    installStub(prisma, '$transaction', async (callback: (tx: unknown) => Promise<unknown>) => callback({
      taxDeclarationWorkpaper: {
        findFirst: async () => null,
        create: async ({ data }: { data: Record<string, unknown> }) => {
          created = data;
          return data;
        },
      },
    }), restorers);

    try {
      await TaxationService.recordTaxDeclarationWorkpaper({
        period: '2026-10',
        section: 'IS',
        sourceReference: 'IS-WORK-2026-10',
        reviewNote: 'Dossier fiscal validé par le professionnel.',
        confirmed: true,
        taxableBase: 1000,
        amount: 173.456,
      }, 'entity-1', accountant);
      assert.equal(created?.amount, 173.456);
      assert.equal(created?.taxableBase, 1000);
      assert.equal(created?.taxRateSnapshot, 20);
      assert.equal(created?.certificateCount, null);
    } finally {
      restorers.reverse().forEach((restore) => restore());
    }
  });

  it('refuses to approve RS while a certificate remains prepared', async () => {
    const restorers: Array<() => void> = [];
    installStub(prisma.entity, 'findUnique', async () => ({ country: { code: 'TN', corporateTax: 20 } }), restorers);
    installStub(prisma, '$transaction', async (callback: (tx: unknown) => Promise<unknown>) => callback({
      withholdingCertificate: {
        findMany: async () => [{ status: 'PREPARED', withholdingAmount: 10, currencyCode: 'TND' }],
      },
      taxDeclarationWorkpaper: {
        findFirst: async () => null,
        create: async () => assert.fail('must not create a workpaper'),
      },
    }), restorers);

    try {
      await assert.rejects(TaxationService.recordTaxDeclarationWorkpaper({
        period: '2026-10',
        section: 'RS',
        sourceReference: 'RS-REC-2026-10',
        reviewNote: 'Rapprochement complet revu.',
        confirmed: true,
      }, 'entity-1', accountant), /Émettez ou annulez tous les certificats préparés/);
    } finally {
      restorers.reverse().forEach((restore) => restore());
    }
  });
});
