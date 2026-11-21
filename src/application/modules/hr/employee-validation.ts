import { HrRequestError } from './errors';
import { MAX_PAYROLL_AMOUNT } from './payroll-amount';

export interface EmployeeInput {
  entityId: string;
  empId?: string;
  cin?: string;
  cnssNumber?: string;
  firstName: string;
  lastName: string;
  email: string;
  position?: string;
  baseSalary?: number;
  maritalStatus?: 'SINGLE' | 'MARRIED';
  isHeadOfFamily?: boolean;
  childrenCount?: number;
  dependentParents?: number;
  hiredAt?: Date;
}

export interface EmployeeTerminationInput {
  terminatedAt: Date | null;
  note: string;
}

export interface PayslipRubriqueInput {
  code: string;
  category: 'PRIME' | 'PRIME_NON_COTISABLE' | 'AVANTAGE_FISCAL' | 'RETENUE';
  amount: number;
}

export function assertEmployeeCanBeDeleted(payslipCount: number, leaveRequestCount = 0): void {
  if (payslipCount > 0) {
    throw new HrRequestError('Suppression refusée : ce salarié possède des fiches de paie à conserver', 409);
  }
  if (leaveRequestCount > 0) {
    throw new HrRequestError('Suppression refusée : ce salarié possède des demandes de congé à conserver', 409);
  }
}

function optionalText(input: Record<string, unknown>, field: string): string | undefined {
  const value = input[field];
  if (value === undefined) return undefined;
  if (typeof value !== 'string') throw new HrRequestError(`Le champ ${field} doit être une chaîne`, 400);
  const trimmed = value.trim();
  return trimmed || undefined;
}

function optionalCount(input: Record<string, unknown>, field: string): number | undefined {
  const value = input[field];
  if (value === undefined) return undefined;
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw new HrRequestError(`Le champ ${field} doit être un entier positif ou nul`, 400);
  }
  return value;
}

function optionalBaseSalary(value: unknown): number | undefined {
  if (value === undefined) return undefined;
  if (
    typeof value !== 'number'
    || !Number.isFinite(value)
    || value < 0
    || value > MAX_PAYROLL_AMOUNT
    || !Number.isSafeInteger(Math.round(value * 1000))
  ) {
    throw new HrRequestError('Le salaire de base doit être un nombre positif ou nul', 400);
  }
  return value;
}

function optionalMaritalStatus(value: unknown): EmployeeInput['maritalStatus'] {
  if (value === undefined) return undefined;
  if (value !== 'SINGLE' && value !== 'MARRIED') {
    throw new HrRequestError('La situation familiale est invalide', 400);
  }
  return value;
}

function optionalBoolean(value: unknown, label: string): boolean | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'boolean') throw new HrRequestError(`${label} doit être booléen`, 400);
  return value;
}

function parseCalendarDate(value: unknown, label: string): Date {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new HrRequestError(`${label} doit respecter le format AAAA-MM-JJ`, 400);
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new HrRequestError(`${label} est invalide`, 400);
  }
  return date;
}

export function validateEmployeeInput(data: unknown, entityId: string): EmployeeInput {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new HrRequestError('Données salarié invalides', 400);
  }
  const input = data as Record<string, unknown>;
  const firstName = optionalText(input, 'firstName');
  const lastName = optionalText(input, 'lastName');
  const email = optionalText(input, 'email');
  if (!firstName || !lastName || !email) {
    throw new HrRequestError('Le prénom, le nom et l’adresse e-mail du salarié sont obligatoires', 400);
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new HrRequestError('L’adresse e-mail du salarié est invalide', 400);
  }

  const baseSalary = optionalBaseSalary(input.baseSalary);
  const maritalStatus = optionalMaritalStatus(input.maritalStatus);
  const isHeadOfFamily = optionalBoolean(input.isHeadOfFamily, 'Le statut chef de famille');

  let hiredAt: Date | undefined;
  if (input.hiredAt !== undefined) {
    hiredAt = parseCalendarDate(input.hiredAt, 'La date d’embauche');
  }

  const empId = optionalText(input, 'empId');
  const cin = optionalText(input, 'cin');
  const cnssNumber = optionalText(input, 'cnssNumber');
  const position = optionalText(input, 'position');
  const childrenCount = optionalCount(input, 'childrenCount');
  const dependentParents = optionalCount(input, 'dependentParents');

  return {
    entityId,
    firstName,
    lastName,
    email,
    ...(empId ? { empId } : {}),
    ...(cin ? { cin } : {}),
    ...(cnssNumber ? { cnssNumber } : {}),
    ...(position ? { position } : {}),
    ...(baseSalary === undefined ? {} : { baseSalary }),
    ...(maritalStatus === undefined ? {} : { maritalStatus }),
    ...(isHeadOfFamily === undefined ? {} : { isHeadOfFamily }),
    ...(childrenCount === undefined ? {} : { childrenCount }),
    ...(dependentParents === undefined ? {} : { dependentParents }),
    ...(hiredAt === undefined ? {} : { hiredAt }),
  };
}

