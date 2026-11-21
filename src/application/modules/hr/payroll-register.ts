import { HrRequestError } from './errors';

export interface PayrollRegisterEmployee {
  id: string;
  empId: string | null;
  firstName: string;
  lastName: string;
  cnssNumber: string | null;
  hiredAt: Date;
  terminatedAt: Date | null;
}

export interface PayrollRegisterPayslip {
  id: string;
  employeeId: string;
  period: string;
  currencyCode: string;
  grossSalary: number;
  employeeCnss: number;
  employerCnss: number;
  foprolos: number;
  taxableGross: number;
  irpp: number;
  css: number;
  netSalary: number;
  calculationSnapshot: string | null;
  employee: Pick<PayrollRegisterEmployee, 'id' | 'empId' | 'firstName' | 'lastName' | 'cnssNumber'>;
}

const AMOUNT_FIELDS = [
  'grossSalary',
  'employeeCnss',
  'employerCnss',
  'foprolos',
  'taxableGross',
  'irpp',
  'css',
  'netSalary',
] as const;

type AmountField = typeof AMOUNT_FIELDS[number];

function toMillimes(value: number, field: string): number {
  if (!Number.isFinite(value)) {
    throw new HrRequestError(`Montant invalide dans le registre de paie (${field}).`, 422);
  }
  const millimes = Math.round(value * 1000);
  if (!Number.isSafeInteger(millimes) || Math.abs(value * 1000 - millimes) > 1e-6) {
    throw new HrRequestError(`Montant non exprimable au millime dans le registre de paie (${field}).`, 422);
  }
  return millimes;
}

function hasValidCalculationSnapshot(payslip: PayrollRegisterPayslip): boolean {
  if (!payslip.calculationSnapshot) return false;
  try {
    const snapshot: unknown = JSON.parse(payslip.calculationSnapshot);
    if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) return false;
    const data = snapshot as Record<string, unknown>;
    if (
      data.version !== 'SAFE_PAYROLL_CALCULATION_V1'
      || data.period !== payslip.period
      || data.currencyCode !== payslip.currencyCode
      || typeof data.countryCode !== 'string'
      || !data.configuration || typeof data.configuration !== 'object' || Array.isArray(data.configuration)
      || !Array.isArray(data.taxBrackets) || data.taxBrackets.length === 0
      || !data.inputs || typeof data.inputs !== 'object' || Array.isArray(data.inputs)
      || !data.results || typeof data.results !== 'object' || Array.isArray(data.results)
    ) return false;
    const results = data.results as Record<string, unknown>;
    const matchingAmounts: Array<[string, number, unknown]> = [
      ['grossSalary', payslip.grossSalary, results.grossSalary],
      ['employeeCnss', payslip.employeeCnss, results.employeeCnss],
      ['taxableGross', payslip.taxableGross, results.taxableGross],
      ['irpp', payslip.irpp, results.irpp],
      ['css', payslip.css, results.css],
      ['netSalary', payslip.netSalary, results.netSalary],
    ];
    return matchingAmounts.every(([field, storedValue, snapshotValue]) =>
      typeof snapshotValue === 'number'
      && toMillimes(snapshotValue, `instantané.${field}`) === toMillimes(storedValue, field));
  } catch {
    return false;
  }
}

function periodEnd(period: string): number {
  const [year, month] = period.split('-').map(Number);
  return Date.UTC(year, month, 0, 23, 59, 59, 999);
}

function periodStart(period: string): number {
  const [year, month] = period.split('-').map(Number);
  return Date.UTC(year, month - 1, 1);
}

export function isEmployeeEmployedDuringPeriod(
  period: string,
  employee: Pick<PayrollRegisterEmployee, 'hiredAt' | 'terminatedAt'>,
): boolean {
  return employee.hiredAt.getTime() <= periodEnd(period)
    && (employee.terminatedAt === null || employee.terminatedAt.getTime() >= periodStart(period));
}

