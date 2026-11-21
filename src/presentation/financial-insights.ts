import { getCountryInterpretationLanguage } from '../shared/country-language';

export type FinancialInsightKind = 'info' | 'warning' | 'positive';

export interface FinancialInsightMessage {
  kind: FinancialInsightKind;
  text: string;
}

interface FinancialInsightInput {
  countryCode: string;
  revenue: number | null;
  expenses: number | null;
  previousRevenue?: number | null;
  previousExpenses?: number | null;
  postedJournalLineCount: number;
  unclassifiedJournalLineCount: number;
  invalidJournalLineCount: number;
  currencyCode: string;
}

function formatAmount(value: number, currencyCode: string, language: 'fr' | 'en') {
  const locale = language === 'fr' ? 'fr-FR' : 'en-US';
  return `${value.toLocaleString(locale, { minimumFractionDigits: 3, maximumFractionDigits: 3 })} ${currencyCode}`;
}

function describeChange(
  label: string,
  current: number,
  previous: number,
  language: 'fr' | 'en',
  currencyCode: string,
): string {
  if (previous === 0) {
    return language === 'fr'
      ? `Variation ${label} : passage de zéro à ${formatAmount(current, currencyCode, language)}; aucun pourcentage n’est calculé.`
      : `Change in ${label}: moved from zero to ${formatAmount(current, currencyCode, language)}; no percentage is calculated.`;
  }

  const change = current - previous;
  if (!Number.isFinite(change)) {
    return language === 'fr'
      ? `Variation ${label} : indisponible en raison d’un dépassement numérique.`
      : `Change in ${label}: unavailable because of a numeric overflow.`;
  }
  const percentage = (change / Math.abs(previous)) * 100;
  if (!Number.isFinite(percentage)) {
    return language === 'fr'
      ? `Variation ${label} : aucun pourcentage sûr n’est calculé.`
      : `Change in ${label}: no safe percentage is calculated.`;
  }
  const signedPercentage = `${change > 0 ? '+' : ''}${percentage.toFixed(1)} %`;
  return language === 'fr'
    ? `Variation ${label} : ${signedPercentage} par rapport à la même période N-1.`
    : `Change in ${label}: ${signedPercentage} compared with the same prior-year period.`;
}

export function getFinancialInsights(input: FinancialInsightInput): FinancialInsightMessage[] {
  const language = getCountryInterpretationLanguage(input.countryCode);
  if (!language) {
    return [{
      kind: 'warning',
      text: 'Langue d’analyse non configurée / Analysis language is not configured for this country; no interpretation was generated.',
    }];
  }

  const french = language === 'fr';
  const insights: FinancialInsightMessage[] = [];

  if (input.postedJournalLineCount === 0) {
    return [{
      kind: 'info',
      text: french
        ? 'Aucune écriture POSTED sur cette période : SAFE ne peut pas calculer de résultat comptable pour celle-ci.'
        : 'No POSTED entries were found for this period; SAFE cannot calculate an accounting result for it.',
    }];
  }

  if (input.unclassifiedJournalLineCount > 0 || input.invalidJournalLineCount > 0) {
    insights.push({
      kind: 'warning',
      text: french
        ? `${input.unclassifiedJournalLineCount} ligne(s) non classée(s) et ${input.invalidJournalLineCount} ligne(s) invalide(s) : les totaux affichés peuvent être incomplets. Vérifiez le plan comptable et les écritures concernées.`
        : `${input.unclassifiedJournalLineCount} unclassified and ${input.invalidJournalLineCount} invalid line(s): displayed totals may be incomplete. Review the chart of accounts and affected entries.`,
    });
  }

  if (input.revenue === null || input.expenses === null) {
    insights.push({
      kind: 'warning',
      text: french
        ? 'Le résultat de période n’est pas calculable : les mouvements de produits ou de charges sont indisponibles pour ce plan comptable ou cette période.'
        : 'The period result cannot be calculated because revenue or expense movements are unavailable for this chart of accounts or period.',
    });
    return insights;
  }

  const result = input.revenue - input.expenses;
  const resultText = result > 0
    ? (french
      ? `Le mouvement net comptabilisé est positif : ${formatAmount(result, input.currencyCode, language)}.`
      : `The net posted movement is positive: ${formatAmount(result, input.currencyCode, language)}.`)
    : result < 0
      ? (french
        ? `Le mouvement net comptabilisé est négatif : ${formatAmount(Math.abs(result), input.currencyCode, language)}.`
        : `The net posted movement is negative: ${formatAmount(Math.abs(result), input.currencyCode, language)}.`)
      : (french
        ? 'Les mouvements nets comptabilisés des produits et des charges sont égaux sur cette période.'
        : 'Net posted revenue and expense movements are equal for this period.');

  insights.push({
    kind: result < 0 ? 'info' : 'positive',
    text: `${resultText} ${french
      ? 'Il s’agit d’un indicateur comptable sur les écritures POSTED, pas d’un solde de trésorerie ni d’une conclusion réglementaire.'
      : 'This is an accounting indicator from POSTED entries, not a cash balance or regulatory conclusion.'}`,
  });

  if (input.previousRevenue !== undefined && input.previousExpenses !== undefined
    && input.previousRevenue !== null && input.previousExpenses !== null) {
    const previousResult = input.previousRevenue - input.previousExpenses;
    insights.push({
      kind: 'info',
      text: [
        describeChange(french ? 'des produits' : 'revenue', input.revenue, input.previousRevenue, language, input.currencyCode),
        describeChange(french ? 'des charges' : 'expenses', input.expenses, input.previousExpenses, language, input.currencyCode),
        describeChange(
          french ? 'du résultat de période' : 'the period result',
          result,
          previousResult,
          language,
          input.currencyCode,
        ),
      ].join(' '),
    });

    const expensesChange = input.expenses - input.previousExpenses;
    const revenueChange = input.revenue - input.previousRevenue;
    if (Number.isFinite(expensesChange) && Number.isFinite(revenueChange)
      && Number.isFinite(previousResult) && (expensesChange > revenueChange || result < previousResult)) {
      insights.push({
        kind: 'warning',
        text: french
          ? 'Si cette tendance se poursuit, le résultat pourrait être sous pression. Vérifiez les principaux postes de charges et comparez la période suivante avant toute décision.'
          : 'If this trend continues, the result could come under pressure. Review the main expense categories and compare the next period before making a decision.',
      });
    }
  }

  insights.push({
    kind: 'info',
    text: french
      ? 'Ces totaux ne permettent pas d’établir la liquidité ni des retards clients. Vérifiez séparément la trésorerie et l’ancienneté des créances; aucune prévision n’est calculée.'
      : 'These totals do not establish liquidity or late customer payments. Check cash balances and receivables aging separately; no forecast is calculated.',
  });

  return insights;
}
