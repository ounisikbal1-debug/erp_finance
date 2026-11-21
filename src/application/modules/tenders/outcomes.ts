export type TenderOutcome = {
  contractingAuthority: string;
  status: string;
};

export type TenderAuthorityOutcome = {
  contractingAuthority: string;
  won: number;
  lost: number;
};

export function summarizeTenderOutcomes(tenders: readonly TenderOutcome[]): TenderAuthorityOutcome[] {
  const outcomes = new Map<string, TenderAuthorityOutcome>();
  for (const tender of tenders) {
    if (tender.status !== 'WON' && tender.status !== 'LOST') continue;
    const outcome = outcomes.get(tender.contractingAuthority) ?? {
      contractingAuthority: tender.contractingAuthority,
      won: 0,
      lost: 0,
    };
    if (tender.status === 'WON') outcome.won += 1;
    else outcome.lost += 1;
    outcomes.set(tender.contractingAuthority, outcome);
  }
  return [...outcomes.values()].sort((left, right) =>
    left.contractingAuthority.localeCompare(right.contractingAuthority, 'fr'));
}