export function buildPayrollRegister(
  period: string,
  employees: readonly PayrollRegisterEmployee[],
  payslips: readonly PayrollRegisterPayslip[],
) {
  const seenEmployees = new Set<string>();
  const employeesById = new Map(employees.map((employee) => [employee.id, employee]));
  for (const payslip of payslips) {
    if (payslip.period !== period || seenEmployees.has(payslip.employeeId) || payslip.employee.id !== payslip.employeeId) {
      throw new HrRequestError('Le registre contient des fiches incohérentes ou dupliquées; aucune synthèse ne peut être produite.', 422);
    }
    const employee = employeesById.get(payslip.employeeId);
    if (!employee || !isEmployeeEmployedDuringPeriod(period, employee)) {
      throw new HrRequestError('Le registre contient une fiche hors période d’emploi ou un salarié introuvable; aucune synthèse ne peut être produite.', 422);
    }
    seenEmployees.add(payslip.employeeId);
  }
  const expectedEmployees = employees.filter((employee) => isEmployeeEmployedDuringPeriod(period, employee));
  const paidEmployeeIds = new Set(payslips.map((payslip) => payslip.employeeId));
  const missingEmployees = expectedEmployees
    .filter((employee) => !paidEmployeeIds.has(employee.id))
    .map(({ id, empId, firstName, lastName, cnssNumber }) => ({ id, empId, firstName, lastName, cnssNumber }));
  const currencies = new Set(payslips.map((payslip) => payslip.currencyCode));
  if (currencies.size > 1) {
    throw new HrRequestError('Le registre contient plusieurs devises; séparez les paies avant de rapprocher les déclarations.', 422);
  }

  const totals = Object.fromEntries(AMOUNT_FIELDS.map((field) => {
    const sum = payslips.reduce((total, payslip) => {
      const next = total + toMillimes(payslip[field], field);
      if (!Number.isSafeInteger(next)) {
        throw new HrRequestError(`Total non représentable dans le registre de paie (${field}).`, 422);
      }
      return next;
    }, 0);
    return [field, sum / 1000];
  })) as Record<AmountField, number>;
  const missingSnapshotCount = payslips.filter((payslip) => !payslip.calculationSnapshot).length;
  const invalidSnapshotCount = payslips.filter((payslip) => !hasValidCalculationSnapshot(payslip)).length;
  const hasPayrollData = payslips.length > 0;
  const completeness = !hasPayrollData || missingEmployees.length > 0 || invalidSnapshotCount > 0
    ? 'INCOMPLETE'
    : 'REVIEW_REQUIRED';

  return {
    period,
    currencyCode: payslips[0]?.currencyCode ?? null,
    status: 'PREPARATION_ONLY' as const,
    filingSupported: false as const,
    completeness,
    expectedEmployeeCount: expectedEmployees.length,
    payslipCount: payslips.length,
    missingEmployees,
    missingSnapshotCount,
    invalidSnapshotCount,
    totals,
    rows: payslips.map((payslip) => ({
      id: payslip.id,
      employeeId: payslip.employeeId,
      employeeNumber: payslip.employee.empId,
      employeeName: `${payslip.employee.firstName} ${payslip.employee.lastName}`.trim(),
      cnssNumber: payslip.employee.cnssNumber,
      currencyCode: payslip.currencyCode,
      ...Object.fromEntries(AMOUNT_FIELDS.map((field) => [field, payslip[field]])),
      calculationSnapshotAvailable: hasValidCalculationSnapshot(payslip),
    })),
    warnings: [
      ...(!hasPayrollData ? ['Aucune fiche de paie enregistrée pour cette période.'] : []),
      ...(missingEmployees.length > 0 ? ['Des salariés enregistrés avant la fin de période n’ont pas de fiche de paie.'] : []),
      ...(missingSnapshotCount > 0 ? ['Des fiches anciennes ne contiennent pas le détail versionné de leur calcul.'] : []),
      ...(invalidSnapshotCount > missingSnapshotCount ? ['Des instantanés de calcul sont absents, invalides ou incohérents avec les montants enregistrés.'] : []),
      ['Vérifiez les dates d’embauche et de sortie avec les dossiers du personnel; elles déterminent l’effectif attendu.'],
      ['Cet état est une préparation interne; aucun formulaire officiel, dépôt CNSS/DGI ou paiement n’est produit.'],
    ],
  };
}
