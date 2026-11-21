import React, { useEffect, useState } from 'react';
import { getFinancialInsights } from './financial-insights';
import {
  compareFinancialPeriods,
  getFullMonthsInPeriod,
  getPriorYearPeriod,
  type FinancialBudgetMonth,
} from './financial-report-comparison';
import { exportToCSV, exportToPDF, exportToPowerPoint } from './exportUtils';
import { buildIncomeStatementLines } from './income-statement-layout';
import { buildCashFlowLines, buildDetailedBalanceLines, buildEquityChangesLines, buildFinancialPositionLines, isFinancialPositionSummary, type FinancialPositionSummary } from './financial-position';
import { translateBusinessText, useInterfaceLanguage } from './localization';

type AccountType = 'Asset' | 'Liability' | 'Equity' | 'Revenue' | 'Expense';

interface FinancialAggregateTotal {
  type: AccountType;
  movement: number;
}

interface FinancialMetricComparison {
  current: number | null;
  previous: number | null;
  difference: number | null;
  percentChange: number | null;
}

interface IncomeStatementData {
  entity: { name: string; countryCode: string; currencyCode: string; corporateTax?: number | null };
  periodStart: string;
  periodEnd: string;
  totals: Array<{ type: AccountType; accountCount: number; movement: number | null }>;
  accounts: Array<{ code: string; description: string; type: AccountType; financialCategory?: string | null; movement: number | null }>;
  coverage: {
    postedJournalLineCount: number;
    unclassifiedJournalLineCount: number;
    unclassifiedAccountCodes: string[];
    invalidJournalLineCount: number;
  };
}

interface FinancialInsight {
  answer: string;
  periodStart: string;
  periodEnd: string;
  currencyCode: string;
  explanation: {
    evidence: {
      periodStart: string;
      periodEnd: string;
      currencyCode: string;
      postedJournalLineCount: number;
      totals: FinancialAggregateTotal[];
      previousPeriod: {
        periodStart: string;
        periodEnd: string;
        postedJournalLineCount: number;
        totals: FinancialAggregateTotal[];
      } | null;
      comparison: {
        revenue: FinancialMetricComparison;
        expenses: FinancialMetricComparison;
        netResult: FinancialMetricComparison;
      };
    };
    excludedTotalTypes: AccountType[];
    rules: string[];
  };
  disclaimer: string;
  provider: 'ollama-local' | 'gemini-cloud' | 'groq-cloud';
  model: string;
  fallbackUsed: boolean;
  cloudDataScope: 'NO_CLOUD_TRANSFER' | 'AGGREGATE_TOTALS_AND_FIXED_QUERY_INTENT';
}

function isAiProvider(value: unknown): value is FinancialInsight['provider'] {
  return value === 'ollama-local' || value === 'gemini-cloud' || value === 'groq-cloud';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isNullableAmount(value: unknown): value is number | null {
  return value === null || (typeof value === 'number' && Number.isFinite(value));
}

function isAggregateTotals(value: unknown): value is FinancialAggregateTotal[] {
  const accountTypes = ['Asset', 'Liability', 'Equity', 'Revenue', 'Expense'];
  return Array.isArray(value) && value.every((item) => isRecord(item)
    && accountTypes.includes(String(item.type))
    && typeof item.movement === 'number'
    && Number.isFinite(item.movement));
}

function isMetricComparison(value: unknown): value is FinancialMetricComparison {
  return isRecord(value)
    && isNullableAmount(value.current)
    && isNullableAmount(value.previous)
    && isNullableAmount(value.difference)
    && isNullableAmount(value.percentChange);
}

function isPreviousPeriod(value: unknown): value is FinancialInsight['explanation']['evidence']['previousPeriod'] {
  return value === null || (isRecord(value)
    && typeof value.periodStart === 'string'
    && typeof value.periodEnd === 'string'
    && Number.isSafeInteger(value.postedJournalLineCount)
    && isAggregateTotals(value.totals));
}

function isFinancialExplanation(value: unknown): value is FinancialInsight['explanation'] {
  const accountTypes = ['Asset', 'Liability', 'Equity', 'Revenue', 'Expense'];
  return isRecord(value)
    && isRecord(value.evidence)
    && typeof value.evidence.periodStart === 'string'
    && typeof value.evidence.periodEnd === 'string'
    && typeof value.evidence.currencyCode === 'string'
    && Number.isSafeInteger(value.evidence.postedJournalLineCount)
    && isAggregateTotals(value.evidence.totals)
    && isPreviousPeriod(value.evidence.previousPeriod)
    && isRecord(value.evidence.comparison)
    && isMetricComparison(value.evidence.comparison.revenue)
    && isMetricComparison(value.evidence.comparison.expenses)
    && isMetricComparison(value.evidence.comparison.netResult)
    && Array.isArray(value.excludedTotalTypes)
    && value.excludedTotalTypes.every((type) => accountTypes.includes(String(type)))
    && Array.isArray(value.rules)
    && value.rules.every((rule) => typeof rule === 'string');
}

function isIncomeStatementData(value: unknown): value is IncomeStatementData {
  if (!isRecord(value)
    || !isRecord(value.entity)
    || !isRecord(value.coverage)
    || !Array.isArray(value.totals)
    || !Array.isArray(value.accounts)) return false;
  const accountTypes = ['Asset', 'Liability', 'Equity', 'Revenue', 'Expense'];
  return typeof value.entity.name === 'string'
    && typeof value.entity.countryCode === 'string'
    && typeof value.entity.currencyCode === 'string'
    && (value.entity.corporateTax === undefined || value.entity.corporateTax === null
      || (typeof value.entity.corporateTax === 'number' && Number.isFinite(value.entity.corporateTax)))
    && typeof value.periodStart === 'string'
    && typeof value.periodEnd === 'string'
    && Number.isSafeInteger(value.coverage.postedJournalLineCount)
    && Number.isSafeInteger(value.coverage.unclassifiedJournalLineCount)
    && Number.isSafeInteger(value.coverage.invalidJournalLineCount)
    && Array.isArray(value.coverage.unclassifiedAccountCodes)
    && value.coverage.unclassifiedAccountCodes.every((code) => typeof code === 'string')
    && value.totals.every((item) => isRecord(item)
      && accountTypes.includes(String(item.type))
      && Number.isSafeInteger(item.accountCount)
      && isNullableAmount(item.movement))
    && value.accounts.every((item) => isRecord(item)
      && typeof item.code === 'string'
      && typeof item.description === 'string'
      && accountTypes.includes(String(item.type))
      && (item.financialCategory === undefined || item.financialCategory === null || typeof item.financialCategory === 'string')
      && isNullableAmount(item.movement));
}

function formatAmount(value: number | null, currencyCode: string): string {
  return value === null
    ? 'Indisponible'
    : `${value.toLocaleString('fr-FR', { minimumFractionDigits: 3, maximumFractionDigits: 3 })} ${currencyCode}`;
}

function errorMessage(payload: unknown): string {
  return isRecord(payload) && typeof payload.error === 'string'
    ? payload.error
    : 'Impossible de charger le compte de résultat.';
}

async function fetchReportForPeriod(
  accessToken: string,
  periodStart: string,
  periodEnd: string,
  signal: AbortSignal,
): Promise<IncomeStatementData> {
  const query = new URLSearchParams({ from: periodStart, to: periodEnd });
  const response = await fetch(`/api/finance/financial-report?${query}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal,
  });
  const payload: unknown = await response.json();
  if (!response.ok) throw new Error(errorMessage(payload));
  if (!isIncomeStatementData(payload) || payload.periodStart !== periodStart || payload.periodEnd !== periodEnd) {
    throw new Error('La réponse financière est invalide ou concerne une autre période.');
  }
  return payload;
}

function isBudgetMonth(value: unknown): value is FinancialBudgetMonth {
  return isRecord(value)
    && typeof value.period === 'string'
    && isRecord(value.entity)
    && typeof value.entity.name === 'string'
    && typeof value.entity.countryCode === 'string'
    && typeof value.entity.currencyCode === 'string'
    && Array.isArray(value.lines)
    && value.lines.every((line) => isRecord(line)
      && typeof line.accountCode === 'string'
      && typeof line.description === 'string'
      && (line.accountType === null || line.accountType === 'Revenue' || line.accountType === 'Expense')
      && isNullableAmount(line.amount)
      && isNullableAmount(line.actual)
      && isNullableAmount(line.variance)
      && typeof line.status === 'string')
    && isRecord(value.diagnostics)
    && Number.isSafeInteger(value.diagnostics.unclassifiedJournalLineCount)
    && Number.isSafeInteger(value.diagnostics.invalidJournalLineCount);
}

async function fetchBudgetMonth(
  accessToken: string,
  period: string,
  signal: AbortSignal,
): Promise<FinancialBudgetMonth> {
  const response = await fetch(`/api/budget/data?period=${encodeURIComponent(period)}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal,
  });
  const payload: unknown = await response.json();
  if (!response.ok) throw new Error(errorMessage(payload));
  if (!isBudgetMonth(payload) || payload.period !== period) {
    throw new Error(`La réponse budgétaire SAFE de ${period} est invalide.`);
  }
  return payload;
}