export function validateEmployeeTerminationInput(data: unknown): EmployeeTerminationInput {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new HrRequestError('Données de fin d’emploi invalides', 400);
  }
  const input = data as Record<string, unknown>;
  const unknownFields = Object.keys(input).filter((field) => !['terminatedAt', 'note'].includes(field));
  if (unknownFields.length > 0) {
    throw new HrRequestError(`Champs de fin d’emploi inconnus : ${unknownFields.join(', ')}`, 400);
  }
  if (!Object.prototype.hasOwnProperty.call(input, 'terminatedAt')) {
    throw new HrRequestError('La date de sortie est obligatoire; utilisez null pour réactiver le dossier.', 400);
  }
  const note = optionalText(input, 'note');
  if (!note || note.length > 500) {
    throw new HrRequestError('Un motif non vide de 500 caractères maximum est obligatoire.', 400);
  }
  return {
    terminatedAt: input.terminatedAt === null
      ? null
      : parseCalendarDate(input.terminatedAt, 'La date de sortie'),
    note,
  };
}

export function validatePayslipPeriod(period: unknown): string {
  if (typeof period !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) {
    throw new HrRequestError('La période de paie doit respecter le format AAAA-MM', 400);
  }
  return period;
}

export function validatePayslipRubriques(data: unknown): PayslipRubriqueInput[] {
  if (data === undefined) return [];
  if (!Array.isArray(data)) throw new HrRequestError('Les rubriques de paie doivent être une liste', 400);
  const seen = new Set<string>();
  let totalAmount = 0;
  return data.map((item, index) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      throw new HrRequestError(`Rubrique invalide à la ligne ${index + 1}`, 400);
    }
    const rubrique = item as Record<string, unknown>;
    if (typeof rubrique.code !== 'string' || !rubrique.code.trim()) {
      throw new HrRequestError(`Le code de rubrique est obligatoire à la ligne ${index + 1}`, 400);
    }
    const code = rubrique.code.trim();
    if (seen.has(code)) throw new HrRequestError(`La rubrique ${code} est présente plusieurs fois`, 400);
    seen.add(code);
    if (
      rubrique.category !== 'PRIME' &&
      rubrique.category !== 'PRIME_NON_COTISABLE' &&
      rubrique.category !== 'AVANTAGE_FISCAL' &&
      rubrique.category !== 'RETENUE'
    ) {
      throw new HrRequestError(`La catégorie de rubrique est invalide à la ligne ${index + 1}`, 400);
    }
    if (
      typeof rubrique.amount !== 'number' ||
      !Number.isFinite(rubrique.amount) ||
      rubrique.amount < 0 ||
      rubrique.amount > MAX_PAYROLL_AMOUNT
    ) {
      throw new HrRequestError(`Le montant de rubrique doit être positif ou nul à la ligne ${index + 1}`, 400);
    }
    totalAmount += rubrique.amount;
    if (totalAmount > MAX_PAYROLL_AMOUNT) {
      throw new HrRequestError('Le total des rubriques dépasse la plage de calcul de paie prise en charge.', 400);
    }
    return { code, category: rubrique.category, amount: rubrique.amount };
  });
}
