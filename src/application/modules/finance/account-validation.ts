export function assertAccountCodesExist(requestedCodes: readonly string[], availableCodes: readonly string[]): void {
  const available = new Set(availableCodes);
  const missing = [...new Set(requestedCodes)].filter((code) => !available.has(code));
  if (missing.length > 0) {
    throw new Error(`Compte(s) absent(s) du plan comptable de la société : ${missing.join(', ')}`);
  }
}

export function assertPostingAccountCodesAllowed(
  requestedCodes: readonly string[],
  accounts: readonly { code: string; isPostingAllowed: boolean }[],
): void {
  const accountsByCode = new Map(accounts.map((account) => [account.code, account]));
  const nonPostingCodes = [...new Set(requestedCodes)]
    .filter((code) => accountsByCode.get(code)?.isPostingAllowed === false);
  if (nonPostingCodes.length > 0) {
    throw new Error(`Le(s) compte(s) de regroupement ne peut/peuvent pas recevoir d’écriture : ${nonPostingCodes.join(', ')}`);
  }
}
