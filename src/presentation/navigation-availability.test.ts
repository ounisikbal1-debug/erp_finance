import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ALL_MODULES_CONFIG, INITIAL_ROLE_PERMISSIONS } from './App';

describe('navigation availability', () => {
  it('does not advertise menu entries without a routed business screen', () => {
    const unavailableModuleIds = [
      'bankReconciliation',
      'hrTraining',
      'turnover',
      'logistics',
      'generalServices',
      'generalSettings',
    ];

    for (const id of unavailableModuleIds) {
      assert.equal(ALL_MODULES_CONFIG.some((module) => module.id === id), false, `${id} must not appear in navigation`);
    }
  });

  it('does not offer finance managers screens restricted by the server API roles', () => {
    const serverRestrictedModuleIds = [
      'consolidation',
      'payrollEngine',
      'hrDeep',
      'hrWorkflows',
      'quality',
      'parameters',
      'securityAccess',
      'workbookControls',
    ];

    for (const id of serverRestrictedModuleIds) {
      assert.equal(
        INITIAL_ROLE_PERMISSIONS.FINANCIAL_MANAGER.includes(id as (typeof INITIAL_ROLE_PERMISSIONS.FINANCIAL_MANAGER)[number]),
        false,
        `${id} must remain unavailable to finance managers`,
      );
    }
  });
});
