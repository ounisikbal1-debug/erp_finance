export type EmployeeDocumentValidity = 'EXPIRED' | 'RENEW_SOON' | 'VALID' | 'NO_EXPIRY' | 'ARCHIVED';
export type EmployeeDocumentValidityFilter = 'ALL' | EmployeeDocumentValidity;

export interface EmployeeDocumentForValidity {
  status: string;
  validUntil: string | null;
  title: string;
  category: string;
  employee: { empId: string | null; firstName: string; lastName: string };
}

function isCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function getLocalCalendarDate(date = new Date()): string {
  if (!Number.isFinite(date.getTime())) throw new Error('La date de référence est invalide.');
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function formatEmployeeDocumentDate(value: string | null): string {
  if (!value) return '—';
  const date = value.slice(0, 10);
  if (!isCalendarDate(date)) throw new Error('La date du document est invalide.');
  return new Intl.DateTimeFormat('fr-FR', { timeZone: 'UTC' }).format(new Date(`${date}T00:00:00.000Z`));
}

function addCalendarDays(value: string, days: number): string {
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function getEmployeeDocumentValidity(
  document: Pick<EmployeeDocumentForValidity, 'status' | 'validUntil'>,
  today: string,
): EmployeeDocumentValidity {
  if (!isCalendarDate(today)) throw new Error('La date de référence doit respecter le format AAAA-MM-JJ.');
  if (document.status !== 'ACTIVE') return 'ARCHIVED';
  if (!document.validUntil) return 'NO_EXPIRY';
  const validUntil = document.validUntil.slice(0, 10);
  if (!isCalendarDate(validUntil)) throw new Error('La date de fin du document est invalide.');
  if (validUntil < today) return 'EXPIRED';
  if (validUntil <= addCalendarDays(today, 30)) return 'RENEW_SOON';
  return 'VALID';
}

export function filterEmployeeDocuments<T extends EmployeeDocumentForValidity>(
  documents: readonly T[],
  validityFilter: EmployeeDocumentValidityFilter,
  query: string,
  today: string,
): T[] {
  const normalizedQuery = query.trim().toLocaleLowerCase('fr-FR');
  return documents.filter((document) => {
    if (validityFilter !== 'ALL' && getEmployeeDocumentValidity(document, today) !== validityFilter) return false;
    if (!normalizedQuery) return true;
    const employeeName = `${document.employee.empId ?? ''} ${document.employee.firstName} ${document.employee.lastName}`;
    return `${employeeName} ${document.category} ${document.title}`.toLocaleLowerCase('fr-FR').includes(normalizedQuery);
  });
}
