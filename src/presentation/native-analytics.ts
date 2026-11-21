export interface NativeInsight {
  kind: 'info' | 'warning' | 'positive';
  text: string;
}

interface MonthlyMovement {
  month: string;
  revenue: number | null;
  expenses: number | null;
}

function formatAmount(value: number, currencyCode: string) {
  return `${value.toLocaleString('fr-FR', { minimumFractionDigits: 3, maximumFractionDigits: 3 })} ${currencyCode}`;
}

function formatMonth(month: string) {
  const date = new Date(`${month}-01T00:00:00.000Z`);
  return new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(date);
}

function compareMovement(label: string, previous: number, current: number, currencyCode: string) {
  const difference = current - previous;
  if (difference === 0) return `${label} sont stables`;
  const direction = difference > 0 ? 'ont augmenté' : 'ont diminué';
  return `${label} ${direction} de ${formatAmount(Math.abs(difference), currencyCode)}`;
}

export function getDashboardNativeInsights(input: {
  monthly: readonly MonthlyMovement[];
  periodEnd: string;
  currencyCode: string;
  unclassifiedJournalLineCount: number;
  invalidJournalLineCount: number;
}): NativeInsight[] {
  const insights: NativeInsight[] = [];
  const currentMonth = input.periodEnd.slice(0, 7);
  const closedMonths = input.monthly.filter(({ month }) => month < currentMonth);
  const latest = closedMonths.at(-1);
  const previous = closedMonths.at(-2);

  if (latest && previous) {
    const previousDate = new Date(`${previous.month}-01T00:00:00.000Z`);
    previousDate.setUTCMonth(previousDate.getUTCMonth() + 1);
    const monthsAreAdjacent = previousDate.toISOString().slice(0, 7) === latest.month;
    const movementsAvailable = previous.revenue !== null
      && latest.revenue !== null
      && previous.expenses !== null
      && latest.expenses !== null;

    if (monthsAreAdjacent && movementsAvailable) {
      const monthLabel = formatMonth(latest.month);
      insights.push({
        kind: latest.revenue! - latest.expenses! < 0 ? 'warning' : 'info',
        text: `${monthLabel} (dernier mois complet) : ${compareMovement('les produits comptabilisés', previous.revenue!, latest.revenue!, input.currencyCode)} et ${compareMovement('les charges comptabilisées', previous.expenses!, latest.expenses!, input.currencyCode)} par rapport au mois précédent. C’est une comparaison descriptive des écritures POSTED, pas une prévision.`,
      });
    } else {
      insights.push({
        kind: 'info',
        text: 'Comparaison mensuelle indisponible : les deux derniers mois complets et leurs mouvements classés ne sont pas tous disponibles.',
      });
    }
  } else {
    insights.push({
      kind: 'info',
      text: 'Comparaison mensuelle indisponible : SAFE ne dispose pas encore de deux mois complets de mouvements classés.',
    });
  }

  if (input.unclassifiedJournalLineCount > 0 || input.invalidJournalLineCount > 0) {
    insights.push({
      kind: 'warning',
      text: `Cette analyse peut être incomplète : ${input.unclassifiedJournalLineCount} ligne(s) non classée(s) et ${input.invalidJournalLineCount} ligne(s) invalide(s) ont été détectées.`,
    });
  }

  return insights;
}

export function getReceivablesNativeInsights(input: {
  currencyCode: string;
  totals: {
    outstanding: number | null;
    days1To30: number | null;
    days31To60: number | null;
    days61To90: number | null;
    over90: number | null;
    unknownDueDate: number | null;
  };
  coverage: {
    openInvoiceCount: number;
    invalidInvoiceCount: number;
    dueDateMissingCount: number;
  };
}): NativeInsight[] {
  const insights: NativeInsight[] = [];

  if (input.coverage.invalidInvoiceCount > 0) {
    insights.push({
      kind: 'warning',
      text: `${input.coverage.invalidInvoiceCount} facture(s) ont des données ou règlements incohérents : le total restant dû et les tranches ne sont pas considérés complets.`,
    });
  } else if (input.coverage.openInvoiceCount === 0) {
    insights.push({
      kind: 'positive',
      text: 'Aucune créance ouverte n’est recensée à la date d’arrêté dans les factures et règlements rapprochés disponibles.',
    });
  } else {
    const agingBuckets = [
      input.totals.days1To30,
      input.totals.days31To60,
      input.totals.days61To90,
      input.totals.over90,
    ];
    if (agingBuckets.every((amount): amount is number => amount !== null)) {
      const overdue = agingBuckets.reduce((total, amount) => total + amount, 0);
      const over90 = input.totals.over90!;
      insights.push({
        kind: over90 > 0 ? 'warning' : overdue > 0 ? 'info' : 'positive',
        text: overdue > 0
          ? `${formatAmount(overdue, input.currencyCode)} restent échus; ${formatAmount(over90, input.currencyCode)} ont plus de 90 jours.`
          : 'Aucun montant échu n’est calculé sur les tranches dont l’échéance est connue.',
      });
    } else {
      insights.push({
        kind: 'warning',
        text: 'Analyse de retard indisponible : une ou plusieurs tranches de créances ne sont pas calculables.',
      });
    }
  }

  if (input.coverage.dueDateMissingCount > 0 && input.totals.unknownDueDate !== null) {
    insights.push({
      kind: 'warning',
      text: `${input.coverage.dueDateMissingCount} facture(s) ouverte(s) n’ont pas d’échéance; ${formatAmount(input.totals.unknownDueDate, input.currencyCode)} ne peuvent pas être classés par ancienneté.`,
    });
  }

  return insights;
}