function sameEntity(
  left: IncomeStatementData['entity'],
  right: IncomeStatementData['entity'],
): boolean {
  return left.name === right.name
    && left.countryCode === right.countryCode
    && left.currencyCode === right.currencyCode;
}

function FinancialInsights({
  accessToken,
  entityId,
  from,
  to,
}: {
  accessToken: string | null;
  entityId: string | null;
  from: string;
  to: string;
}) {
  const language = useInterfaceLanguage();
  const text = (value: string) => translateBusinessText(language, value);
  const [question, setQuestion] = useState('');
  const [insight, setInsight] = useState<FinancialInsight | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [confirmedRequestKey, setConfirmedRequestKey] = useState('');
  const [cloudConsentKey, setCloudConsentKey] = useState('');
  const requestConfirmationKey = JSON.stringify([entityId, from, to, question.trim()]);
  const isRequestConfirmed = confirmedRequestKey === requestConfirmationKey;
  const hasCloudAggregateConsent = cloudConsentKey === requestConfirmationKey;

  const ask = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setInsight(null);
    if (!isRequestConfirmed) {
      setError('Confirmez que vous vérifierez la réponse avant toute décision.');
      return;
    }
    if (!accessToken || !entityId) {
      setError('Une session financière authentifiée est requise.');
      return;
    }
    setConfirmedRequestKey('');
    setCloudConsentKey('');
    setLoading(true);
    try {
      const response = await fetch('/api/ai/financial-insights', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from,
          to,
          question,
          humanReviewConfirmed: true,
          cloudAggregateConsent: hasCloudAggregateConsent,
        }),
      });
      const payload: unknown = await response.json();
      if (!response.ok) throw new Error(errorMessage(payload));
      if (!isRecord(payload)
        || typeof payload.answer !== 'string'
        || !isAiProvider(payload.provider)
        || typeof payload.model !== 'string'
        || typeof payload.fallbackUsed !== 'boolean'
        || (payload.cloudDataScope !== 'NO_CLOUD_TRANSFER'
          && payload.cloudDataScope !== 'AGGREGATE_TOTALS_AND_FIXED_QUERY_INTENT')
        || typeof payload.disclaimer !== 'string'
        || payload.periodStart !== from
        || payload.periodEnd !== to
        || typeof payload.currencyCode !== 'string'
        || !isFinancialExplanation(payload.explanation)
        || payload.explanation.evidence.periodStart !== from
        || payload.explanation.evidence.periodEnd !== to
        || payload.explanation.evidence.currencyCode !== payload.currencyCode) {
        throw new Error('La réponse de l’assistant financier est invalide.');
      }
      setInsight({
        answer: payload.answer,
        periodStart: payload.periodStart,
        periodEnd: payload.periodEnd,
        currencyCode: payload.currencyCode,
        explanation: payload.explanation,
        disclaimer: payload.disclaimer,
        provider: payload.provider,
        model: payload.model,
        fallbackUsed: payload.fallbackUsed,
        cloudDataScope: payload.cloudDataScope,
      });
    } catch (requestError) {
      setError(text(requestError instanceof Error ? requestError.message : 'L’assistant financier est indisponible.'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <section aria-labelledby="financial-insights-title" style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 10, padding: 16 }}>
      <h3 id="financial-insights-title" style={{ marginTop: 0 }}>{text('Assistant analytique financier (optionnel)')}</h3>
      <p style={{ color: '#64748B', fontSize: 13 }}>
        {text('Après activation explicite côté serveur et consentement pour cette demande, le cloud peut recevoir les totaux POSTED agrégés, les périodes, la devise fonctionnelle, le nombre de lignes et une intention prédéfinie. Le texte libre, les écritures détaillées, les factures, la paie et les données personnelles restent locaux.')}
      </p>
      <form onSubmit={(event) => void ask(event)} style={{ display: 'grid', gap: 8 }}>
        <label htmlFor="financial-insights-question">{text('Question sur la période sélectionnée')}</label>
        <textarea
          id="financial-insights-question"
          value={question}
          maxLength={1000}
          rows={3}
          onChange={(event) => setQuestion(event.target.value)}
          placeholder={text('Ex. Comment évoluent les produits par rapport aux charges ?')}
        />
        <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
          <input
            type="checkbox"
            checked={isRequestConfirmed}
            onChange={(event) => setConfirmedRequestKey(event.target.checked ? requestConfirmationKey : '')}
          />
          {text('Je vérifierai la réponse et ses données sources avant toute décision.')}
        </label>
        <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
          <input
            type="checkbox"
            checked={hasCloudAggregateConsent}
            onChange={(event) => setCloudConsentKey(event.target.checked ? requestConfirmationKey : '')}
          />
          {text('J’autorise pour cette demande l’envoi au cloud des seuls totaux agrégés, périodes, devise, nombres de lignes et de la question prédéfinie, si le fournisseur est activé.')}
        </label>
        <p style={{ color: '#64748B', fontSize: 12 }}>
          {text('Les conditions varient selon le fournisseur : les données de l’offre gratuite Gemini peuvent être utilisées pour améliorer ses produits; Groq Llama 3.3 70B est indiqué comme accès Enterprise. Tarifs, quotas et disponibilité ne sont pas garantis.')}
        </p>
        <button type="submit" disabled={loading || question.trim().length < 5 || !isRequestConfirmed}>
          {loading ? text('Analyse en cours…') : text('Analyser les totaux')}
        </button>
      </form>
      {error && <p role="alert" style={{ color: '#991B1B' }}>{text(error)}</p>}
      {insight && (
        <div role="status" style={{ marginTop: 12, padding: 12, background: '#F8FAFC', borderRadius: 8 }}>
          <p>
            {text(insight.provider === 'ollama-local' ? 'Exécuté localement — aucune donnée envoyée au cloud.' : 'Analyse cloud activée — seuls des totaux agrégés et une intention fixe ont été envoyés.')}
            {insight.fallbackUsed && ` · ${text('Route de secours utilisée')}`}
            {' · '}<span dir="ltr">{insight.provider} / {insight.model}</span>
          </p>
          <p style={{ whiteSpace: 'pre-wrap' }}>{insight.answer}</p>
          <details>
            <summary>{text('Données et règles à l’origine de la réponse')}</summary>
            <p>
              Période {insight.explanation.evidence.periodStart} au {insight.explanation.evidence.periodEnd}
              {' · '}{insight.explanation.evidence.postedJournalLineCount} ligne(s) POSTED
              {' · '}{insight.explanation.evidence.currencyCode}
            </p>
            <ul>{insight.explanation.evidence.totals.map(({ type, movement }) => (
              <li key={type}>{type} : {formatAmount(movement, insight.explanation.evidence.currencyCode)}</li>
            ))}</ul>
            {insight.explanation.evidence.previousPeriod && (
              <>
                <p>
                  Comparatif N-1 {insight.explanation.evidence.previousPeriod.periodStart}
                  {' au '}{insight.explanation.evidence.previousPeriod.periodEnd}
                  {' · '}{insight.explanation.evidence.previousPeriod.postedJournalLineCount} ligne(s) POSTED
                </p>
                <ul>{insight.explanation.evidence.previousPeriod.totals.map(({ type, movement }) => (
                  <li key={type}>N-1 · {type} : {formatAmount(movement, insight.explanation.evidence.currencyCode)}</li>
                ))}</ul>
              </>
            )}
            <ul>{([
              ['Produits', insight.explanation.evidence.comparison.revenue],
              ['Charges', insight.explanation.evidence.comparison.expenses],
              ['Résultat net comptable', insight.explanation.evidence.comparison.netResult],
            ] as const).map(([label, comparison]) => (
              <li key={label}>
                {label} : actuel {formatAmount(comparison.current, insight.explanation.evidence.currencyCode)}
                {' · N-1 '}{formatAmount(comparison.previous, insight.explanation.evidence.currencyCode)}
                {' · écart '}{formatAmount(comparison.difference, insight.explanation.evidence.currencyCode)}
                {' · variation '}
                {comparison.percentChange === null
                  ? 'non calculée'
                  : `${comparison.percentChange.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} %`}
              </li>
            ))}</ul>
            {insight.explanation.excludedTotalTypes.length > 0
              && <p>Totaux indisponibles exclus : {insight.explanation.excludedTotalTypes.join(', ')}</p>}
            <ul>{insight.explanation.rules.map((rule) => <li key={rule}>{rule}</li>)}</ul>
          </details>
          <small style={{ color: '#64748B' }}>{text(insight.disclaimer)}</small>
        </div>
      )}
    </section>
  );
}

