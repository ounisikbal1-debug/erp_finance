import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { HrRequestError } from '../errors';
import {
  calendarDaysInYearRange,
  validateHrLeaveDecision,
  validateHrLeaveEntitlement,
  validateHrLeaveRequest,
} from './validation';

describe('HR leave request validation', () => {
  it('normalizes valid requests and ignores untrusted entity and workflow fields', () => {
    assert.deepEqual(validateHrLeaveRequest({
      employeeId: ' employee-1 ',
      leaveType: 'ANNUAL',
      startAt: '2026-11-09',
      endAt: '2026-11-11',
      reason: '  Congé annuel  ',
      entityId: 'other-entity',
      status: 'APPROVED',
      requestedByUserId: 'attacker',
    }), {
      employeeId: 'employee-1',
      leaveType: 'ANNUAL',
      startAt: new Date('2026-11-09T00:00:00.000Z'),
      endAt: new Date('2026-11-11T00:00:00.000Z'),
      reason: 'Congé annuel',
    });

    describe('HR leave entitlement validation', () => {
      it('accepts organization-configured calendar-day entitlements and validates the year', () => {
        assert.deepEqual(validateHrLeaveEntitlement({
          employeeId: ' employee-1 ',
          year: 2026,
          entitlementDays: 24,
          policySource: ' Politique RH v2 ',
          effectiveFrom: '2026-01-01',
          reason: 'Solde validé par la politique RH interne',
        }), {
          employeeId: 'employee-1',
          year: 2026,
          entitlementDays: 24,
          policySource: 'Politique RH v2',
          effectiveFrom: new Date('2026-01-01T00:00:00.000Z'),
          reason: 'Solde validé par la politique RH interne',
        });
        assert.equal(calendarDaysInYearRange(new Date('2026-12-30T00:00:00.000Z'), new Date('2027-01-02T00:00:00.000Z'), 2026), 2);
        assert.equal(calendarDaysInYearRange(new Date('2027-01-01T00:00:00.000Z'), new Date('2027-01-02T00:00:00.000Z'), 2026), 0);
        assert.throws(() => validateHrLeaveEntitlement({ employeeId: 'employee-1', year: 2026.5, entitlementDays: 20, reason: 'Policy' }));
        assert.throws(() => validateHrLeaveEntitlement({ employeeId: 'employee-1', year: 2026, entitlementDays: 367, reason: 'Policy' }));
        assert.throws(() => validateHrLeaveEntitlement({ employeeId: 'employee-1', year: 2026, entitlementDays: 20, reason: '' }));
        const valid = { employeeId: 'employee-1', year: 2026, entitlementDays: 20, policySource: 'Policy', effectiveFrom: '2026-01-01', reason: 'RH' };
        assert.throws(() => validateHrLeaveEntitlement({ ...valid, policySource: ' ' }), /source ou référence/);
        assert.throws(() => validateHrLeaveEntitlement({ ...valid, effectiveFrom: '2025-12-31' }), /appartenir à l’année/);
        assert.throws(() => validateHrLeaveEntitlement({ ...valid, effectiveFrom: '2026-02-30' }), /date d’effet n’est pas une date valide/);
      });
    });
  });

  it('rejects invalid calendar dates, ranges, types, and blank or oversized reasons', () => {
    const base = { employeeId: 'employee-1', leaveType: 'SICK', startAt: '2026-02-28', endAt: '2026-03-01', reason: 'Arrêt' };
    assert.throws(() => validateHrLeaveRequest({ ...base, startAt: '2026-02-29' }), HrRequestError);
    assert.throws(() => validateHrLeaveRequest({ ...base, startAt: '2026-03-02' }), /date de fin/);
    assert.throws(() => validateHrLeaveRequest({ ...base, leaveType: 'VACATION' }), /type de congé/);
    assert.throws(() => validateHrLeaveRequest({ ...base, reason: ' ' }), /motif est obligatoire/);
    assert.throws(() => validateHrLeaveRequest({ ...base, reason: 'x'.repeat(1001) }), /1 000 caractères/);
  });

  it('requires a rejection note and validates decisions', () => {
    assert.deepEqual(validateHrLeaveDecision('APPROVED', undefined), { decision: 'APPROVED', note: null });
    assert.throws(() => validateHrLeaveDecision('REJECTED', ' '), /motif est obligatoire/);
    assert.deepEqual(validateHrLeaveDecision('REJECTED', '  Planning  '), { decision: 'REJECTED', note: 'Planning' });
    assert.throws(() => validateHrLeaveDecision('PENDING', null), HrRequestError);
  });
});
