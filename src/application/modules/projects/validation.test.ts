import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  validateProjectCostInput,
  validateProjectInput,
  validateProjectMilestoneInput,
  validateProjectTaskInput,
} from './validation';

describe('project input validation', () => {
  it('accepts project plans with optional budgets and valid date ranges', () => {
    const project = validateProjectInput({
      projectCode: ' SITE-01 ',
      name: 'Extension atelier',
      budgetAmount: 125000.5,
      contractAmount: 175000,
      startAt: '2026-11-01',
      endAt: '2027-03-31',
    });
    assert.equal(project.projectCode, 'SITE-01');
    assert.equal(project.budgetAmount, 125000.5);
    assert.equal(project.startAt?.toISOString(), '2026-11-01T00:00:00.000Z');
  });

  it('rejects invalid project date ranges and amounts', () => {
    assert.throws(() => validateProjectInput({
      projectCode: 'SITE-01',
      name: 'Projet',
      startAt: '2027-01-01',
      endAt: '2026-12-31',
    }), /ne peut pas précéder/);
    assert.throws(() => validateProjectInput({
      projectCode: 'SITE-01',
      name: 'Projet',
      budgetAmount: 1.2345,
    }), /au maximum trois décimales/);
  });

  it('validates tasks, milestones, and manually recorded costs', () => {
    assert.equal(validateProjectTaskInput({ title: 'Fondations' }).dueAt, null);
    assert.equal(validateProjectMilestoneInput({ title: 'Réception provisoire' }).title, 'Réception provisoire');
    assert.deepEqual(validateProjectCostInput({
      category: 'LABOR',
      description: 'Heures chantier saisies',
      amount: 125.25,
      occurredAt: '2026-11-12',
      sourceReference: 'FEUILLE-12',
    }), {
      category: 'LABOR',
      description: 'Heures chantier saisies',
      amount: 125.25,
      occurredAt: new Date('2026-11-12T00:00:00.000Z'),
      sourceReference: 'FEUILLE-12',
    });
    assert.throws(() => validateProjectCostInput({
      category: 'AUTOMATIC',
      description: 'Coût inconnu',
      amount: 20,
      occurredAt: '2026-11-12',
    }), /catégorie du coût est invalide/);
  });
});