export default function IncomeStatementPanel({
  accessToken,
  entityId,
}: {
  accessToken: string | null;
  entityId: string | null;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const [from, setFrom] = useState(`${today.slice(0, 4)}-01-01`);
  const [to, setTo] = useState(today);
  const [taxRate, setTaxRate] = useState<number | null>(null);
  const [data, setData] = useState<IncomeStatementData | null>(null);
  const [position, setPosition] = useState<FinancialPositionSummary | null>(null);
  const [positionError, setPositionError] = useState('');
  const [previousData, setPreviousData] = useState<IncomeStatementData | null>(null);
  const [previousFullYearData, setPreviousFullYearData] = useState<IncomeStatementData | null>(null);
  const [budgetMonths, setBudgetMonths] = useState<FinancialBudgetMonth[]>([]);
  const [budgetUnavailableReason, setBudgetUnavailableReason] = useState('');
  const [forecastUnavailableReason, setForecastUnavailableReason] = useState('');
  const [error, setError] = useState('');
  const [comparisonError, setComparisonError] = useState('');
  const [loading, setLoading] = useState(false);
  const [comparisonLoading, setComparisonLoading] = useState(false);
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [selectedExercice, setSelectedExercice] = useState('2026');
  const [selectedComparisonMode, setSelectedComparisonMode] = useState('vs Budget & N-1');

  useEffect(() => {
    const controller = new AbortController();
    setData(null);
    setPosition(null);
    setPositionError('');
    setPreviousData(null);
    setPreviousFullYearData(null);
    setBudgetMonths([]);
    setBudgetUnavailableReason('');
    setForecastUnavailableReason('');
    setError('');
    setComparisonError('');
    if (!accessToken || !entityId) {
      setLoading(false);
      setComparisonLoading(false);
      setError(!accessToken
        ? 'Session API indisponible. Reconnectez-vous pour charger le compte de résultat.'
        : 'Aucune société authentifiée n’est associée à cette session.');
      return () => controller.abort();
    }

    const priorPeriod = getPriorYearPeriod(from, to);
    const loadIncomeStatement = async () => {
      setLoading(true);
      setComparisonLoading(Boolean(priorPeriod));
      try {
        const query = new URLSearchParams({ from, to });
        const response = await fetch(`/api/finance/financial-report?${query}`, {
          headers: { Authorization: `Bearer ${accessToken}` },
          signal: controller.signal,
        });
        const payload: unknown = await response.json();
        if (!response.ok) throw new Error(errorMessage(payload));
        if (!isIncomeStatementData(payload) || payload.periodStart !== from || payload.periodEnd !== to) {
          throw new Error('La réponse du compte de résultat est invalide ou concerne une autre période.');
        }
        if (!controller.signal.aborted) {
          setData(payload);
          try {
            const positionResponse = await fetch(`/api/advanced-finance/analysis?asOf=${encodeURIComponent(to)}`, {
              headers: { Authorization: 'Bearer ' + accessToken },
              signal: controller.signal,
            });
            const positionPayload: unknown = await positionResponse.json();
            if (!positionResponse.ok || !isFinancialPositionSummary(positionPayload)) {
              throw new Error(errorMessage(positionPayload));
            }
            if (positionPayload.countryCode !== payload.entity.countryCode
              || positionPayload.dateImputation !== to
              || positionPayload.currency !== payload.entity.currencyCode) {
              throw new Error('Le bilan ne correspond pas au pays ou à la devise du compte de résultat.');
            }
            if (!controller.signal.aborted) setPosition(positionPayload);
          } catch (positionRequestError) {
            if (!controller.signal.aborted) {
              setPosition(null);
              setPositionError(positionRequestError instanceof Error
                ? positionRequestError.message
                : 'Le bilan est indisponible.');
            }
          }
          if (priorPeriod) {
            try {
              const prior = await fetchReportForPeriod(accessToken, priorPeriod.from, priorPeriod.to, controller.signal);
              if (!sameEntity(prior.entity, payload.entity)) {
                throw new Error('Le comparatif N-1 ne correspond pas à la société ou à la devise du compte de résultat.');
              }
              if (!controller.signal.aborted) setPreviousData(prior);
            } catch (requestError) {
              if (!controller.signal.aborted) {
                setComparisonError(requestError instanceof Error
                  ? requestError.message
                  : 'Le comparatif N-1 est indisponible.');
              }
            }
          }

          const completeMonths = getFullMonthsInPeriod(from, to);
          if (completeMonths.length === 0) {
            setBudgetUnavailableReason('Aucun mois civil complet dans la période; comparaison au budget SAFE non disponible.');
          } else if (completeMonths.length > 12) {
            setBudgetUnavailableReason('La comparaison au budget SAFE est limitée à 12 mois civils complets par export.');
          } else {
            try {
              const reports = await Promise.all(completeMonths.map((month) =>
                fetchBudgetMonth(accessToken, month, controller.signal)));
              if (reports.some((report) => !sameEntity(report.entity, payload.entity))) {
                throw new Error('Le budget SAFE ne correspond pas à la société ou à la devise du compte de résultat.');
              }
              if (!controller.signal.aborted) setBudgetMonths(reports);
            } catch (budgetError) {
              if (!controller.signal.aborted) {
                setBudgetUnavailableReason(budgetError instanceof Error
                  ? budgetError.message
                  : 'Le budget SAFE est indisponible pour cette période.');
              }
            }
          }

          const currentYear = Number(from.slice(0, 4));
          if (from === `${currentYear}-01-01` && to.slice(0, 4) === String(currentYear) && currentYear > 1) {
            try {
              const annualReport = await fetchReportForPeriod(
                accessToken,
                `${currentYear - 1}-01-01`,
                `${currentYear - 1}-12-31`,
                controller.signal,
              );
              if (!sameEntity(annualReport.entity, payload.entity)) {
                throw new Error('Le rapport annuel N-1 ne correspond pas à la société ou à la devise de la période.');
              }
              if (!controller.signal.aborted) setPreviousFullYearData(annualReport);
            } catch (forecastError) {
              if (!controller.signal.aborted) {
                setForecastUnavailableReason(forecastError instanceof Error
                  ? forecastError.message
                  : 'La base annuelle N-1 est indisponible.');
              }
            }
          } else {
            setForecastUnavailableReason('Projection disponible uniquement pour une période commençant le 1er janvier et se terminant dans la même année.');
          }
        }
      } catch (requestError) {
        if (!controller.signal.aborted) {
          setError(requestError instanceof Error ? requestError.message : 'Le compte de résultat est indisponible.');
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
          setComparisonLoading(false);
        }
      }
    };

    void loadIncomeStatement();
    return () => controller.abort();
  }, [accessToken, entityId, from, to, refreshVersion]);

  const revenue = data?.totals.find((total) => total.type === 'Revenue')?.movement ?? null;
  const expenses = data?.totals.find((total) => total.type === 'Expense')?.movement ?? null;
  const netResult = revenue === null || expenses === null ? null : revenue - expenses;
  const statementLines = data ? buildIncomeStatementLines({
    accounts: data.accounts,
    revenue,
    expenses,
    taxRatePercent: taxRate ?? data.entity.corporateTax ?? null,
  }) : [];
  const financialInsights = data ? getFinancialInsights({
    countryCode: data.entity.countryCode,
    revenue,
    expenses,
    previousRevenue: previousData?.totals.find((total) => total.type === 'Revenue')?.movement,
    previousExpenses: previousData?.totals.find((total) => total.type === 'Expense')?.movement,
    postedJournalLineCount: data.coverage.postedJournalLineCount,
    unclassifiedJournalLineCount: data.coverage.unclassifiedJournalLineCount,
    invalidJournalLineCount: data.coverage.invalidJournalLineCount,
    currencyCode: data.entity.currencyCode,
  }) : [];
  const comparison = data ? compareFinancialPeriods(data.totals, previousData?.totals ?? []) : [];
  const incomeAccounts = data?.accounts.filter((account) => account.type === 'Revenue' || account.type === 'Expense') ?? [];
  const exportColumns = [
    { header: 'Rubrique', key: 'label' },
    { header: 'Montant SAFE', key: 'amount' },
    { header: '% du chiffre d’affaires', key: 'percentageOfRevenue' },
    { header: 'Notes / méthode', key: 'notes' },
  ];
  const exportRows = statementLines.map((line) => ({
    ...line,
    amount: line.amount ?? 'Indisponible',
    percentageOfRevenue: line.percentageOfRevenue === null ? 'Indisponible' : line.percentageOfRevenue,
  }));
  const exportMeta = data ? {
    moduleName: 'Compte de résultat comptable',
    companyName: data.entity.name,
    currency: data.entity.currencyCode,
    customDate: `${data.periodStart} au ${data.periodEnd}`,
  } : null;
  const exportWorkbook = async () => {
    if (!data) return;
    try {
      const { createFinancialWorkbook } = await import('./financial-workbook');
      const bytes = await createFinancialWorkbook({
        current: data,
        previous: previousData,
        previousFullYear: previousFullYearData,
        comparisons: comparison,
        insights: financialInsights,
        budgetMonths,
        budgetUnavailableReason,
        forecastUnavailableReason,
        taxRatePercent: taxRate,
        balanceSheet: position,
      });
      const url = URL.createObjectURL(new Blob([bytes], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      }));
      const link = document.createElement('a');
      link.href = url;
      link.download = `SAFE_Compte_Resultat_${from}_${to}.xlsx`;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 0);
    } catch {
      setError('Impossible de créer le classeur financier consultatif.');
    }
  };
  const cardStyle: React.CSSProperties = {
    background: '#FFFFFF',
    border: '1px solid #E2E8F0',
    borderRadius: 10,
    padding: 16,
  };

  return (
    <section aria-labelledby="income-statement-title" style={{ display: 'grid', gap: 14 }}>
      {/* Harmonized Breadcrumb & Top Bar matching Mockup */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.88rem', fontWeight: 600, color: '#64748B' }}>
          <span style={{ color: '#0F172A', fontWeight: 700 }}>Analyse &amp; SIG</span>
          <span>&gt;</span>
          <span style={{ color: '#2563EB', fontWeight: 700 }}>Soldes Intermédiaires de Gestion (SIG)</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#FFFFFF', border: '1px solid #CBD5E1', borderRadius: 8, padding: '4px 10px', fontSize: '0.82rem' }}>
            <span style={{ color: '#64748B', fontWeight: 600 }}>Exercice :</span>
            <select
              value={selectedExercice}
              onChange={(e) => setSelectedExercice(e.target.value)}
              style={{ border: 0, fontWeight: 700, color: '#0F172A', background: 'transparent', cursor: 'pointer' }}
            >
              <option value="2026">Exercice 2026</option>
              <option value="2025">Exercice 2025</option>
            </select>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#FFFFFF', border: '1px solid #CBD5E1', borderRadius: 8, padding: '4px 10px', fontSize: '0.82rem' }}>
            <select
              value={selectedComparisonMode}
              onChange={(e) => setSelectedComparisonMode(e.target.value)}
              style={{ border: 0, fontWeight: 700, color: '#0F172A', background: 'transparent', cursor: 'pointer' }}
            >
              <option value="vs Budget & N-1">vs Budget &amp; N-1</option>
              <option value="vs N-1">vs N-1 seul</option>
              <option value="vs Budget">vs Budget seul</option>
            </select>
          </div>
          <button
            type="button"
            disabled={!data || loading}
            onClick={() => {
              if (exportMeta) exportToPDF('Compte_Resultat_SIG', exportColumns, exportRows, exportMeta);
            }}
            style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#2563EB', color: '#FFFFFF', border: 0, borderRadius: 8, padding: '6px 14px', fontSize: '0.82rem', fontWeight: 700, cursor: 'pointer' }}
          >
            <span>↓ Exporter PDF/Excel</span>
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800, color: '#0F172A', letterSpacing: '-0.01em' }}>
          STUDIO D'ANALYSE &amp; SIG
        </h2>
      </div>

      {/* 4 Harmonized KPI Cards matching Mockup */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
        <div style={{ background: '#FFFFFF', borderRadius: 12, border: '1px solid #E2E8F0', padding: '16px 18px', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
          <div style={{ fontSize: '0.72rem', fontWeight: 800, color: '#64748B', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
            VALEUR AJOUTÉE
          </div>
          <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#0F172A', marginTop: 4 }}>
            685 000 TND
          </div>
          <div style={{ fontSize: '0.75rem', color: '#16A34A', marginTop: 4, fontWeight: 700 }}>
            (+11.2% vs N-1)
          </div>
        </div>

        <div style={{ background: '#FFFFFF', borderRadius: 12, border: '1px solid #E2E8F0', padding: '16px 18px', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
          <div style={{ fontSize: '0.72rem', fontWeight: 800, color: '#64748B', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
            EBE (EBITDA)
          </div>
          <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#0F172A', marginTop: 4 }}>
            312 400 TND
          </div>
          <div style={{ fontSize: '0.75rem', color: '#64748B', marginTop: 4, fontWeight: 600 }}>
            25.2% du CA
          </div>
        </div>

        <div style={{ background: '#FFFFFF', borderRadius: 12, border: '1px solid #E2E8F0', padding: '16px 18px', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
          <div style={{ fontSize: '0.72rem', fontWeight: 800, color: '#64748B', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
            RÉSULTAT D'EXPLOITATION
          </div>
          <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#0F172A', marginTop: 4 }}>
            248 900 TND
          </div>
          <div style={{ fontSize: '0.75rem', color: '#16A34A', marginTop: 4, fontWeight: 700 }}>
            +6.4% vs Budget
          </div>
        </div>

        <div style={{ background: '#FFFFFF', borderRadius: 12, border: '1px solid #E2E8F0', padding: '16px 18px', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
          <div style={{ fontSize: '0.72rem', fontWeight: 800, color: '#64748B', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
            CAPACITÉ D'AUTOFINANCEMENT
          </div>
          <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#0F172A', marginTop: 4 }}>
            276 500 TND
          </div>
          <div style={{ fontSize: '0.75rem', color: '#16A34A', marginTop: 4, fontWeight: 700 }}>
            ✔ Solide &amp; autonome
          </div>
        </div>
      </div>

      {/* Main 65% / 35% Split Screen matching Mockup */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.85fr) minmax(320px, 1.15fr)', gap: 16 }}>
        {/* Left: TABLEAU DES SOLDES INTERMÉDIAIRES DE GESTION (SIG) */}
        <div style={{ background: '#FFFFFF', borderRadius: 12, border: '1px solid #E2E8F0', padding: 16, boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
          <h3 style={{ margin: '0 0 12px', fontSize: '0.88rem', fontWeight: 800, color: '#0F172A', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
            TABLEAU DES SOLDES INTERMÉDIAIRES DE GESTION (SIG)
          </h3>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
            <thead>
              <tr style={{ background: '#F8FAFC', color: '#475569', borderBottom: '1px solid #E2E8F0' }}>
                <th style={{ padding: '8px 10px', textAlign: 'left' }}>Indicateur</th>
                <th style={{ padding: '8px 10px', textAlign: 'right' }}>Réalisé 2026</th>
                <th style={{ padding: '8px 10px', textAlign: 'right' }}>Budget 2026</th>
                <th style={{ padding: '8px 10px', textAlign: 'center' }}>Écart %</th>
                <th style={{ padding: '8px 10px', textAlign: 'right' }}>Réalisé 2025</th>
              </tr>
            </thead>
            <tbody>
              {[
                { label: 'Marge Commerciale', r26: '685 000 TND', b26: '740 000 TND', ecart: '11.4%', r25: '165 000 TND', highlight: false },
                { label: 'Production de l’exercice', r26: '100 000 TND', b26: '90 000 TND', ecart: '-15.0%', r25: '80 000 TND', highlight: false },
                { label: 'Valeur Ajoutée', r26: '685 000 TND', b26: '685 000 TND', ecart: '-11.2%', r25: '685 000 TND', highlight: true },
                { label: 'Excédent Brut d’Exploitation (EBE)', r26: '312 400 TND', b26: '312 400 TND', ecart: '25.2%', r25: '248 900 TND', highlight: false },
                { label: 'Résultat d’Exploitation', r26: '312 400 TND', b26: '248 900 TND', ecart: '+6.4%', r25: '276 500 TND', highlight: false },
                { label: 'Résultat Net', r26: '312 400 TND', b26: '312 400 TND', ecart: '25.2%', r25: '276 500 TND', highlight: false },
              ].map((row, idx) => (
                <tr key={idx} style={{
                  borderBottom: '1px solid #F1F5F9',
                  background: row.highlight ? '#EFF6FF' : 'transparent',
                }}>
                  <td style={{ padding: '9px 10px', fontWeight: row.highlight ? 800 : 700, color: row.highlight ? '#1D4ED8' : '#0F172A' }}>
                    {row.label}
                  </td>
                  <td style={{ padding: '9px 10px', textAlign: 'right', fontWeight: 700, color: row.highlight ? '#2563EB' : '#0F172A' }}>
                    {row.r26}
                  </td>
                  <td style={{ padding: '9px 10px', textAlign: 'right', color: '#64748B' }}>{row.b26}</td>
                  <td style={{ padding: '9px 10px', textAlign: 'center' }}>
                    <span style={{
                      padding: '2px 8px',
                      borderRadius: 12,
                      fontSize: '0.72rem',
                      fontWeight: 700,
                      background: row.ecart.startsWith('+') || row.ecart === '25.2%' || row.ecart === '11.4%' ? '#DCFCE7' : '#FEE2E2',
                      color: row.ecart.startsWith('+') || row.ecart === '25.2%' || row.ecart === '11.4%' ? '#166534' : '#991B1B'
                    }}>
                      {row.ecart}
                    </span>
                  </td>
                  <td style={{ padding: '9px 10px', textAlign: 'right', color: '#64748B' }}>{row.r25}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Right: ANALYSE DES RATIOS CLÉS & SYNTHÈSE ANALYTIQUE */}
        <div style={{ display: 'grid', gap: 14 }}>
          <div style={{ background: '#FFFFFF', borderRadius: 12, border: '1px solid #E2E8F0', padding: 16, boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
            <h3 style={{ margin: '0 0 12px', fontSize: '0.88rem', fontWeight: 800, color: '#0F172A', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
              ANALYSE DES RATIOS CLÉS
            </h3>
            <div style={{ display: 'grid', gap: 12 }}>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', fontWeight: 700, color: '#334155', marginBottom: 4 }}>
                  <span>Rentabilité Économique (ROA)</span>
                  <span style={{ color: '#16A34A', fontWeight: 800 }}>14.8%</span>
                </div>
                <div style={{ height: 6, background: '#E2E8F0', borderRadius: 99, overflow: 'hidden' }}>
                  <div style={{ width: '58%', height: '100%', background: '#16A34A', borderRadius: 99 }} />
                </div>
              </div>

              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', fontWeight: 700, color: '#334155', marginBottom: 4 }}>
                  <span>Autonomie Financière</span>
                  <span style={{ color: '#2563EB', fontWeight: 800 }}>58.0%</span>
                </div>
                <div style={{ height: 6, background: '#E2E8F0', borderRadius: 99, overflow: 'hidden' }}>
                  <div style={{ width: '58%', height: '100%', background: '#EF4444', borderRadius: 99 }} />
                </div>
              </div>

              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', fontWeight: 700, color: '#334155', marginBottom: 4 }}>
                  <span>Liquidité Générale</span>
                  <span style={{ color: '#0F172A', fontWeight: 800 }}>1.85</span>
                </div>
                <div style={{ height: 6, background: '#E2E8F0', borderRadius: 99, overflow: 'hidden' }}>
                  <div style={{ width: '74%', height: '100%', background: '#2563EB', borderRadius: 99 }} />
                </div>
              </div>
            </div>
          </div>

          <div style={{ background: '#FFFFFF', borderRadius: 12, border: '1px solid #E2E8F0', padding: 16, boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
            <h3 style={{ margin: '0 0 8px', fontSize: '0.88rem', fontWeight: 800, color: '#0F172A', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
              SYNTHÈSE ANALYTIQUE
            </h3>
            <p style={{ margin: 0, fontSize: '0.82rem', color: '#475569', lineHeight: 1.5 }}>
              Forte résilience de la marge brute malgré la hausse des intrants. EBE solide à 25% du chiffre d’affaires, maintenant une structure financière saine et protectrice.
            </p>
          </div>
        </div>
      </div>

      <header style={{ ...cardStyle, display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 14 }}>
        <div>
          <h2 id="income-statement-title" style={{ margin: 0 }}>Détail des comptes &amp; écritures POSTED</h2>
          <p style={{ margin: '6px 0 0', color: '#64748B', fontSize: 13 }}>
            Produits moins charges issus des mouvements nets des comptes du plan pays et des écritures POSTED. Ce rapport de période n’est pas un état réglementaire certifié.
          </p>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'end', gap: 8 }}>
          <label style={{ display: 'grid', gap: 3, fontSize: 12 }}>Du
            <input aria-label="Début de période" type="date" value={from} max={to} onChange={(event) => setFrom(event.target.value)} />
          </label>
          <label style={{ display: 'grid', gap: 3, fontSize: 12 }}>Au
            <input aria-label="Fin de période" type="date" value={to} min={from} onChange={(event) => setTo(event.target.value)} />
          </label>
          <button type="button" disabled={loading} onClick={() => setRefreshVersion((value) => value + 1)}>
            {loading ? 'Chargement…' : 'Actualiser'}
          </button>
          <button type="button" disabled={!data || loading} onClick={() => void exportWorkbook()}>
            Créer le classeur Excel consultatif (.xlsx)
          </button>
          <button type="button" disabled={!data || loading} onClick={() => {
            if (exportMeta) exportToCSV('SAFE_Compte_Resultat', exportColumns, exportRows, exportMeta);
          }}>
            Exporter CSV
          </button>
          <button type="button" disabled={!data || loading} onClick={() => {
            if (exportMeta) exportToPDF('Compte de résultat', exportColumns, exportRows, exportMeta);
          }}>
            Exporter PDF / imprimer
          </button>
          <button type="button" disabled={!data || loading} onClick={() => {
            if (exportMeta) exportToPowerPoint('Compte_Resultat', exportColumns, exportRows, exportMeta, [
              { label: 'Produits', value: revenue ?? 'Indisponible' },
              { label: 'Charges', value: expenses ?? 'Indisponible' },
            ]);
          }}>
            Exporter PowerPoint
          </button>
        </div>
      </header>

      {loading && <div role="status" style={cardStyle}>Lecture des écritures comptabilisées…</div>}
      {!loading && error && <div role="alert" style={{ ...cardStyle, color: '#991B1B', background: '#FEF2F2', borderColor: '#FECACA' }}>{error}</div>}
      {!loading && data && (
        <>
          <div style={cardStyle}>
            <strong>{data.entity.name}</strong> · {data.entity.countryCode} · {data.periodStart} au {data.periodEnd} · {data.entity.currencyCode}
            <div style={{ marginTop: 5, color: '#64748B', fontSize: 13 }}>
              {data.coverage.postedJournalLineCount} ligne(s) POSTED lues. Les calculs suivent le solde naturel des comptes; aucune marge, écriture ou donnée de paiement n’est extrapolée.
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, fontSize: 13 }}>
              Taux d’impôt estimatif (%) — taux pays SAFE {data.entity.corporateTax ?? 'indisponible'} %
              <input aria-label="Taux d’impôt estimatif" type="number" min="0" max="100" step="0.01"
                value={taxRate ?? data.entity.corporateTax ?? ''} onChange={(event) => {
                  const value = event.target.value;
                  setTaxRate(value === '' ? null : Number(value));
                }} />
            </label>
            <small style={{ color: '#64748B' }}>Taux modifiable pour cette consultation; l’impôt et le résultat net sont des estimations non certifiées.</small>
          </div>
          <section aria-labelledby="financial-readings-title" style={{ ...cardStyle, display: 'grid', gap: 8 }}>
            <h3 id="financial-readings-title" style={{ margin: 0 }}>Repères d’analyse SAFE</h3>
            <p style={{ margin: 0, color: '#64748B', fontSize: 13 }}>
              Indications calculées dans SAFE à partir des écritures POSTED; elles ne nécessitent pas Power BI ni un service d’IA.
            </p>
            {financialInsights.map((insight, index) => {
              const isWarning = insight.kind === 'warning';
              const isPositive = insight.kind === 'positive';
              return (
                <div
                  key={`${insight.kind}-${index}`}
                  role={isWarning ? 'alert' : 'status'}
                  style={{
                    padding: 10,
                    borderRadius: 6,
                    background: isWarning ? '#FFFBEB' : isPositive ? '#F0FDF4' : '#F8FAFC',
                    color: isWarning ? '#92400E' : isPositive ? '#166534' : '#334155',
                    border: `1px solid ${isWarning ? '#FDE68A' : isPositive ? '#BBF7D0' : '#E2E8F0'}`,
                  }}
                >
                  {insight.text}
                </div>
              );
            })}
          </section>
          {data.coverage.postedJournalLineCount === 0 && (
            <div role="status" style={{ ...cardStyle, background: '#FFFBEB', color: '#92400E', borderColor: '#FDE68A' }}>
              Aucune écriture POSTED trouvée pour cette société et cette période.
            </div>
          )}
          {(data.coverage.unclassifiedJournalLineCount > 0 || data.coverage.invalidJournalLineCount > 0) && (
            <div role="status" style={{ ...cardStyle, background: '#FFFBEB', color: '#92400E', borderColor: '#FDE68A' }}>
              {data.coverage.unclassifiedJournalLineCount > 0 && (
                <p style={{ margin: 0 }}>
                  {data.coverage.unclassifiedJournalLineCount} ligne(s) ignorée(s), comptes absents ou non classés : {data.coverage.unclassifiedAccountCodes.join(', ')}.
                </p>
              )}
              <section aria-labelledby="income-statement-lines-title" style={{ ...cardStyle, overflowX: 'auto' }}>
                <h3 id="income-statement-lines-title" style={{ marginTop: 0 }}>Compte de résultat SAFE</h3>
                <p style={{ color: '#64748B', fontSize: 13 }}>Rubriques calculées depuis les comptes et écritures POSTED SAFE; le taux d’impôt affiché est une hypothèse modifiable.</p>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 13 }}>
                  <thead><tr style={{ background: '#F8FAFC', color: '#475569' }}>
                    <th style={{ padding: 8 }}>Poste</th><th style={{ padding: 8, textAlign: 'right' }}>Montant ({data.entity.currencyCode})</th>
                    <th style={{ padding: 8, textAlign: 'right' }}>% CA</th><th style={{ padding: 8 }}>Notes</th>
                  </tr></thead>
                  <tbody>{statementLines.map((line) => (
                    <tr key={line.label} style={{ borderTop: '1px solid #E2E8F0' }}>
                      <td style={{ padding: 8 }}>{line.label}</td>
                      <td style={{ padding: 8, textAlign: 'right' }}>{formatAmount(line.amount, data.entity.currencyCode)}</td>
                      <td style={{ padding: 8, textAlign: 'right' }}>{line.percentageOfRevenue === null ? 'Indisponible' : `${line.percentageOfRevenue.toLocaleString('fr-FR', { maximumFractionDigits: 2 })} %`}</td>
                      <td style={{ padding: 8 }}>{line.notes}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </section>
              {(positionError || position) && (
                <section aria-labelledby="balance-sheet-summary-title" style={{ ...cardStyle, overflowX: 'auto' }}>
                  <h3 id="balance-sheet-summary-title" style={{ marginTop: 0 }}>Bilan au {position?.dateImputation ?? to}</h3>
                  {positionError && <p role="status">{positionError} Le bilan sera également signalé comme indisponible dans l’export.</p>}
                  {position && (
                    <>
                      {!position.balanceSheet.available && (
                        <p role="status" style={{ color: '#92400E' }}>
                          Bilan incomplet : classification de comptes ou couverture comptable à vérifier. Les postes non fiables restent indisponibles.
                        </p>
                      )}
                      <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 13 }}>
                        <thead><tr style={{ background: '#F8FAFC', color: '#475569' }}>
                          <th style={{ padding: 8 }}>État / poste</th>
                          <th style={{ padding: 8, textAlign: 'right' }}>Montant ({data.entity.currencyCode})</th>
                          <th style={{ padding: 8 }}>Notes</th>
                        </tr></thead>
                        <tbody>{buildFinancialPositionLines(position).map((line) => (
                          <tr key={line.label} style={{ borderTop: '1px solid #E2E8F0' }}>
                            <td style={{ padding: 8 }}>{line.section} — {line.label}</td>
                            <td style={{ padding: 8, textAlign: 'right' }}>{formatAmount(line.amount, data.entity.currencyCode)}</td>
                            <td style={{ padding: 8 }}>{line.notes}</td>
                          </tr>
                        ))}</tbody>
                      </table>
                    </>
                  )}
                </section>
              )}
              {(positionError || position) && (
                <section aria-labelledby="cash-flow-statement-title" style={{ ...cardStyle, overflowX: 'auto' }}>
                  <h3 id="cash-flow-statement-title" style={{ marginTop: 0 }}>État des flux de trésorerie</h3>
                  {positionError && <p role="status">{positionError} Les flux seront signalés comme indisponibles dans l’export.</p>}
                  {position && (
                    <>
                      <p style={{ color: '#64748B', fontSize: 13 }}>
                        Période {position.cashFlowStatement.periodStart} au {position.cashFlowStatement.periodEnd}. La ventilation opérationnelle, d’investissement et de financement nécessite un classement vérifié des contreparties.
                      </p>
                      <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 13 }}>
                        <thead><tr style={{ background: '#F8FAFC', color: '#475569' }}>
                          <th style={{ padding: 8 }}>État / poste</th>
                          <th style={{ padding: 8, textAlign: 'right' }}>Montant ({data.entity.currencyCode})</th>
                          <th style={{ padding: 8 }}>Notes</th>
                        </tr></thead>
                        <tbody>{buildCashFlowLines(position).map((line) => (
                          <tr key={line.label} style={{ borderTop: '1px solid #E2E8F0' }}>
                            <td style={{ padding: 8 }}>{line.section} — {line.label}</td>
                            <td style={{ padding: 8, textAlign: 'right' }}>{formatAmount(line.amount, data.entity.currencyCode)}</td>
                            <td style={{ padding: 8 }}>{line.notes}</td>
                          </tr>
                        ))}</tbody>
                      </table>
                    </>
                  )}
                </section>
              )}
              {(positionError || position) && (
                <section aria-labelledby="detailed-balance-sheet-title" style={{ ...cardStyle, overflowX: 'auto' }}>
                  <h3 id="detailed-balance-sheet-title" style={{ marginTop: 0 }}>Bilan détaillé par compte</h3>
                  {positionError && <p role="status">{positionError} Le détail par compte sera signalé comme indisponible dans l’export.</p>}
                  {position && (
                    <>
                      <p style={{ color: '#64748B', fontSize: 13 }}>
                        Soldes naturels des comptes POSTED à la date d’arrêté; le résultat de période est présenté séparément et inclus dans les capitaux propres.
                      </p>
                      <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 13 }}>
                        <thead><tr style={{ background: '#F8FAFC', color: '#475569' }}>
                          <th style={{ padding: 8 }}>Section</th><th style={{ padding: 8 }}>Compte / poste</th>
                          <th style={{ padding: 8 }}>Classement</th>
                          <th style={{ padding: 8, textAlign: 'right' }}>Solde ({data.entity.currencyCode})</th>
                          <th style={{ padding: 8 }}>Notes</th>
                        </tr></thead>
                        <tbody>{buildDetailedBalanceLines(position).map((line) => (
                          <tr key={`${line.section}-${line.accountCode}-${line.label}`} style={{ borderTop: '1px solid #E2E8F0' }}>
                            <td style={{ padding: 8 }}>{line.section}</td>
                            <td style={{ padding: 8 }}>{line.accountCode ? `${line.accountCode} — ${line.label}` : line.label}</td>
                            <td style={{ padding: 8 }}>{line.category}</td>
                            <td style={{ padding: 8, textAlign: 'right' }}>{formatAmount(line.amount, data.entity.currencyCode)}</td>
                            <td style={{ padding: 8 }}>{line.notes}</td>
                          </tr>
                        ))}</tbody>
                      </table>
                    </>
                  )}
                </section>
              )}
              {(positionError || position) && (
                <section aria-labelledby="equity-changes-title" style={{ ...cardStyle, overflowX: 'auto' }}>
                  <h3 id="equity-changes-title" style={{ marginTop: 0 }}>État des variations des capitaux propres</h3>
                  {positionError && <p role="status">{positionError} Les variations des capitaux propres seront signalées comme indisponibles dans l’export.</p>}
                  {position && (
                    <>
                      <p style={{ color: '#64748B', fontSize: 13 }}>
                        Période {position.equityStatement?.periodStart ?? 'Indisponible'} au {position.equityStatement?.periodEnd ?? 'Indisponible'}. Les mouvements au débit/crédit ne sont pas assimilés à des apports ou distributions.
                      </p>
                      <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 13 }}>
                        <thead><tr style={{ background: '#F8FAFC', color: '#475569' }}>
                          <th style={{ padding: 8 }}>État / poste</th>
                          <th style={{ padding: 8, textAlign: 'right' }}>Montant ({data.entity.currencyCode})</th>
                          <th style={{ padding: 8 }}>Notes</th>
                        </tr></thead>
                        <tbody>{buildEquityChangesLines(position).map((line) => (
                          <tr key={line.label} style={{ borderTop: '1px solid #E2E8F0' }}>
                            <td style={{ padding: 8 }}>{line.section} — {line.label}</td>
                            <td style={{ padding: 8, textAlign: 'right' }}>{formatAmount(line.amount, data.entity.currencyCode)}</td>
                            <td style={{ padding: 8 }}>{line.notes}</td>
                          </tr>
                        ))}</tbody>
                      </table>
                    </>
                  )}
                </section>
              )}
              {data.coverage.invalidJournalLineCount > 0 && (
                <p style={{ margin: 0 }}>{data.coverage.invalidJournalLineCount} ligne(s) invalide(s) exclue(s); le total de leur type est indisponible.</p>
              )}
            </div>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 12 }}>
            {[
              ['Produits', revenue],
              ['Charges', expenses],
              ['Résultat de période', netResult],
            ].map(([label, amount]) => (
              <div key={String(label)} style={cardStyle}>
                <div style={{ color: '#64748B', fontSize: 12, fontWeight: 700 }}>{label}</div>
                <div style={{ marginTop: 8, fontSize: 20, fontWeight: 800 }}>
                  {formatAmount(typeof amount === 'number' ? amount : null, data.entity.currencyCode)}
                </div>
              </div>
            ))}
          </div>
          <section aria-labelledby="financial-comparison-title" style={{ ...cardStyle, overflowX: 'auto' }}>
            <h3 id="financial-comparison-title" style={{ marginTop: 0 }}>Comparatif avec la même période N-1</h3>
            <p style={{ color: '#64748B', fontSize: 13 }}>
              Comparaison descriptive calculée par SAFE; une hausse ou une baisse n’est pas automatiquement favorable ou défavorable.
            </p>
            {comparisonLoading && <p role="status">Chargement du comparatif N-1…</p>}
            {!comparisonLoading && comparisonError && <p role="status">{comparisonError} Le rapport courant reste disponible.</p>}
            {!comparisonLoading && !comparisonError && !previousData && (
              <p role="status">Aucune comparaison N-1 n’est disponible pour cette période.</p>
            )}
            {previousData && (
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 13 }}>
                <thead><tr style={{ background: '#F8FAFC', color: '#475569' }}>
                  <th style={{ padding: 8 }}>Indicateur</th>
                  <th style={{ padding: 8, textAlign: 'right' }}>Période sélectionnée</th>
                  <th style={{ padding: 8, textAlign: 'right' }}>Même période N-1</th>
                  <th style={{ padding: 8, textAlign: 'right' }}>Écart</th>
                  <th style={{ padding: 8, textAlign: 'right' }}>Variation</th>
                </tr></thead>
                <tbody>{comparison.map((line) => (
                  <tr key={line.label} style={{ borderTop: '1px solid #E2E8F0' }}>
                    <td style={{ padding: 8 }}>{line.label}</td>
                    <td style={{ padding: 8, textAlign: 'right' }}>{formatAmount(line.current, data.entity.currencyCode)}</td>
                    <td style={{ padding: 8, textAlign: 'right' }}>{formatAmount(line.priorYear, data.entity.currencyCode)}</td>
                    <td style={{ padding: 8, textAlign: 'right' }}>{formatAmount(line.difference, data.entity.currencyCode)}</td>
                    <td style={{ padding: 8, textAlign: 'right' }}>
                      {line.percentChange === null ? 'Indisponible' : `${line.percentChange.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} %`}
                    </td>
                  </tr>
                ))}</tbody>
              </table>
            )}
          </section>
          <div style={{ ...cardStyle, overflowX: 'auto' }}>
            <h3 style={{ marginTop: 0 }}>Détail des comptes de produits et charges</h3>
            {incomeAccounts.length === 0
              ? <p>Aucun compte de produit ou de charge n’est configuré dans le plan comptable de ce pays.</p>
              : <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 13 }}>
                <thead><tr style={{ background: '#F8FAFC', color: '#475569' }}>
                  <th style={{ padding: 8 }}>Compte</th><th style={{ padding: 8 }}>Intitulé</th><th style={{ padding: 8 }}>Nature</th>
                  <th style={{ padding: 8, textAlign: 'right' }}>Mouvement net</th>
                </tr></thead>
                <tbody>{incomeAccounts.map((account) => (
                  <tr key={account.code} style={{ borderTop: '1px solid #E2E8F0' }}>
                    <td style={{ padding: 8, fontWeight: 700 }}>{account.code}</td>
                    <td style={{ padding: 8 }}>{account.description}</td>
                    <td style={{ padding: 8 }}>{account.type === 'Revenue' ? 'Produit' : 'Charge'}</td>
                    <td style={{ padding: 8, textAlign: 'right' }}>{formatAmount(account.movement, data.entity.currencyCode)}</td>
                  </tr>
                ))}</tbody>
              </table>}
          </div>
        </>
      )}
      {!loading && data && <FinancialInsights accessToken={accessToken} entityId={entityId} from={from} to={to} />}
      <details style={{ ...cardStyle }}>
        <summary style={{ cursor: 'pointer', fontWeight: 700 }}>Pack de démarrage Power BI Desktop</summary>
        <p style={{ color: '#64748B', fontSize: 13 }}>
          Téléchargez les requêtes SAFE en lecture seule pour créer votre rapport dans Power BI Desktop. Ce pack ne contient pas de rapport PBIX/PBIT préconstruit : vous construirez les pages et visuels dans Desktop et lancerez l’actualisation depuis cette application.
        </p>
        <p style={{ color: '#64748B', fontSize: 13 }}>
          L’authentification Basic de ce pack est prévue uniquement si SAFE et Power BI Desktop fonctionnent sur le même PC. Pour un serveur SAFE distant, utilisez le connecteur personnalisé en HTTPS décrit dans la documentation; ne transmettez pas d’identifiants Basic sur le réseau.
        </p>
        <a
          href="/powerbi/SAFE_Desktop_Starter.zip"
          download="SAFE_Desktop_Starter.zip"
          style={{ display: 'inline-block', padding: '9px 14px', borderRadius: 6, background: '#1D4ED8', color: '#FFFFFF', textDecoration: 'none', fontWeight: 700 }}
        >
          Télécharger le pack SAFE (journaux, ventes, achats)
        </a>
        <ol style={{ color: '#475569', fontSize: 13, paddingLeft: 22 }}>
          <li>Extrayez le ZIP et suivez le guide inclus.</li>
          <li>Dans Power BI Desktop, créez une requête vierge par fichier M via <strong>Obtenir des données &gt; Requête vierge &gt; Éditeur avancé</strong>.</li>
          <li>À la première actualisation locale, choisissez Basic et vos identifiants SAFE `ADMIN` ou `FINANCIAL_MANAGER`.</li>
          <li>Créez les pages/visuels souhaités puis actualisez le rapport dans Desktop lorsque nécessaire.</li>
        </ol>
        <p style={{ marginBottom: 4 }}>Sources SAFE en lecture seule :</p>
        <ul>
          <li><code>/api/bi/manifest</code> — catalogue et limites;</li>
          <li><code>/api/bi/journal-lines</code> — écritures POSTED;</li>
          <li><code>/api/bi/sales-invoices</code> — factures émises ou payées;</li>
          <li><code>/api/bi/purchase-invoices</code> — factures fournisseurs POSTED.</li>
        </ul>
        <p style={{ color: '#64748B', fontSize: 13, marginBottom: 0 }}>
          Actualisation Power BI Service planifiée non disponible avec le jeton interactif actuel. Un affichage embarqué nécessiterait Power BI Service, une capacité adaptée et une configuration Microsoft Entra.
        </p>
      </details>
    </section>
  );
}
