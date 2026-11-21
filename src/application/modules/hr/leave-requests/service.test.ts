import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import prisma from '../../../../data/prisma/client';
import { HrRequestError } from '../errors';
import HrLeaveRequestService from './service';

function replaceMethod(target: object, key: string, value: (...args: unknown[]) => unknown) {
  const original = Object.getOwnPropertyDescriptor(target, key);
  Object.defineProperty(target, key, { configurable: true, value });
  return () => {
    if (original) Object.defineProperty(target, key, original);
    else Reflect.deleteProperty(target, key);
  };
}

describe('HR leave request service', () => {
  it('creates only for an employee in the scoped entity and rejects overlapping active requests', async () => {
    const restores: Array<() => void> = [];
    const captured: unknown[] = [];
    restores.push(replaceMethod(prisma, '$transaction', async (...args) => {
      const callback = args[0] as (transaction: typeof prisma) => Promise<unknown>;
      return callback(prisma);
    }));
    restores.push(replaceMethod(prisma.employee, 'findFirst', async (...args) => {
      captured.push(args[0]);
      return { id: 'employee-1' };
    }));
    restores.push(replaceMethod(prisma.hrLeaveRequest, 'findFirst', async (...args) => {
      captured.push(args[0]);
      return null;
    }));
    restores.push(replaceMethod(prisma.hrLeaveEntitlement, 'findMany', async (...args) => {
      captured.push(args[0]);
      return [{ year: 2026, entitlementDays: 24 }];
    }));
    restores.push(replaceMethod(prisma.hrLeaveRequest, 'findMany', async (...args) => {
      captured.push(args[0]);
      return [];
    }));
    restores.push(replaceMethod(prisma.hrLeaveRequest, 'create', async (...args) => {
      captured.push(args[0]);
      return { id: 'leave-1', status: 'PENDING' };
    }));

    try {
      const created = await HrLeaveRequestService.create({
        employeeId: 'employee-1',
        leaveType: 'ANNUAL',
        startAt: '2026-11-09',
        endAt: '2026-11-11',
        reason: 'Congé',
        entityId: 'untrusted-entity',
        status: 'APPROVED',
        requestedByUserId: 'attacker',
      }, 'entity-a', 'user-1');
      assert.deepEqual(created, { id: 'leave-1', status: 'PENDING' });
      assert.deepEqual(captured[0], { where: { id: 'employee-1', entityId: 'entity-a' }, select: { id: true } });
      assert.deepEqual(captured[1], {
        where: {
          entityId: 'entity-a',
          employeeId: 'employee-1',
          status: { in: ['PENDING', 'APPROVED'] },
          startAt: { lte: new Date('2026-11-11T00:00:00.000Z') },
          endAt: { gte: new Date('2026-11-09T00:00:00.000Z') },
        },
        select: { id: true },
      });
      assert.deepEqual(captured[2], {
        where: { entityId: 'entity-a', employeeId: 'employee-1', leaveType: 'ANNUAL', year: { in: [2026] } },
        select: { year: true, entitlementDays: true },
      });
      assert.deepEqual(captured[3], {
        where: {
          entityId: 'entity-a',
          employeeId: 'employee-1',
          leaveType: 'ANNUAL',
          status: { in: ['PENDING', 'APPROVED'] },
          startAt: { lte: new Date('2026-12-31T23:59:59.999Z') },
          endAt: { gte: new Date('2026-01-01T00:00:00.000Z') },
        },
        select: { startAt: true, endAt: true },
      });
      assert.deepEqual(captured[4], {
        data: {
          employeeId: 'employee-1',
          leaveType: 'ANNUAL',
          startAt: new Date('2026-11-09T00:00:00.000Z'),
          endAt: new Date('2026-11-11T00:00:00.000Z'),
          reason: 'Congé',
          entityId: 'entity-a',
          requestedByUserId: 'user-1',
          status: 'PENDING',
        },
        include: {
          employee: { select: { id: true, empId: true, firstName: true, lastName: true, position: true } },
          requestedBy: { select: { id: true, username: true } },
          reviewedBy: { select: { id: true, username: true } },
        },
      });
    } finally {
      for (const restore of restores.reverse()) restore();
    }

    const duplicateRestores: Array<() => void> = [];
    duplicateRestores.push(replaceMethod(prisma, '$transaction', async (...args) => {
      const callback = args[0] as (transaction: typeof prisma) => Promise<unknown>;
      return callback(prisma);
    }));
    duplicateRestores.push(replaceMethod(prisma.employee, 'findFirst', async () => ({ id: 'employee-1' })));
    duplicateRestores.push(replaceMethod(prisma.hrLeaveRequest, 'findFirst', async () => ({ id: 'overlap' })));
    duplicateRestores.push(replaceMethod(prisma.hrLeaveRequest, 'create', async (..._args) => {
      assert.fail('Overlapping requests must not be persisted.');
    }));
    try {
      await assert.rejects(
        HrLeaveRequestService.create({
          employeeId: 'employee-1',
          leaveType: 'SICK',
          startAt: '2026-11-09',
          endAt: '2026-11-09',
          reason: 'Arrêt',
        }, 'entity-a', 'user-1'),
        (error: unknown) => error instanceof HrRequestError && error.statusCode === 409,
      );
    } finally {
      for (const restore of duplicateRestores.reverse()) restore();
    }
  });

  it('reserves annual leave against the full balance in every calendar year crossed', async () => {
    const restores: Array<() => void> = [];
    let entitlement2026 = 3;
    let omit2027 = false;
    let creates = 0;
    restores.push(replaceMethod(prisma, '$transaction', async (...args) => {
      const callback = args[0] as (transaction: typeof prisma) => Promise<unknown>;
      return callback(prisma);
    }));
    restores.push(replaceMethod(prisma.employee, 'findFirst', async () => ({ id: 'employee-1' })));
    restores.push(replaceMethod(prisma.hrLeaveRequest, 'findFirst', async () => null));
    restores.push(replaceMethod(prisma.hrLeaveEntitlement, 'findMany', async () => [
      { year: 2026, entitlementDays: entitlement2026 },
      ...(!omit2027 ? [{ year: 2027, entitlementDays: 2 }] : []),
    ]));
    restores.push(replaceMethod(prisma.hrLeaveRequest, 'findMany', async (query) => {
      assert.deepEqual((query as { where: { startAt: unknown; endAt: unknown } }).where, {
        entityId: 'entity-a',
        employeeId: 'employee-1',
        leaveType: 'ANNUAL',
        status: { in: ['PENDING', 'APPROVED'] },
        startAt: { lte: new Date('2027-12-31T23:59:59.999Z') },
        endAt: { gte: new Date('2026-01-01T00:00:00.000Z') },
      });
      return [{
        startAt: new Date('2026-03-01T00:00:00.000Z'),
        endAt: new Date('2026-03-02T00:00:00.000Z'),
      }];
    }));
    restores.push(replaceMethod(prisma.hrLeaveRequest, 'create', async () => {
      creates += 1;
      return { id: 'leave-cross-year' };
    }));

    const request = {
      employeeId: 'employee-1',
      leaveType: 'ANNUAL',
      startAt: '2026-12-31',
      endAt: '2027-01-02',
      reason: 'Congé traversant deux années',
    };
    try {
      assert.deepEqual(await HrLeaveRequestService.create(request, 'entity-a', 'user-1'), { id: 'leave-cross-year' });
      entitlement2026 = 2;
      await assert.rejects(
        HrLeaveRequestService.create(request, 'entity-a', 'user-1'),
        (error: unknown) => error instanceof HrRequestError && error.statusCode === 409,
      );
      entitlement2026 = 3;
      omit2027 = true;
      await assert.rejects(
        HrLeaveRequestService.create(request, 'entity-a', 'user-1'),
        /Aucun droit annuel n’est configuré pour 2027/,
      );
      assert.equal(creates, 1);
    } finally {
      for (const restore of restores.reverse()) restore();
    }
  });

  it('audits a configured annual entitlement and refuses to reduce it below active requests', async () => {
    const restores: Array<() => void> = [];
    const captured: Record<string, unknown> = {};
    restores.push(replaceMethod(prisma, '$transaction', async (...args) => {
      const callback = args[0] as (transaction: typeof prisma) => Promise<unknown>;
      return callback(prisma);
    }));
    restores.push(replaceMethod(prisma.employee, 'findFirst', async () => ({ id: 'employee-1' })));
    restores.push(replaceMethod(prisma.hrLeaveEntitlement, 'findUnique', async (query) => {
      captured.lookup = query;
      return { id: 'entitlement-1', entitlementDays: 20 };
    }));
    restores.push(replaceMethod(prisma.hrLeaveRequest, 'findMany', async () => [{
      startAt: new Date('2026-04-01T00:00:00.000Z'),
      endAt: new Date('2026-04-03T00:00:00.000Z'),
    }]));
    restores.push(replaceMethod(prisma.hrLeaveEntitlement, 'upsert', async (query) => {
      captured.upsert = query;
      return { id: 'entitlement-1', entitlementDays: 20 };
    }));
    restores.push(replaceMethod(prisma.hrLeaveEntitlementEvent, 'create', async (query) => {
      captured.event = query;
      return { id: 'event-1' };
    }));

    try {
      const saved = await HrLeaveRequestService.setEntitlement({
        employeeId: 'employee-1',
        year: 2026,
        entitlementDays: 20,
        policySource: 'Politique RH v2',
        effectiveFrom: '2026-02-01',
        reason: 'Solde confirmé par la politique RH',
      }, 'entity-a', { id: 'hr-user', username: 'hr-manager' });
      assert.deepEqual(saved, { id: 'entitlement-1', entitlementDays: 20 });
      assert.deepEqual(captured.event, {
        data: {
          entitlementId: 'entitlement-1',
          previousEntitlementDays: 20,
          nextEntitlementDays: 20,
          policySource: 'Politique RH v2',
          effectiveFrom: new Date('2026-02-01T00:00:00.000Z'),
          reason: 'Solde confirmé par la politique RH',
          actorUserId: 'hr-user',
          actorUsername: 'hr-manager',
        },
      });
      await assert.rejects(HrLeaveRequestService.setEntitlement({
        employeeId: 'employee-1',
        year: 2026,
        entitlementDays: 2,
        policySource: 'Politique RH v2',
        effectiveFrom: '2026-02-01',
        reason: 'Réduction de solde',
      }, 'entity-a', { id: 'hr-user', username: 'hr-manager' }), /inférieur aux 3 jour/);
    } finally {
      for (const restore of restores.reverse()) restore();
    }
  });

  it('requires an independent reviewer and conditionally updates only pending requests', async () => {
    const restores: Array<() => void> = [];
    let updateWhere: unknown;
    let lookup = { id: 'leave-1', status: 'PENDING', requestedByUserId: 'requester' };
    let updateCount = 1;
    restores.push(replaceMethod(prisma.hrLeaveRequest, 'findFirst', async () => {
      if (updateWhere) return { id: 'leave-1', status: 'APPROVED' };
      return lookup;
    }));
    restores.push(replaceMethod(prisma.hrLeaveRequest, 'updateMany', async (...args) => {
      updateWhere = args[0];
      return { count: updateCount };
    }));
    try {
      await assert.rejects(
        HrLeaveRequestService.review('leave-1', 'entity-a', 'requester', 'APPROVED', null),
        (error: unknown) => error instanceof HrRequestError && error.statusCode === 409,
      );
      assert.equal(updateWhere, undefined);
      lookup = { id: 'leave-1', status: 'PENDING', requestedByUserId: 'requester' };
      const approved = await HrLeaveRequestService.review('leave-1', 'entity-a', 'reviewer', 'APPROVED', 'OK');
      assert.deepEqual(approved, { id: 'leave-1', status: 'APPROVED' });
      assert.deepEqual(updateWhere, {
        where: {
          id: 'leave-1',
          entityId: 'entity-a',
          status: 'PENDING',
          requestedByUserId: { not: 'reviewer' },
        },
        data: {
          status: 'APPROVED',
          reviewedByUserId: 'reviewer',
          reviewNote: 'OK',
          reviewedAt: (updateWhere as { data: { reviewedAt: Date } }).data.reviewedAt,
        },
      });
      assert.ok((updateWhere as { data: { reviewedAt: Date } }).data.reviewedAt instanceof Date);
      updateWhere = undefined;
      updateCount = 0;
      await assert.rejects(
        HrLeaveRequestService.review('leave-1', 'entity-a', 'reviewer', 'APPROVED', null),
        (error: unknown) => error instanceof HrRequestError && error.statusCode === 409,
      );
    } finally {
      for (const restore of restores.reverse()) restore();
    }
  });
});
