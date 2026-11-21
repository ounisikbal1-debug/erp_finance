import { ControllingRequestError } from './errors';

export interface CostCenterDraft {
  code: string;
  name: string;
  department: string;
}

export interface CostCenterUpdate {
  name: string;
  department: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function requiredText(value: unknown, field: string, maxLength: number): string {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > maxLength) {
    throw new ControllingRequestError(`${field} est obligatoire et ne peut pas dépasser ${maxLength} caractères.`, 400);
  }
  return value.trim();
}

export function validateCostCenterDraft(value: unknown): CostCenterDraft {
  if (!isRecord(value)) throw new ControllingRequestError('Données de centre de coûts invalides.', 400);
  const code = requiredText(value.code, 'Le code', 50);
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(code)) {
    throw new ControllingRequestError('Le code doit commencer par une lettre ou un chiffre et ne contenir que lettres, chiffres, point, tiret ou soulignement.', 400);
  }
  return {
    code,
    name: requiredText(value.name, 'Le nom', 120),
    department: requiredText(value.department, 'Le département', 120),
  };
}

export function validateCostCenterUpdate(value: unknown): CostCenterUpdate {
  if (!isRecord(value)) throw new ControllingRequestError('Données de centre de coûts invalides.', 400);
  return {
    name: requiredText(value.name, 'Le nom', 120),
    department: requiredText(value.department, 'Le département', 120),
  };
}

export function parseControllingPeriod(value: unknown): {
  period: string | null;
  startAt: Date | null;
  endExclusive: Date | null;
} {
  if (value === undefined || value === null || value === '') {
    return { period: null, startAt: null, endExclusive: null };
  }
  if (typeof value !== 'string') {
    throw new ControllingRequestError('La période doit être au format AAAA-MM, AAAA-Qn, AAAA ou vide pour toutes les périodes.', 400);
  }
  const monthMatch = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(value);
  const quarterMatch = /^(\d{4})-Q([1-4])$/.exec(value);
  const yearMatch = /^(\d{4})$/.exec(value);
  if (!monthMatch && !quarterMatch && !yearMatch) {
    throw new ControllingRequestError('La période doit être au format AAAA-MM, AAAA-Qn, AAAA ou vide pour toutes les périodes.', 400);
  }
  const year = Number(monthMatch?.[1] ?? quarterMatch?.[1] ?? yearMatch?.[1]);
  if (year < 1900 || year > 9999) throw new ControllingRequestError('L’année de la période est invalide.', 400);
  const month = monthMatch ? Number(monthMatch[2]) : quarterMatch ? (Number(quarterMatch[2]) - 1) * 3 + 1 : 1;
  const monthCount = quarterMatch ? 3 : yearMatch ? 12 : 1;
  return {
    period: value,
    startAt: new Date(Date.UTC(year, month - 1, 1)),
    endExclusive: new Date(Date.UTC(year, month - 1 + monthCount, 1)),
  };
}
