export function buildCostCenterFilter(entityId: string) {
  return { entityId };
}

export function buildCostCenterJournalFilter(entityId: string, period?: { startAt: Date; endExclusive: Date } | null) {
  return {
    costCenterCode: { not: null },
    journalEntry: {
      entityId,
      status: 'POSTED',
      ...(period ? { date: { gte: period.startAt, lt: period.endExclusive } } : {}),
    },
  };
}
