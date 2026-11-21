import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import prisma from '../../../data/prisma/client';
import { HrRequestError } from './errors';
import HrWorkflowService from './workflow-service';

function replaceMethod(target: object, key: string, value: (...args: any[]) => any) {
  const original = Object.getOwnPropertyDescriptor(target, key);
  Object.defineProperty(target, key, { configurable: true, value });
  return () => {
    if (original) Object.defineProperty(target, key, original);
    else Reflect.deleteProperty(target, key);
  };
}

function withMethods<T>(replacements: Array<[object, string, (...args: any[]) => any]>, run: () => Promise<T>) {
  const restores = replacements.map(([target, key, value]) => replaceMethod(target, key, value));
  return run().finally(() => restores.reverse().forEach((restore) => restore()));
}

describe('HR workflow services', () => {
  it('stores one private file per active document and audits the upload', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'safe-hr-service-'));
    const previousDirectory = process.env.SAFE_ERP_PRIVATE_STORAGE_DIR;
    process.env.SAFE_ERP_PRIVATE_STORAGE_DIR = directory;
    const lookups: unknown[] = [];
    let fileCreate: any;
    let eventCreate: any;
    let lookupCount = 0;
    await withMethods([
      [prisma, '$transaction', async (operation: (tx: typeof prisma) => unknown) => operation(prisma)],
      [prisma.employeeDocument, 'findFirst', async (args) => {
        lookups.push(args);
        lookupCount += 1;
        if (lookupCount === 1) return { id: 'document-1', status: 'ACTIVE', file: null };
        if (lookupCount === 2) return { id: 'document-1', status: 'ACTIVE', file: null };
        return { id: 'document-1', file: { id: 'file-1' } };
      }],
      [prisma.employeeDocumentFile, 'create', async (args) => { fileCreate = args; return { id: 'file-1' }; }],
      [prisma.employeeDocumentEvent, 'create', async (args) => { eventCreate = args; }],
    ], async () => {
      try {
        const result = await HrWorkflowService.uploadEmployeeDocumentFile(
          'document-1',
          'entity-a',
          { id: 'hr-user', username: 'hr-manager' },
          Buffer.from('%PDF-1.7\nHR file'),
          'application/pdf',
        );
        assert.deepEqual(result, { id: 'document-1', file: { id: 'file-1' } });
        assert.equal(lookups.length, 3);
        assert.deepEqual((lookups[0] as { where: unknown }).where, {
          id: 'document-1', employee: { entityId: 'entity-a' },
        });
        assert.equal(fileCreate.data.documentId, 'document-1');
        assert.match(fileCreate.data.storageKey, /^[0-9a-f-]{36}$/i);
        assert.equal(fileCreate.data.mimeType, 'application/pdf');
        assert.equal(fileCreate.data.uploadedByUserId, 'hr-user');
        assert.deepEqual(eventCreate.data, {
          documentId: 'document-1',
          action: 'FILE_UPLOADED',
          actorUserId: 'hr-user',
          actorUsername: 'hr-manager',
          note: `Fichier privé ajouté (application/pdf, ${Buffer.byteLength('%PDF-1.7\nHR file')} octets).`,
        });
      } finally {
        if (previousDirectory === undefined) delete process.env.SAFE_ERP_PRIVATE_STORAGE_DIR;
        else process.env.SAFE_ERP_PRIVATE_STORAGE_DIR = previousDirectory;
        await rm(directory, { recursive: true, force: true });
      }
    });
  });

  it('creates metadata-only employee documents for an employee in the scoped entity', async () => {
    let createArgs: any;
    await withMethods([
      [prisma, '$transaction', async (operation: (tx: typeof prisma) => unknown) => operation(prisma)],
      [prisma.employee, 'findFirst', async (args) => {
        assert.deepEqual(args.where, { id: 'employee-1', entityId: 'entity-a' });
        return { id: 'employee-1' };
      }],
      [prisma.employeeDocument, 'create', async (args) => {
        createArgs = args;
        return { id: 'document-1' };
      }],
    ], async () => {
      await assert.rejects(
        HrWorkflowService.createEmployeeDocument({
          employeeId: 'employee-1',
          category: 'CONTRACT',
          title: 'Employment contract',
          validFrom: '2026-01-01',
          storagePath: 'must-not-be-persisted',
        }, 'entity-a', { id: 'user-1', username: 'hr-user' }),
        (error: unknown) => error instanceof HrRequestError && error.statusCode === 400,
      );
      assert.equal(createArgs, undefined);
      const created = await HrWorkflowService.createEmployeeDocument({
        employeeId: 'employee-1',
        category: 'CONTRACT',
        title: 'Employment contract',
        validFrom: '2026-01-01',
      }, 'entity-a', { id: 'user-1', username: 'hr-user' });
      assert.deepEqual(created, { id: 'document-1' });
      assert.ok(createArgs);
      assert.equal(createArgs.data.employeeId, 'employee-1');
      assert.equal(createArgs.data.title, 'Employment contract');
      assert.equal(createArgs.data.storagePath, undefined);
      assert.equal(createArgs.data.file, undefined);
      assert.equal(createArgs.data.events.create.actorUserId, 'user-1');
    });
  });

  it('refuses document creation when the employee belongs to another entity', async () => {
    let writes = 0;
    await withMethods([
      [prisma, '$transaction', async (operation: (tx: typeof prisma) => unknown) => operation(prisma)],
      [prisma.employee, 'findFirst', async (args) => {
        assert.deepEqual(args.where, { id: 'employee-foreign', entityId: 'entity-a' });
        return null;
      }],
      [prisma.employeeDocument, 'create', async () => { writes += 1; }],
    ], async () => {
      await assert.rejects(
        HrWorkflowService.createEmployeeDocument({
          employeeId: 'employee-foreign', category: 'OTHER', title: 'Metadata',
        }, 'entity-a', { id: 'user-1', username: 'hr-user' }),
        (error: unknown) => error instanceof HrRequestError && error.statusCode === 404,
      );
      assert.equal(writes, 0);
    });
  });

  it('audits entity-scoped corrections to active employee document metadata only', async () => {
    const updates: unknown[] = [];
    const events: unknown[] = [];
    let status = 'ACTIVE';
    await withMethods([
      [prisma, '$transaction', async (operation: (tx: typeof prisma) => unknown) => operation(prisma)],
      [prisma.employeeDocument, 'findFirst', async (args) => {
        assert.deepEqual(args.where, { id: 'document-1', employee: { entityId: 'entity-a' } });
        if ('include' in args) return { id: 'document-1', status };
        return { id: 'document-1', status };
      }],
      [prisma.employeeDocument, 'updateMany', async (args) => {
        updates.push(args);
        return { count: 1 };
      }],
      [prisma.employeeDocumentEvent, 'create', async (args) => { events.push(args); }],
    ], async () => {
      status = 'ARCHIVED';
      await assert.rejects(HrWorkflowService.updateEmployeeDocument('document-1', {
        category: 'OTHER',
        title: 'Document corrigé',
        reason: 'Mise à jour des métadonnées',
      }, 'entity-a', { id: 'hr-user', username: 'hr-manager' }), /Seul un document actif/);
      assert.equal(updates.length, 0);

      status = 'ACTIVE';
      await HrWorkflowService.updateEmployeeDocument('document-1', {
        category: 'CERTIFICATE',
        title: 'Attestation corrigée',
        validFrom: '2026-02-01',
        validUntil: null,
        reason: 'Correction de la période de validité',
      }, 'entity-a', { id: 'hr-user', username: 'hr-manager' });
      assert.deepEqual(updates[0], {
        where: { id: 'document-1', status: 'ACTIVE', employee: { entityId: 'entity-a' } },
        data: {
          category: 'CERTIFICATE',
          title: 'Attestation corrigée',
          validFrom: new Date('2026-02-01T00:00:00.000Z'),
          validUntil: null,
        },
      });
      assert.deepEqual((events[0] as { data: unknown }).data, {
        documentId: 'document-1',
        action: 'UPDATED',
        actorUserId: 'hr-user',
        actorUsername: 'hr-manager',
        note: 'Correction de la période de validité',
      });
    });
  });

  it('records an entity-scoped candidate status transition and rejects repeat transitions', async () => {
    let currentStatus = 'RECEIVED';
    const updates: unknown[] = [];
    const events: unknown[] = [];
    await withMethods([
      [prisma, '$transaction', async (operation: (tx: typeof prisma) => unknown) => operation(prisma)],
      [prisma.candidateApplication, 'findFirst', async (args) => {
        assert.deepEqual(args.where, { id: 'candidate-1', position: { entityId: 'entity-a' } });
        return { id: 'candidate-1', status: currentStatus, anonymizedAt: null };
      }],
      [prisma.candidateApplication, 'updateMany', async (args) => {
        updates.push(args);
        currentStatus = args.data.status;
        return { count: 1 };
      }],
      [prisma.candidateApplicationEvent, 'create', async (args) => { events.push(args); }],
    ], async () => {
      await HrWorkflowService.changeCandidateStatus('candidate-1', 'entity-a', {
        id: 'reviewer-1', username: 'reviewer',
      }, 'IN_REVIEW');
      assert.deepEqual(updates[0], {
        where: {
          id: 'candidate-1', status: 'RECEIVED', anonymizedAt: null, position: { entityId: 'entity-a' },
        },
        data: { status: 'IN_REVIEW' },
      });
      assert.deepEqual((events[0] as any).data, {
        applicationId: 'candidate-1',
        action: 'STATUS_CHANGED',
        statusFrom: 'RECEIVED',
        statusTo: 'IN_REVIEW',
        actorUserId: 'reviewer-1',
        actorUsername: 'reviewer',
      });
      await assert.rejects(
        HrWorkflowService.changeCandidateStatus('candidate-1', 'entity-a', {
          id: 'reviewer-1', username: 'reviewer',
        }, 'IN_REVIEW'),
        (error: unknown) => error instanceof HrRequestError && error.statusCode === 409,
      );
      assert.equal(events.length, 1);
    });
  });

  it('requires a separate reviewer and records claims as reviewed without creating accounting entries', async () => {
    let status = 'TO_REVIEW';
    let update: any;
    let event: any;
    await withMethods([
      [prisma, '$transaction', async (operation: (tx: typeof prisma) => unknown) => operation(prisma)],
      [prisma.employeeExpenseClaim, 'findFirst', async (args) => {
        assert.deepEqual(args.where, { id: 'claim-1', employee: { entityId: 'entity-a' } });
        return { id: 'claim-1', status, submittedByUserId: 'submitter' };
      }],
      [prisma.employeeExpenseClaim, 'updateMany', async (args) => { update = args; status = args.data.status; return { count: 1 }; }],
      [prisma.employeeExpenseClaimEvent, 'create', async (args) => { event = args; }],
    ], async () => {
      await assert.rejects(
        HrWorkflowService.reviewExpenseClaim('claim-1', 'entity-a', {
          id: 'submitter', username: 'submitter',
        }, 'APPROVED'),
        (error: unknown) => error instanceof HrRequestError && error.statusCode === 403,
      );
      assert.equal(update, undefined);
      await HrWorkflowService.reviewExpenseClaim('claim-1', 'entity-a', {
        id: 'reviewer', username: 'reviewer',
      }, 'APPROVED');
      assert.ok(update);
      assert.deepEqual(update.where, {
        id: 'claim-1',
        status: 'TO_REVIEW',
        submittedByUserId: { not: 'reviewer' },
        employee: { entityId: 'entity-a' },
      });
      assert.equal(update.data.status, 'APPROVED');
      assert.equal(event.data.statusFrom, 'TO_REVIEW');
      assert.equal(event.data.statusTo, 'APPROVED');
      assert.equal(status, 'APPROVED');
      await assert.rejects(
        HrWorkflowService.reviewExpenseClaim('claim-1', 'entity-a', {
          id: 'other-reviewer', username: 'reviewer-2',
        }, 'REJECTED'),
        (error: unknown) => error instanceof HrRequestError && error.statusCode === 409,
      );
      assert.equal(event.data.statusTo, 'APPROVED');
    });
  });

  it('limits interviews to a single transition from scheduled to completed or cancelled', async () => {
    let status = 'SCHEDULED';
    let writes = 0;
    await withMethods([
      [prisma, '$transaction', async (operation: (tx: typeof prisma) => unknown) => operation(prisma)],
      [prisma.candidateInterview, 'findFirst', async (args) => {
        assert.deepEqual(args.where, { id: 'interview-1', application: { position: { entityId: 'entity-a' } } });
        return { id: 'interview-1', status };
      }],
      [prisma.candidateInterview, 'updateMany', async (args) => {
        assert.deepEqual(args.where, {
          id: 'interview-1', status: 'SCHEDULED', application: { position: { entityId: 'entity-a' } },
        });
        status = args.data.status;
        return { count: 1 };
      }],
      [prisma.candidateInterviewEvent, 'create', async () => { writes += 1; }],
    ], async () => {
      await HrWorkflowService.changeCandidateInterviewStatus('interview-1', 'entity-a', {
        id: 'reviewer', username: 'reviewer',
      }, 'CANCELLED');
      assert.equal(status, 'CANCELLED');
      assert.equal(writes, 1);
      await assert.rejects(
        HrWorkflowService.changeCandidateInterviewStatus('interview-1', 'entity-a', {
          id: 'reviewer', username: 'reviewer',
        }, 'COMPLETED'),
        (error: unknown) => error instanceof HrRequestError && error.statusCode === 409,
      );
      assert.equal(writes, 1);
    });
  });
});
