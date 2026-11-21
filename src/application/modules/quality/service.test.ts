import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import prisma from '../../../core/models/prisma';
import { QualityRequestError } from './errors';
import QualityService from './service';

const originalDescriptors = new Map<string, PropertyDescriptor | undefined>();

function installMock(name: string, value: unknown) {
  if (!originalDescriptors.has(name)) originalDescriptors.set(name, Object.getOwnPropertyDescriptor(prisma, name));
  Object.defineProperty(prisma, name, { configurable: true, value });
}

function restoreMocks() {
  for (const [name, descriptor] of originalDescriptors) {
    if (descriptor) Object.defineProperty(prisma, name, descriptor);
    else Reflect.deleteProperty(prisma, name);
  }
  originalDescriptors.clear();
}

afterEach(restoreMocks);

function finding(overrides: Record<string, unknown> = {}) {
  return {
    id: 'finding-1',
    entityId: 'entity-a',
    status: 'VERIFYING',
    detectedAt: new Date('2026-11-05T09:00:00.000Z'),
    dueAt: new Date('2026-11-12T09:00:00.000Z'),
    rootCause: 'Cause identifiée',
    closureNotes: 'Contrôle réussi',
    actions: [{
      id: 'action-1',
      status: 'COMPLETED',
      verificationNotes: 'Mesure confirmée.',
    }],
    ...overrides,
  };
}

