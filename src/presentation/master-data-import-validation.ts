export type MasterDataImportKind = 'customer' | 'vendor';

const CONTACT_FIELDS = ['fiscalId', 'email', 'phone', 'address'] as const;
const MAX_LENGTHS = { fiscalId: 50, email: 254, phone: 40, address: 500 } as const;

export function validateMasterDataImportRow(
  kind: MasterDataImportKind,
  row: Record<string, unknown>,
  rowIndex: number,
  allRows: Array<Record<string, unknown>>,
  existingCodes: string[],
): string | null {
  const line = rowIndex + 2;
  const code = String(row.code ?? '').trim();
  const name = String(row.name ?? '').trim();
  const label = kind === 'customer' ? 'client' : 'fournisseur';
  if (!code || !name) return `Ligne ${line} : le code et le nom du ${label} sont obligatoires.`;

  const normalizedCode = code.toLocaleUpperCase();
  if (existingCodes.some((existing) => existing.trim().toLocaleUpperCase() === normalizedCode)
    || allRows.slice(0, rowIndex).some((previous) => (
      String(previous.code ?? '').trim().toLocaleUpperCase() === normalizedCode
    ))) {
    return `Ligne ${line} : le code ${code} existe déjà ou apparaît plusieurs fois dans le fichier.`;
  }
  for (const field of CONTACT_FIELDS) {
    const value = row[field];
    if (value !== undefined && String(value).trim().length > MAX_LENGTHS[field]) {
      return `Ligne ${line} : ${field} dépasse la longueur maximale de ${MAX_LENGTHS[field]} caractères.`;
    }
  }
  return null;
}
