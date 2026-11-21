import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import prisma from '../../../core/models/prisma';
import { TaxationService } from './service';

const accountant = { id: 'user-1', username: 'accountant', role: 'ACCOUNTANT' };

function installStub(target: object, property: string, value: unknown, restorers: Array<() => void>): void {
  const original = Object.getOwnPropertyDescriptor(target, property);
  Object.defineProperty(target, property, { configurable: true, value });
  restorers.push(() => {
    if (original) Object.defineProperty(target, property, original);
    else Reflect.deleteProperty(target, property);
  });
}

function installTransactionStub(restorers: Array<() => void>): void {
  installStub(prisma, '$transaction', async (callback: (transaction: typeof prisma) => Promise<unknown>) => (
    callback(prisma)
  ), restorers);
}

function installTunisianEntityStub(restorers: Array<() => void>): void {
  installStub(prisma.entity, 'findUnique', async () => ({ country: { code: 'TN' } }), restorers);
}

describe('withholding certificate workflow', () => {
  it('prepares an auditable certificate from a posted invoice and derives beneficiary tax-ID status from the source', async () => {
    const restorers: Array<() => void> = [];
    let createData: Record<string, unknown> | undefined;
    try {
      installTunisianEntityStub(restorers);
      installStub(prisma.purchaseInvoice, 'findFirst', async (query: unknown) => {
        assert.deepEqual(query, {
          where: { entityId: 'entity-1', invoiceNumber: 'INV-1', status: 'POSTED' },
          select: {
            id: true,
            totalAmount: true,
            currencyCode: true,
            vendor: { select: { name: true, fiscalId: true } },
          },
        });
        return {
          id: 'invoice-1',
          totalAmount: 1000,
          currencyCode: 'TND',
          vendor: { name: 'Fournisseur A', fiscalId: '1234567A' },
        };
      }, restorers);
      installTransactionStub(restorers);
      installStub(prisma.withholdingCertificate, 'create', async (query: { data: Record<string, unknown> }) => {
        createData = query.data;
        return { id: 'certificate-1', status: 'PREPARED', ...query.data, workflowEvents: [{ action: 'PREPARED' }] };
      }, restorers);

      const certificate = await TaxationService.prepareWithholdingCertificate({
        period: '2026-10',
        category: 'achats',
        amountTtc: 1000,
        supplierFiscalIdPresent: true,
        selectedRate: 1,
        certificateNumber: 'RS-2026-001',
        sourceType: 'PURCHASE_INVOICE',
        sourceReference: 'INV-1',
      }, 'entity-1', accountant);

      assert.equal(certificate.withholdingRate, 1);
      assert.equal(certificate.withholdingAmount, 10);
      assert.equal(certificate.beneficiaryName, 'Fournisseur A');
      assert.equal(certificate.preparedByUserId, 'user-1');
      assert.equal(certificate.status, 'PREPARED');
      assert.equal(createData?.ruleSource, 'Documentation tunisienne déclarée validée par un expert-comptable du client');
      assert.equal(createData?.ruleSourceDate, null);
      assert.equal(createData?.ruleEffectiveFrom, null);
      assert.deepEqual(createData?.workflowEvents, {
        create: {
          action: 'PREPARED',
          actorUserId: 'user-1',
          actorUsername: 'accountant',
          note: 'Certificat préparé; émission soumise à une vérification humaine.',
        },
      });
    } finally {
      restorers.reverse().forEach((restore) => restore());
    }
  });

  it('blocks a certificate when source amount or supplier identity does not match', async () => {
    const restorers: Array<() => void> = [];
    try {
      installTunisianEntityStub(restorers);
      installStub(prisma.purchaseInvoice, 'findFirst', async () => ({
        id: 'invoice-1',
        totalAmount: 1000,
        currencyCode: 'TND',
        vendor: { name: 'Fournisseur A', fiscalId: '1234567A' },
      }), restorers);

      await assert.rejects(TaxationService.prepareWithholdingCertificate({
        period: '2026-10',
        category: 'achats',
        amountTtc: 999,
        supplierFiscalIdPresent: true,
        selectedRate: 1,
        certificateNumber: 'RS-1',
        sourceType: 'PURCHASE_INVOICE',
        sourceReference: 'INV-1',
      }, 'entity-1', accountant), /doit correspondre au montant/);

      await assert.rejects(TaxationService.prepareWithholdingCertificate({
        period: '2026-10',
        category: 'achats',
        amountTtc: 1000,
        supplierFiscalIdPresent: false,
        selectedRate: 1,
        certificateNumber: 'RS-2',
        sourceType: 'PURCHASE_INVOICE',
        sourceReference: 'INV-1',
      }, 'entity-1', accountant), /ne correspond pas à la source bénéficiaire/);
    } finally {
      restorers.reverse().forEach((restore) => restore());
    }
  });

  it('requires an authenticated actor with an existing taxation role', async () => {
    const restorers: Array<() => void> = [];
    try {
      await assert.rejects(
        TaxationService.getWithholdingCertificates('entity-1', { id: 'hr-1', username: 'hr', role: 'HR_MANAGER' }),
        /Rôle non habilité/,
      );
      await assert.rejects(
        TaxationService.getWithholdingCertificates('entity-1'),
        /Identité authentifiée requise/,
      );
    } finally {
      restorers.reverse().forEach((restore) => restore());
    }
  });

  it('issues a prepared certificate and records the transition actor and audit event atomically', async () => {
    const restorers: Array<() => void> = [];
    const updates: unknown[] = [];
    const events: unknown[] = [];
    const certificate = { id: 'certificate-1', entityId: 'entity-1', status: 'PREPARED' };
    try {
      installTunisianEntityStub(restorers);
      installTransactionStub(restorers);
      installStub(prisma.withholdingCertificate, 'findFirst', async () => certificate, restorers);
      installStub(prisma.withholdingCertificate, 'updateMany', async (query: unknown) => {
        updates.push(query);
        return { count: 1 };
      }, restorers);
      installStub(prisma.withholdingCertificateWorkflowEvent, 'create', async (query: unknown) => {
        events.push(query);
        return query;
      }, restorers);

      await TaxationService.transitionWithholdingCertificate('certificate-1', 'entity-1', 'ISSUE', accountant);
      const update = updates[0] as { where: { status: string }; data: { status: string; issuedByUserId: string } };
      assert.equal(update.where.status, 'PREPARED');
      assert.equal(update.data.status, 'ISSUED');
      assert.equal(update.data.issuedByUserId, 'user-1');
      assert.deepEqual(events[0], {
        data: {
          certificateId: 'certificate-1',
          action: 'ISSUED',
          actorUserId: 'user-1',
          actorUsername: 'accountant',
          note: 'Certificat émis après validation utilisateur.',
        },
      });
    } finally {
      restorers.reverse().forEach((restore) => restore());
    }
  });

  it('requires a reason to cancel or revoke and rejects invalid state transitions', async () => {
    const restorers: Array<() => void> = [];
    try {
      installTunisianEntityStub(restorers);
      installTransactionStub(restorers);
      installStub(prisma.withholdingCertificate, 'findFirst', async () => ({
        id: 'certificate-1',
        entityId: 'entity-1',
        status: 'CANCELLED',
      }), restorers);

      await assert.rejects(
        TaxationService.transitionWithholdingCertificate('certificate-1', 'entity-1', 'CANCEL', accountant, 'court'),
        /10 à 500 caractères/,
      );
      await assert.rejects(
        TaxationService.transitionWithholdingCertificate('certificate-1', 'entity-1', 'REVOKE', accountant, 'Motif de révocation documenté'),
        /Seul un certificat émis peut être révoqué/,
      );
    } finally {
      restorers.reverse().forEach((restore) => restore());
    }
  });
});