describe('QualityService', () => {
  it('lists findings only for the requested entity', async () => {
    let query: unknown;
    installMock('qualityFinding', {
      findMany: async (input: unknown) => {
        query = input;
        return [];
      },
    });

    it('lists active equipment only from the requested entity', async () => {
      let query: unknown;
      installMock('equipment', {
        findMany: async (input: unknown) => {
          query = input;
          return [];
        },
      });

      assert.deepEqual(await QualityService.listEquipment('entity-a'), []);
      assert.deepEqual(query, {
        where: { entityId: 'entity-a', status: 'ACTIVE' },
        select: { id: true, assetTag: true, name: true, category: true, location: true, status: true },
        orderBy: [{ assetTag: 'asc' }],
      });
    });

    it('refuses cross-entity equipment references when creating a finding', async () => {
      let createCount = 0;
      let lookup: unknown;
      installMock('equipment', {
        findFirst: async (input: unknown) => {
          lookup = input;
          return null;
        },
      });
      installMock('qualityFinding', {
        create: async () => {
          createCount += 1;
          return {};
        },
      });

      await assert.rejects(() => QualityService.createFinding({
        title: 'Défaut équipement',
        description: 'Vibration constatée.',
        source: 'EQUIPMENT',
        severity: 'HIGH',
        equipmentId: 'equipment-b',
        detectedAt: '2026-11-05T09:00:00.000Z',
        owner: 'Responsable maintenance',
      }, 'entity-a'), (error: unknown) => error instanceof QualityRequestError && error.statusCode === 404);
      assert.deepEqual(lookup, {
        where: { id: 'equipment-b', entityId: 'entity-a', status: 'ACTIVE' },
        select: { id: true },
      });
      assert.equal(createCount, 0);
    });

    it('requires an active same-entity equipment for a new finding', async () => {
      let createCount = 0;
      let lookup: unknown;
      installMock('equipment', {
        findFirst: async (input: unknown) => {
          lookup = input;
          return null;
        },
      });
      installMock('qualityFinding', {
        create: async () => {
          createCount += 1;
          return {};
        },
      });

      await assert.rejects(() => QualityService.createFinding({
        title: 'Équipement hors service',
        description: 'Anomalie détectée sur un équipement non actif.',
        source: 'EQUIPMENT',
        severity: 'MEDIUM',
        equipmentId: 'equipment-inactive',
        detectedAt: '2026-11-05T09:00:00.000Z',
        owner: 'Responsable qualité',
      }, 'entity-a'), /Équipement actif introuvable/);
      assert.deepEqual(lookup, {
        where: { id: 'equipment-inactive', entityId: 'entity-a', status: 'ACTIVE' },
        select: { id: true },
      });
      assert.equal(createCount, 0);
    });

    assert.deepEqual(await QualityService.listFindings('entity-a'), []);
    assert.deepEqual(query, {
      where: { entityId: 'entity-a' },
      include: {
        actions: { orderBy: { createdAt: 'asc' } },
        equipment: { select: { id: true, assetTag: true, name: true, category: true, location: true } },
      },
      orderBy: [{ status: 'asc' }, { severity: 'desc' }, { createdAt: 'desc' }],
    });
  });

  it('requires complete investigation and verified CAPA before closing a finding', async () => {
    let updates = 0;
    const tx = {
      qualityFinding: {
        findFirst: async () => finding({
          rootCause: null,
          closureNotes: null,
          actions: [{ status: 'IN_PROGRESS', verificationNotes: null }],
        }),
        updateMany: async () => {
          updates += 1;
          return { count: 1 };
        },
      },
    };
    installMock('$transaction', async (callback: (transaction: typeof tx) => unknown) => callback(tx));

    await assert.rejects(
      () => QualityService.updateFinding('finding-1', { status: 'CLOSED' }, 'entity-a'),
      (error: unknown) => error instanceof QualityRequestError && error.statusCode === 409,
    );
    assert.equal(updates, 0);
  });

  it('rejects stale concurrent status updates instead of overwriting newer workflow state', async () => {
    let findingWrite: unknown;
    const findingTransaction = {
      qualityFinding: {
        findFirst: async () => finding(),
        updateMany: async (input: unknown) => {
          findingWrite = input;
          return { count: 0 };
        },
      },
    };
    installMock('$transaction', async (callback: (transaction: typeof findingTransaction) => unknown) => callback(findingTransaction));

    await assert.rejects(
      () => QualityService.updateFinding('finding-1', { status: 'CLOSED' }, 'entity-a'),
      (error: unknown) => error instanceof QualityRequestError && error.statusCode === 409,
    );
    assert.deepEqual(findingWrite, {
      where: { id: 'finding-1', entityId: 'entity-a', status: 'VERIFYING' },
      data: { status: 'CLOSED' },
    });

    let actionWrite: unknown;
    const actionTransaction = {
      qualityAction: {
        findFirst: async () => ({
          id: 'action-1',
          findingId: 'finding-1',
          status: 'IN_PROGRESS',
          verificationNotes: null,
          finding: { id: 'finding-1', status: 'ACTION_REQUIRED', detectedAt: new Date('2026-11-05T09:00:00.000Z') },
        }),
        updateMany: async (input: unknown) => {
          actionWrite = input;
          return { count: 0 };
        },
      },
    };
    installMock('$transaction', async (callback: (transaction: typeof actionTransaction) => unknown) => callback(actionTransaction));

    await assert.rejects(
      () => QualityService.updateAction('action-1', {
        status: 'COMPLETED',
        verificationNotes: 'Contrôle réussi.',
      }, 'entity-a'),
      (error: unknown) => error instanceof QualityRequestError && error.statusCode === 409,
    );
    assert.deepEqual(actionWrite, {
      where: { id: 'action-1', findingId: 'finding-1', status: 'IN_PROGRESS' },
      data: {
        status: 'COMPLETED',
        verificationNotes: 'Contrôle réussi.',
        completedAt: (actionWrite as { data: { completedAt: Date } }).data.completedAt,
      },
    });
    assert.ok((actionWrite as { data: { completedAt: Date } }).data.completedAt instanceof Date);
  });

  it('scopes action creation to the owning entity and checks its deadline', async () => {
    let applicationQuery: unknown;
    let created: unknown;
    const tx = {
      qualityFinding: {
        findFirst: async (input: unknown) => {
          applicationQuery = input;
          return finding({
            status: 'ACTION_REQUIRED',
            detectedAt: new Date('2026-11-05T09:00:00.000Z'),
          });
        },
      },
      qualityAction: {
        create: async (input: unknown) => {
          created = input;
          return { id: 'action-2' };
        },
      },
    };
    installMock('$transaction', async (callback: (transaction: typeof tx) => unknown) => callback(tx));

    const action = await QualityService.createAction('finding-1', {
      type: 'CORRECTIVE',
      description: 'Corriger le réglage.',
      owner: 'Chef de production',
      dueAt: '2026-11-12T09:00:00.000Z',
    }, 'entity-a');

    assert.deepEqual(action, { id: 'action-2' });
    assert.deepEqual(applicationQuery, {
      where: { id: 'finding-1', entityId: 'entity-a' },
      select: { id: true, status: true, detectedAt: true },
    });
    assert.deepEqual(created, {
      data: {
        type: 'CORRECTIVE',
        description: 'Corriger le réglage.',
        owner: 'Chef de production',
        dueAt: new Date('2026-11-12T09:00:00.000Z'),
        findingId: 'finding-1',
      },
      include: { finding: true },
    });
  });

  it('prevents deadlines before detection and writes evidence when an action is completed', async () => {
    let actionUpdates = 0;
    let updateData: unknown;
    const tx = {
      qualityFinding: {
        findFirst: async () => finding({
          detectedAt: new Date('2026-11-05T09:00:00.000Z'),
        }),
      },
      qualityAction: {
        findFirst: async () => ({
          id: 'action-1',
          findingId: 'finding-1',
          status: 'IN_PROGRESS',
          verificationNotes: null,
          finding: { status: 'ACTION_REQUIRED' },
        }),
        create: async () => {
          actionUpdates += 1;
          return {};
        },
        updateMany: async (input: { data: unknown }) => {
          actionUpdates += 1;
          updateData = input.data;
          return { count: 1 };
        },
      },
    };
    installMock('$transaction', async (callback: (transaction: typeof tx) => unknown) => callback(tx));

    await assert.rejects(() => QualityService.createAction('finding-1', {
      type: 'PREVENTIVE',
      description: 'Action préventive.',
      owner: 'Responsable',
      dueAt: '2026-11-04T09:00:00.000Z',
    }, 'entity-a'), QualityRequestError);

    await QualityService.updateAction('action-1', {
      status: 'COMPLETED',
      verificationNotes: 'Trois contrôles conformes.',
    }, 'entity-a');
    assert.equal(actionUpdates, 1);
    assert.deepEqual(updateData, {
      status: 'COMPLETED',
      verificationNotes: 'Trois contrôles conformes.',
      completedAt: updateData && (updateData as { completedAt: Date }).completedAt,
    });
    assert.ok((updateData as { completedAt: Date }).completedAt instanceof Date);
  });

  it('blocks new CAPA actions during verification and edits to completed actions', async () => {
    let actionWrites = 0;
    const verifyingTransaction = {
      qualityFinding: {
        findFirst: async () => finding({ status: 'VERIFYING' }),
      },
      qualityAction: {
        create: async () => {
          actionWrites += 1;
          return {};
        },
      },
    };
    installMock('$transaction', async (callback: (transaction: typeof verifyingTransaction) => unknown) => callback(verifyingTransaction));

    await assert.rejects(() => QualityService.createAction('finding-1', {
      type: 'CORRECTIVE',
      description: 'Corriger le défaut.',
      owner: 'Technicien',
      dueAt: '2026-11-12T09:00:00.000Z',
    }, 'entity-a'), /Repassez le dossier en « Actions requises »/);

    const completedActionTransaction = {
      qualityAction: {
        findFirst: async () => ({
          id: 'action-1',
          status: 'COMPLETED',
          verificationNotes: 'Contrôle réussi.',
          finding: { status: 'VERIFYING', detectedAt: new Date('2026-11-05T09:00:00.000Z') },
        }),
        updateMany: async () => {
          actionWrites += 1;
          return { count: 1 };
        },
      },
    };
    installMock('$transaction', async (callback: (transaction: typeof completedActionTransaction) => unknown) => callback(completedActionTransaction));

    await assert.rejects(() => QualityService.updateAction('action-1', {
      dueAt: '2026-11-15T09:00:00.000Z',
    }, 'entity-a'), /terminée ou annulée et ne peut plus être modifiée/);
    assert.equal(actionWrites, 0);
  });

  it('rejects reassignment to inactive equipment without writing the finding', async () => {
    let equipmentQuery: unknown;
    let writes = 0;
    const tx = {
      qualityFinding: {
        findFirst: async () => finding({
          status: 'INVESTIGATING',
          source: 'EQUIPMENT',
          equipmentId: 'equipment-current',
        }),
        updateMany: async () => {
          writes += 1;
          return { count: 1 };
        },
      },
      equipment: {
        findFirst: async (input: unknown) => {
          equipmentQuery = input;
          return { id: 'equipment-inactive', status: 'OUT_OF_SERVICE' };
        },
      },
    };
    installMock('$transaction', async (callback: (transaction: typeof tx) => unknown) => callback(tx));

    await assert.rejects(() => QualityService.updateFinding('finding-1', {
      equipmentId: 'equipment-inactive',
    }, 'entity-a'), (error: unknown) => error instanceof QualityRequestError && error.statusCode === 409);

    assert.deepEqual(equipmentQuery, {
      where: { id: 'equipment-inactive', entityId: 'entity-a' },
      select: { id: true, status: true },
    });
    assert.equal(writes, 0);
  });

  it('clears equipment association when a finding changes to a non-equipment source', async () => {
    let updateData: unknown;
    const tx = {
      qualityFinding: {
        findFirst: async () => finding({
          status: 'INVESTIGATING',
          source: 'EQUIPMENT',
          equipmentId: 'equipment-current',
        }),
        updateMany: async (input: { data: unknown }) => {
          updateData = input.data;
          return { count: 1 };
        },
      },
    };
    installMock('$transaction', async (callback: (transaction: typeof tx) => unknown) => callback(tx));

    await QualityService.updateFinding('finding-1', { source: 'PRODUCTION' }, 'entity-a');

    assert.deepEqual(updateData, { source: 'PRODUCTION', equipmentId: null });
  });
});
