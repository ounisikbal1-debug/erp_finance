import { WorkbookFeatureConfigurationError } from './workbook-feature-errors';

type AllocationFeature = 'project-cost-allocation' | 'production-cost-allocation' | 'project-progress-invoicing';

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function requireReference(value: unknown, label: string): string {
  if (typeof value !== 'string'
    || value.trim() !== value
    || value.length < 1
    || value.length > 160
    || /[\u0000-\u001f]/.test(value)) {
    throw new WorkbookFeatureConfigurationError(`${label} est invalide.`, 400);
  }
  return value;
}

function requireManualControls(value: Record<string, unknown>) {
  if (value.manualReviewRequired !== true) {
    throw new WorkbookFeatureConfigurationError('Une revue humaine est obligatoire pour ces correspondances.', 400);
  }
  if (value.calculationEnabled !== false || value.automaticPosting !== false) {
    throw new WorkbookFeatureConfigurationError('Le calcul automatique et la comptabilisation restent désactivés.', 409);
  }
}

function requireExactKeys(value: Record<string, unknown>, expected: string[]) {
  const keys = Object.keys(value);
  if (keys.length !== expected.length || keys.some((key) => !expected.includes(key))) {
    throw new WorkbookFeatureConfigurationError('La configuration contient des champs absents ou non pris en charge.', 400);
  }
}

function requireRows(value: unknown, label: string): Record<string, unknown>[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > 500 || !value.every(isRecord)) {
    throw new WorkbookFeatureConfigurationError(`${label} doit contenir de 1 à 500 correspondances.`, 400);
  }
  return value;
}

function validateProjectCosts(value: Record<string, unknown>) {
  requireExactKeys(value, ['rules', 'manualReviewRequired', 'calculationEnabled', 'automaticPosting']);
  requireManualControls(value);
  const seen = new Set<string>();
  const rules = requireRows(value.rules, 'La liste des imputations projet').map((rule) => {
    requireExactKeys(rule, ['sourceType', 'sourceReference', 'projectReference']);
    const sourceType = requireReference(rule.sourceType, 'Le type de source');
    const sourceReference = requireReference(rule.sourceReference, 'La référence source');
    const projectReference = requireReference(rule.projectReference, 'La référence projet');
    const key = `${sourceType}\u0000${sourceReference}`;
    if (seen.has(key)) {
      throw new WorkbookFeatureConfigurationError('Une source ne peut avoir qu’une correspondance projet explicite.', 400);
    }
    seen.add(key);
    return { sourceType, sourceReference, projectReference };
  });
  return { rules, manualReviewRequired: true as const, calculationEnabled: false as const, automaticPosting: false as const };
}

function validateProductionCosts(value: Record<string, unknown>) {
  requireExactKeys(value, ['rules', 'manualReviewRequired', 'calculationEnabled', 'automaticPosting']);
  requireManualControls(value);
  const seen = new Set<string>();
  const rules = requireRows(value.rules, 'La liste des correspondances de coûts').map((rule) => {
    requireExactKeys(rule, ['sourceCostReference', 'componentReference', 'basisReference']);
    const sourceCostReference = requireReference(rule.sourceCostReference, 'La référence du coût source');
    const componentReference = requireReference(rule.componentReference, 'La référence de composante');
    const basisReference = requireReference(rule.basisReference, 'La référence de base');
    const key = `${sourceCostReference}\u0000${componentReference}`;
    if (seen.has(key)) {
      throw new WorkbookFeatureConfigurationError('Une composante ne peut être mappée qu’une fois par coût source.', 400);
    }
    seen.add(key);
    return { sourceCostReference, componentReference, basisReference };
  });
  return { rules, manualReviewRequired: true as const, calculationEnabled: false as const, automaticPosting: false as const };
}

function validateProgressInvoicing(value: Record<string, unknown>) {
  requireExactKeys(value, ['milestones', 'manualReviewRequired', 'calculationEnabled', 'automaticPosting']);
  requireManualControls(value);
  const seen = new Set<string>();
  const milestones = requireRows(value.milestones, 'La liste des jalons').map((milestone) => {
    requireExactKeys(milestone, [
      'projectReference',
      'milestoneReference',
      'salesItemReference',
      'amountReference',
    ]);
    const projectReference = requireReference(milestone.projectReference, 'La référence projet');
    const milestoneReference = requireReference(milestone.milestoneReference, 'La référence du jalon');
    const salesItemReference = requireReference(milestone.salesItemReference, 'La référence de l’article de vente');
    const amountReference = requireReference(milestone.amountReference, 'La référence du montant source');
    const key = `${projectReference}\u0000${milestoneReference}`;
    if (seen.has(key)) {
      throw new WorkbookFeatureConfigurationError('Un jalon ne peut avoir qu’une correspondance de facturation.', 400);
    }
    seen.add(key);
    return { projectReference, milestoneReference, salesItemReference, amountReference };
  });
  return {
    milestones,
    manualReviewRequired: true as const,
    calculationEnabled: false as const,
    automaticPosting: false as const,
  };
}

export function validateWorkbookAllocationConfiguration(feature: AllocationFeature, input: unknown) {
  if (!isRecord(input)) {
    throw new WorkbookFeatureConfigurationError('La configuration de correspondance doit être un objet.', 400);
  }
  if (feature === 'project-cost-allocation') return validateProjectCosts(input);
  if (feature === 'production-cost-allocation') return validateProductionCosts(input);
  return validateProgressInvoicing(input);
}
