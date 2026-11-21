import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import express from 'express';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import { getModuleRoles } from '../../auth';
import hrRouter from './api';
import HrService from './service';
import {
  validateHrDocumentFile,
  writePrivateHrDocument,
} from './employee-document-storage';
import HrWorkflowService from './workflow-service';

function replaceMethod(target: object, key: string, value: (...args: any[]) => any) {
  const original = Object.getOwnPropertyDescriptor(target, key);
  Object.defineProperty(target, key, { configurable: true, value });
  return () => {
    if (original) Object.defineProperty(target, key, original);
    else Reflect.deleteProperty(target, key);
  };
}

describe('HR workflow API', () => {
  it('scopes upload and download to the authenticated entity and never exposes storage paths', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'safe-hr-api-'));
    const previousDirectory = process.env.SAFE_ERP_PRIVATE_STORAGE_DIR;
    process.env.SAFE_ERP_PRIVATE_STORAGE_DIR = directory;
    const content = Buffer.from('%PDF-1.7\nprivate test document');
    const metadata = validateHrDocumentFile(content, 'application/pdf');
    const storageKey = await writePrivateHrDocument(content);
    let uploadArgs: unknown[] = [];
    let downloadArgs: unknown[] = [];
    const restores = [
      replaceMethod(HrWorkflowService, 'uploadEmployeeDocumentFile', async (...args) => {
        uploadArgs = args;
        return { id: 'document-1', file: { id: 'file-1', mimeType: 'application/pdf' } };
      }),
      replaceMethod(HrWorkflowService, 'getEmployeeDocumentFile', async (...args) => {
        downloadArgs = args;
        return { storageKey, mimeType: 'application/pdf', sizeBytes: metadata.sizeBytes, sha256: metadata.sha256 };
      }),
    ];
    const app = express();
    app.use(express.json());
    app.use((_req, res, next) => {
      res.locals.authenticatedUser = {
        id: 'user-hr', username: 'hr-manager', role: 'HR_MANAGER', entityId: 'entity-a',
      };
      next();
    });
    app.use(hrRouter);
    const server = createServer(app);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    try {
      const address = server.address();
      assert.ok(address && typeof address !== 'string');
      const base = `http://127.0.0.1:${address.port}`;
      const upload = await fetch(`${base}/documents/document-1/file`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/octet-stream',
          'X-HR-Document-Mime-Type': 'application/pdf',
        },
        body: new Uint8Array(content),
      });
      assert.equal(upload.status, 201);
      assert.deepEqual(uploadArgs, [
        'document-1', 'entity-a', { id: 'user-hr', username: 'hr-manager' }, content, 'application/pdf',
      ]);
      const response = await fetch(`${base}/documents/document-1/file`);
      assert.equal(response.status, 200);
      assert.equal(response.headers.get('content-type'), 'application/pdf');
      assert.equal(response.headers.get('cache-control'), 'private, no-store');
      assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
      assert.match(response.headers.get('content-disposition') ?? '', /document-rh\.pdf/);
      assert.deepEqual(Buffer.from(await response.arrayBuffer()), content);
      assert.deepEqual(downloadArgs, ['document-1', 'entity-a']);
      assert.equal((response.headers.get('content-disposition') ?? '').includes(storageKey), false);
    } finally {
      restores.reverse().forEach((restore) => restore());
      await new Promise<void>((resolve, reject) => {
        server.close((error) => error ? reject(error) : resolve());
      });
      if (previousDirectory === undefined) delete process.env.SAFE_ERP_PRIVATE_STORAGE_DIR;
      else process.env.SAFE_ERP_PRIVATE_STORAGE_DIR = previousDirectory;
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('uses the authenticated entity and actor for all cohort routes', async () => {
    assert.deepEqual(getModuleRoles('hr'), ['ADMIN', 'HR_MANAGER']);
    const calls: Array<{ method: string; args: unknown[] }> = [];
    const methods: Array<[string, (...args: any[]) => any]> = [
      ['listEmployeeDocuments', async (...args) => { calls.push({ method: 'documents', args }); return []; }],
      ['createEmployeeDocument', async (...args) => { calls.push({ method: 'createDocument', args }); return { id: 'doc-1' }; }],
      ['updateEmployeeDocument', async (...args) => { calls.push({ method: 'updateDocument', args }); return { id: 'doc-1' }; }],
      ['listRecruitmentPositions', async (...args) => { calls.push({ method: 'positions', args }); return []; }],
      ['createExpenseClaim', async (...args) => { calls.push({ method: 'claim', args }); return { id: 'claim-1' }; }],
    ];
    const restores = methods.map(([key, value]) => replaceMethod(HrWorkflowService, key, value));
    const restorePayrollRegister = replaceMethod(HrService, 'getPayrollRegister', async (...args) => {
      calls.push({ method: 'payrollRegister', args });
      return { status: 'PREPARATION_ONLY' };
    });
    const restoreTerminationDate = replaceMethod(HrService, 'updateEmployeeTermination', async (...args) => {
      calls.push({ method: 'terminationDate', args });
      return { id: 'employee-1', terminatedAt: '2026-10-31T00:00:00.000Z', eventRecorded: true };
    });
    const app = express();
    app.use(express.json());
    app.use((_req, res, next) => {
      res.locals.authenticatedUser = {
        id: 'user-hr', username: 'hr-manager', role: 'HR_MANAGER', entityId: 'entity-a',
      };
      next();
    });
    app.use(hrRouter);
    const server = createServer(app);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    try {
      const address = server.address();
      assert.ok(address && typeof address !== 'string');
      const base = `http://127.0.0.1:${address.port}`;
      assert.equal((await fetch(`${base}/documents`)).status, 200);
      assert.equal((await fetch(`${base}/recruitment/positions`)).status, 200);
      assert.equal((await fetch(`${base}/payroll-register?period=2026-10`)).status, 200);
      assert.equal((await fetch(`${base}/employees/employee-1/termination`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ terminatedAt: '2026-10-31', note: 'Fin du contrat' }),
      })).status, 200);
      assert.equal((await fetch(`${base}/documents`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ employeeId: 'employee-1', entityId: 'untrusted-entity' }),
      })).status, 201);
      assert.equal((await fetch(`${base}/documents/doc-1`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'Document corrigé', reason: 'Correction de référence' }),
      })).status, 200);
      assert.equal((await fetch(`${base}/expense-claims`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ employeeId: 'employee-1', entityId: 'untrusted-entity' }),
      })).status, 201);
      assert.deepEqual(calls, [
        { method: 'documents', args: ['entity-a'] },
        { method: 'positions', args: ['entity-a'] },
        { method: 'payrollRegister', args: ['entity-a', '2026-10'] },
        {
          method: 'terminationDate',
          args: [
            'employee-1',
            'entity-a',
            { terminatedAt: '2026-10-31', note: 'Fin du contrat' },
            { id: 'user-hr', username: 'hr-manager' },
          ],
        },
        {
          method: 'createDocument',
          args: [
            { employeeId: 'employee-1', entityId: 'untrusted-entity' },
            'entity-a',
            { id: 'user-hr', username: 'hr-manager' },
          ],
        },
        {
          method: 'updateDocument',
          args: [
            'doc-1',
            { title: 'Document corrigé', reason: 'Correction de référence' },
            'entity-a',
            { id: 'user-hr', username: 'hr-manager' },
          ],
        },
        {
          method: 'claim',
          args: [
            { employeeId: 'employee-1', entityId: 'untrusted-entity' },
            'entity-a',
            { id: 'user-hr', username: 'hr-manager' },
          ],
        },
      ]);
    } finally {
      restores.reverse().forEach((restore) => restore());
      restorePayrollRegister();
      restoreTerminationDate();
      await new Promise<void>((resolve, reject) => {
        server.close((error) => error ? reject(error) : resolve());
      });
    }
  });
});
