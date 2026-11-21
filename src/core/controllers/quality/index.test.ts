import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import express from 'express';
import { describe, it } from 'node:test';
import { QualityRequestError } from '../../../application/modules/quality/errors';
import QualityService from '../../../application/modules/quality/service';
import qualityRouter from './index';

describe('quality API', () => {
  it('scopes register, finding, and action writes to the authenticated entity', async () => {
    const app = express();
    app.use(express.json());
    app.use((_req, res, next) => {
      res.locals.authenticatedUser = {
        id: 'user-1',
        username: 'quality-manager',
        role: 'HR_MANAGER',
        entityId: 'entity-a',
      };
      next();
    });
    app.use(qualityRouter);
    const server = createServer(app);
    const methods = ['listEquipment', 'listFindings', 'createFinding', 'updateFinding', 'createAction', 'updateAction'] as const;
    const originals = new Map(methods.map((method) => [method, Object.getOwnPropertyDescriptor(QualityService, method)]));
    const calls: Array<{ method: string; args: unknown[] }> = [];
    for (const method of methods) {
      Object.defineProperty(QualityService, method, {
        configurable: true,
        value: async (...args: unknown[]) => {
          calls.push({ method, args });
          return method === 'listFindings' || method === 'listEquipment' ? [] : { id: `${method}-1`, actions: [] };
        },
      });
    }

    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    try {
      const address = server.address();
      assert.ok(address && typeof address !== 'string');

      const list = await fetch(`http://127.0.0.1:${address.port}/findings`);
      assert.equal(list.status, 200);
      assert.deepEqual(await list.json(), []);
      const equipment = await fetch(`http://127.0.0.1:${address.port}/equipment`);
      assert.equal(equipment.status, 200);
      assert.deepEqual(await equipment.json(), []);

      const created = await fetch(`http://127.0.0.1:${address.port}/findings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'Rejet lot', description: 'Mesure hors tolérance.' }),
      });
      assert.equal(created.status, 201);

      const action = await fetch(`http://127.0.0.1:${address.port}/findings/finding-1/actions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description: 'Ajuster le contrôle' }),
      });
      assert.equal(action.status, 201);

      const update = await fetch(`http://127.0.0.1:${address.port}/actions/action-1`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'COMPLETED' }),
      });
      assert.equal(update.status, 200);
      assert.deepEqual(calls.map(({ method, args }) => ({ method, entityId: args.at(-1) })), [
        { method: 'listFindings', entityId: 'entity-a' },
        { method: 'listEquipment', entityId: 'entity-a' },
        { method: 'createFinding', entityId: 'entity-a' },
        { method: 'createAction', entityId: 'entity-a' },
        { method: 'updateAction', entityId: 'entity-a' },
      ]);
    } finally {
      for (const method of methods) {
        const descriptor = originals.get(method);
        if (descriptor) Object.defineProperty(QualityService, method, descriptor);
        else Reflect.deleteProperty(QualityService, method);
      }
      await new Promise<void>((resolve, reject) => {
        server.close((error) => error ? reject(error) : resolve());
      });
    }
  });

  it('rejects requests without an entity scope before accessing the service', async () => {
    const app = express();
    app.use((_req, res, next) => {
      res.locals.authenticatedUser = {
        id: 'user-2',
        username: 'unscoped',
        role: 'HR_MANAGER',
        entityId: null,
      };
      next();
    });
    app.use(qualityRouter);
    const server = createServer(app);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    try {
      const address = server.address();
      assert.ok(address && typeof address !== 'string');
      const response = await fetch(`http://127.0.0.1:${address.port}/findings`);
      assert.equal(response.status, 403);
      assert.deepEqual(await response.json(), { error: 'Aucune société n’est associée à votre compte.' });
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => error ? reject(error) : resolve());
      });
    }
  });

  it('maps validation and workflow errors to their HTTP contract', async () => {
    const app = express();
    app.use(express.json());
    app.use((_req, res, next) => {
      res.locals.authenticatedUser = {
        id: 'user-3',
        username: 'quality-manager',
        role: 'HR_MANAGER',
        entityId: 'entity-a',
      };
      next();
    });
    app.use(qualityRouter);
    const server = createServer(app);
    const methods = ['createFinding', 'updateFinding', 'createAction', 'updateAction'] as const;
    const originals = new Map(methods.map((method) => [method, Object.getOwnPropertyDescriptor(QualityService, method)]));
    const calls: string[] = [];
    for (const method of methods) {
      Object.defineProperty(QualityService, method, {
        configurable: true,
        value: async () => {
          calls.push(method);
          const errors: Record<typeof method, QualityRequestError> = {
            createFinding: new QualityRequestError('Le titre est obligatoire.', 400),
            updateFinding: new QualityRequestError('Transition de statut non autorisée.', 409),
            createAction: new QualityRequestError('Non-conformité introuvable pour cette société.', 404),
            updateAction: new QualityRequestError('Renseignez les preuves de vérification.', 400),
          };
          throw errors[method];
        },
      });
    }

    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    try {
      const address = server.address();
      assert.ok(address && typeof address !== 'string');
      const base = `http://127.0.0.1:${address.port}`;
      const requests = [
        { path: '/findings', method: 'POST', status: 400, error: 'Le titre est obligatoire.' },
        { path: '/findings/finding-1', method: 'PATCH', status: 409, error: 'Transition de statut non autorisée.' },
        { path: '/findings/missing/actions', method: 'POST', status: 404, error: 'Non-conformité introuvable pour cette société.' },
        { path: '/actions/action-1', method: 'PATCH', status: 400, error: 'Renseignez les preuves de vérification.' },
      ] as const;

      for (const request of requests) {
        const response = await fetch(`${base}${request.path}`, {
          method: request.method,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'INVALID' }),
        });
        assert.equal(response.status, request.status, request.path);
        assert.deepEqual(await response.json(), { error: request.error }, request.path);
      }
      assert.deepEqual(calls, ['createFinding', 'updateFinding', 'createAction', 'updateAction']);
    } finally {
      for (const method of methods) {
        const descriptor = originals.get(method);
        if (descriptor) Object.defineProperty(QualityService, method, descriptor);
        else Reflect.deleteProperty(QualityService, method);
      }
      await new Promise<void>((resolve, reject) => {
        server.close((error) => error ? reject(error) : resolve());
      });
    }
  });
});
