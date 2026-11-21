import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { GovernanceSodService, type UserPermissionProfile } from './governance-service';

describe('Gouvernance SAFE: Segregation of Duties (SoD) & Financial Delegation Matrix', () => {
  const service = new GovernanceSodService();

  it('detects critical toxic combinations when a user can both manage vendors and pay them', () => {
    const toxicUser: UserPermissionProfile = {
      userId: 'usr-risk-1',
      username: 'fraudulent_profile',
      role: 'ACCOUNTANT',
      assignedFunctions: ['MANAGE_VENDORS', 'POST_JOURNAL_ENTRY', 'AUTHORIZE_PAYMENTS'],
    };

    const audit = service.auditUserSod(toxicUser);

    assert.equal(audit.riskLevel, 'CRITICAL');
    assert.equal(audit.violations.length, 1);
    assert.equal(audit.violations[0].ruleCode, 'SOD-001');
    assert.equal(audit.violations[0].severity, 'CRITICAL');
  });

  it('reports LOW risk when permissions are segregated with no toxic overlap', () => {
    const safeUser: UserPermissionProfile = {
      userId: 'usr-safe-1',
      username: 'compliant_accountant',
      role: 'ACCOUNTANT',
      assignedFunctions: ['POST_JOURNAL_ENTRY'],
    };

    const audit = service.auditUserSod(safeUser);

    assert.equal(audit.riskLevel, 'LOW');
    assert.equal(audit.violations.length, 0);
  });

  it('enforces financial delegation tiers based on expense amounts', () => {
    // 1. Dépense mineure (2 500 DT) -> Autorisé pour manager opérationnel et DAF
    const check1 = service.checkSpendingAuthorization(2500, 'OPERATIONAL_MANAGER');
    assert.equal(check1.authorized, true);
    assert.equal(check1.requiredTier, 'Opérationnel N+1');

    // 2. Dépense moyenne (25 000 DT) -> Rejetée pour manager opé, autorisée pour DAF
    const check2Op = service.checkSpendingAuthorization(25000, 'OPERATIONAL_MANAGER');
    assert.equal(check2Op.authorized, false);

    const check2Daf = service.checkSpendingAuthorization(25000, 'FINANCIAL_MANAGER');
    assert.equal(check2Daf.authorized, true);
    assert.equal(check2Daf.requiredTier, 'Direction Financière');

    // 3. Investissement majeur (150 000 DT) -> Requis Direction Générale (ADMIN)
    const check3Daf = service.checkSpendingAuthorization(150000, 'FINANCIAL_MANAGER');
    assert.equal(check3Daf.authorized, false);

    const check3Admin = service.checkSpendingAuthorization(150000, 'ADMIN');
    assert.equal(check3Admin.authorized, true);
  });
});
