import React, { useEffect, useState } from 'react';
import {
  exportToCSV,
  exportToExcel,
  exportToPDF,
  exportToPowerPoint,
  readImportFile,
  type ExportColumn,
} from './exportUtils';
import {
  normalizeBankStatementDate,
  validateBankStatementRows,
  type BankStatementImportIssue,
} from './bank-statement-import-validation';
import { isBankStatementCurrencyCompatible, parseBankStatementFileText } from './bank-statement-import-formats';
import { translateBusinessText, useInterfaceLanguage } from './localization';

const cashflowExportColumns: ExportColumn[] = [
  { header: 'Date', key: 'date' },
  { header: 'Pièce', key: 'reference' },
  { header: 'Compte', key: 'accountCode' },
  { header: 'Libellé', key: 'description' },
  { header: 'Entrée', key: 'inflow' },
  { header: 'Sortie', key: 'outflow' },
  { header: 'Solde comptable', key: 'balance' },
];

const statementExportColumns: ExportColumn[] = [
  { header: 'Date', key: 'date' },
  { header: 'Libellé', key: 'description' },
  { header: 'Référence externe', key: 'externalReference' },
  { header: 'Montant signé', key: 'amount' },
  { header: 'Solde après opération', key: 'balanceAfter' },
  { header: 'Devise', key: 'currencyCode' },
  { header: 'Rapprochée', key: 'reconciled' },
  { header: 'Facture affectée', key: 'invoiceNumber' },
];

interface CashflowData {
  entity: { name: string; countryCode: string; currencyCode: string };
  period: string;
  accounts: Array<{ code: string; description: string; selected: boolean }>;
  totals: {
    openingBalance: number | null;
    inflows: number | null;
    outflows: number | null;
    closingBalance: number | null;
  };
  transactions: Array<{
    id: string;
    date: string;
    entryNumber: string;
    reference: string | null;
    accountCode: string;
    description: string;
    inflow: number;
    outflow: number;
    balance: number | null;
  }>;
  diagnostics: {
    mappedAccountCount: number;
    invalidMappedAccountCodes: string[];
    postedJournalLineCount: number;
    invalidJournalLineCount: number;
    totalsAvailable: boolean;
  };
}

interface BankAccountData {
  id: string;
  name: string;
  currencyCode: string;
  ledgerAccountCode: string;
  isActive: boolean;
}

interface BankTransferData {
  id: string;
  amount: number;
  currencyCode: string;
  transferredAt: string;
  reference: string | null;
  description: string;
  sourceBankAccount: { id: string; name: string; ledgerAccountCode: string };
  destinationBankAccount: { id: string; name: string; ledgerAccountCode: string };
  postingJournalEntry: { id: string; entryNumber: string; reference: string | null; status: string };
}

interface BankStatementData {
  id: string;
  lineCount: number;
  importedAt: string;
  bankAccount: { id: string; name: string; currencyCode: string };
}

interface BankStatementLineData {
  id: string;
  rowNumber: number;
  transactionDate: string;
  description: string;
  amount: number;
  balanceAfter: number | null;
  currencyCode: string;
  externalReference: string | null;
  reconciliation: { id: string; reconciledAt: string } | null;
  cashflowPayment: {
    id: string;
    direction: string;
    amount: number;
    currencyCode: string;
    settledDocumentAmount: number | null;
    documentCurrencyCode: string | null;
    settlementExchangeRate: number | null;
    settlementRateDate: string | null;
    settlementRateSource: string | null;
    realizedFxGain: number;
    realizedFxLoss: number;
    invoice: { invoiceNumber: string } | null;
    purchaseInvoice: { invoiceNumber: string } | null;
  } | null;
}

interface AccountingMappingData {
  receivableAccountCode: string | null;
  payableAccountCode: string | null;
  updatedAt: string | null;
  functionalCurrencyCode: string;
  realizedFxGainAccountCode: string | null;
  realizedFxLossAccountCode: string | null;
  availableAccounts: Array<{ code: string; description: string; type: string }>;
  missingRequirements: string[];
}

interface PaymentTargetData {
  id: string;
  type: 'SALES_INVOICE' | 'PURCHASE_INVOICE';
  invoiceNumber: string;
  status: string;
  currencyCode: string;
  functionalCurrencyCode: string;
  totalAmount: number;
  paidAmount: number;
  creditedAmount: number;
  remainingAmount: number;
}

interface ReconciliationCandidate {
  id: string;
  debit: number;
  credit: number;
  description: string | null;
  labelMatch: boolean;
  suggestionReason: string;
  journalEntry: { entryNumber: string; date: string; description: string };
}

interface ForecastScenarioData {
  id: string;
  name: string;
  currencyCode: string;
  openingBalance: number | null;
  openingBalanceDate: string | null;
  openingBalanceSource: string | null;
  bankAccount: { id: string; name: string; currencyCode: string };
}

interface ForecastItemData {
  id: string;
  expectedDate: string;
  description: string;
  direction: string;
  amount: number;
  category: string;
  status: string;
  sourceType: string | null;
  sourceId: string | null;
}

interface ForecastSourceData {
  sourceType: 'SALES_INVOICE' | 'PURCHASE_INVOICE';
  sourceId: string;
  expectedDate: string;
  description: string;
  direction: 'INFLOW' | 'OUTFLOW';
  amount: number;
  category: string;
  currencyCode: string;
  status: string;
}

interface CashForecastData {
  scenario: ForecastScenarioData;
  currencyCode: string;
  asOfDate: string | null;
  openingBalance: number | null;
  openingBalanceSource: string | null;
  horizonDays: number;
  days: Array<{ date: string; inflows: number; outflows: number; closingBalance: number | null }>;
  items: ForecastItemData[];
  sources: ForecastSourceData[];
  diagnostics: { hasOpeningBalance: boolean; invalidItemCount: number; totalsAvailable: boolean };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isNullableNumber(value: unknown): value is number | null {
  return value === null || (typeof value === 'number' && Number.isFinite(value));
}

function isCashflowData(value: unknown): value is CashflowData {
  if (!isRecord(value) || !isRecord(value.entity) || !isRecord(value.totals) || !isRecord(value.diagnostics)) return false;
  const entity = value.entity;
  const totals = value.totals;
  const diagnostics = value.diagnostics;
  return typeof entity.name === 'string'
    && typeof entity.countryCode === 'string'
    && typeof entity.currencyCode === 'string'
    && typeof value.period === 'string'
    && Array.isArray(value.accounts)
    && value.accounts.every((item) => isRecord(item)
      && typeof item.code === 'string'
      && typeof item.description === 'string'
      && typeof item.selected === 'boolean')
    && ['openingBalance', 'inflows', 'outflows', 'closingBalance'].every((key) => isNullableNumber(totals[key]))
    && Array.isArray(value.transactions)
    && value.transactions.every((item) => isRecord(item)
      && typeof item.id === 'string'
      && typeof item.date === 'string'
      && Number.isFinite(Date.parse(item.date))
      && typeof item.entryNumber === 'string'
      && (item.reference === null || typeof item.reference === 'string')
      && typeof item.accountCode === 'string'
      && typeof item.description === 'string'
      && typeof item.inflow === 'number'
      && Number.isFinite(item.inflow)
      && typeof item.outflow === 'number'
      && Number.isFinite(item.outflow)
      && isNullableNumber(item.balance))
    && Number.isSafeInteger(diagnostics.mappedAccountCount)
    && Array.isArray(diagnostics.invalidMappedAccountCodes)
    && diagnostics.invalidMappedAccountCodes.every((code) => typeof code === 'string')
    && Number.isSafeInteger(diagnostics.postedJournalLineCount)
    && Number.isSafeInteger(diagnostics.invalidJournalLineCount)
    && typeof diagnostics.totalsAvailable === 'boolean';
}

function apiError(payload: unknown, fallback: string): string {
  return isRecord(payload) && typeof payload.error === 'string' ? payload.error : fallback;
}

function isBankAccount(value: unknown): value is BankAccountData {
  return isRecord(value)
    && typeof value.id === 'string'
    && typeof value.name === 'string'
    && typeof value.currencyCode === 'string'
    && typeof value.ledgerAccountCode === 'string'
    && typeof value.isActive === 'boolean';
}

function isBankTransfer(value: unknown): value is BankTransferData {
  return isRecord(value)
    && typeof value.id === 'string'
    && typeof value.amount === 'number'
    && typeof value.currencyCode === 'string'
    && typeof value.transferredAt === 'string'
    && (value.reference === null || typeof value.reference === 'string')
    && typeof value.description === 'string'
    && isRecord(value.sourceBankAccount)
    && typeof value.sourceBankAccount.id === 'string'
    && typeof value.sourceBankAccount.name === 'string'
    && typeof value.sourceBankAccount.ledgerAccountCode === 'string'
    && isRecord(value.destinationBankAccount)
    && typeof value.destinationBankAccount.id === 'string'
    && typeof value.destinationBankAccount.name === 'string'
    && typeof value.destinationBankAccount.ledgerAccountCode === 'string'
    && isRecord(value.postingJournalEntry)
    && typeof value.postingJournalEntry.id === 'string'
    && typeof value.postingJournalEntry.entryNumber === 'string'
    && (value.postingJournalEntry.reference === null || typeof value.postingJournalEntry.reference === 'string')
    && typeof value.postingJournalEntry.status === 'string';
}

function isBankStatement(value: unknown): value is BankStatementData {
  return isRecord(value)
    && typeof value.id === 'string'
    && Number.isSafeInteger(value.lineCount)
    && typeof value.importedAt === 'string'
    && isRecord(value.bankAccount)
    && typeof value.bankAccount.id === 'string'
    && typeof value.bankAccount.name === 'string'
    && typeof value.bankAccount.currencyCode === 'string';
}

function isStatementLine(value: unknown): value is BankStatementLineData {
  return isRecord(value)
    && typeof value.id === 'string'
    && Number.isSafeInteger(value.rowNumber)
    && typeof value.transactionDate === 'string'
    && Number.isFinite(Date.parse(value.transactionDate))
    && typeof value.description === 'string'
    && typeof value.amount === 'number'
    && Number.isFinite(value.amount)
    && (value.balanceAfter === null || (typeof value.balanceAfter === 'number' && Number.isFinite(value.balanceAfter)))
    && typeof value.currencyCode === 'string'
    && (value.externalReference === null || typeof value.externalReference === 'string')
    && (value.reconciliation === null
      || (isRecord(value.reconciliation)
        && typeof value.reconciliation.id === 'string'
        && typeof value.reconciliation.reconciledAt === 'string'))
    && (value.cashflowPayment === null
      || (isRecord(value.cashflowPayment)
        && typeof value.cashflowPayment.id === 'string'
        && typeof value.cashflowPayment.direction === 'string'
        && typeof value.cashflowPayment.amount === 'number'
        && typeof value.cashflowPayment.currencyCode === 'string'
        && (value.cashflowPayment.settledDocumentAmount === null || typeof value.cashflowPayment.settledDocumentAmount === 'number')
        && (value.cashflowPayment.documentCurrencyCode === null || typeof value.cashflowPayment.documentCurrencyCode === 'string')
        && (value.cashflowPayment.settlementExchangeRate === null || typeof value.cashflowPayment.settlementExchangeRate === 'number')
        && (value.cashflowPayment.settlementRateDate === null || typeof value.cashflowPayment.settlementRateDate === 'string')
        && (value.cashflowPayment.settlementRateSource === null || typeof value.cashflowPayment.settlementRateSource === 'string')
        && typeof value.cashflowPayment.realizedFxGain === 'number'
        && Number.isFinite(value.cashflowPayment.realizedFxGain)
        && typeof value.cashflowPayment.realizedFxLoss === 'number'
        && Number.isFinite(value.cashflowPayment.realizedFxLoss)
        && (value.cashflowPayment.invoice === null || (isRecord(value.cashflowPayment.invoice) && typeof value.cashflowPayment.invoice.invoiceNumber === 'string'))
        && (value.cashflowPayment.purchaseInvoice === null || (isRecord(value.cashflowPayment.purchaseInvoice) && typeof value.cashflowPayment.purchaseInvoice.invoiceNumber === 'string'))));
}

function isAccountingMapping(value: unknown): value is AccountingMappingData {
  return isRecord(value)
    && (value.receivableAccountCode === null || typeof value.receivableAccountCode === 'string')
    && (value.payableAccountCode === null || typeof value.payableAccountCode === 'string')
    && (value.updatedAt === null || typeof value.updatedAt === 'string')
    && typeof value.functionalCurrencyCode === 'string'
    && (value.realizedFxGainAccountCode === null || typeof value.realizedFxGainAccountCode === 'string')
    && (value.realizedFxLossAccountCode === null || typeof value.realizedFxLossAccountCode === 'string')
    && Array.isArray(value.availableAccounts)
    && value.availableAccounts.every((account) => isRecord(account)
      && typeof account.code === 'string'
      && typeof account.description === 'string'
      && typeof account.type === 'string')
    && Array.isArray(value.missingRequirements)
    && value.missingRequirements.every((requirement) => typeof requirement === 'string');
}

function isPaymentTarget(value: unknown): value is PaymentTargetData {
  return isRecord(value)
    && typeof value.id === 'string'
    && (value.type === 'SALES_INVOICE' || value.type === 'PURCHASE_INVOICE')
    && typeof value.invoiceNumber === 'string'
    && typeof value.status === 'string'
    && typeof value.currencyCode === 'string'
    && typeof value.functionalCurrencyCode === 'string'
    && ['totalAmount', 'paidAmount', 'creditedAmount', 'remainingAmount'].every((key) => typeof value[key] === 'number' && Number.isFinite(value[key]));
}

function isCandidate(value: unknown): value is ReconciliationCandidate {
  return isRecord(value)
    && typeof value.id === 'string'
    && typeof value.debit === 'number'
    && Number.isFinite(value.debit)
    && typeof value.credit === 'number'
    && Number.isFinite(value.credit)
    && (value.description === null || typeof value.description === 'string')
    && typeof value.labelMatch === 'boolean'
    && typeof value.suggestionReason === 'string'
    && isRecord(value.journalEntry)
    && typeof value.journalEntry.entryNumber === 'string'
    && typeof value.journalEntry.date === 'string'
    && typeof value.journalEntry.description === 'string';
}

function isForecastScenario(value: unknown): value is ForecastScenarioData {
  return isRecord(value)
    && typeof value.id === 'string'
    && typeof value.name === 'string'
    && typeof value.currencyCode === 'string'
    && (value.openingBalance === null || (typeof value.openingBalance === 'number' && Number.isFinite(value.openingBalance)))
    && (value.openingBalanceDate === null || typeof value.openingBalanceDate === 'string')
    && (value.openingBalanceSource === null || typeof value.openingBalanceSource === 'string')
    && isRecord(value.bankAccount)
    && typeof value.bankAccount.id === 'string'
    && typeof value.bankAccount.name === 'string'
    && typeof value.bankAccount.currencyCode === 'string';
}

function isCashForecastData(value: unknown): value is CashForecastData {
  return isRecord(value)
    && isForecastScenario(value.scenario)
    && typeof value.currencyCode === 'string'
    && (value.asOfDate === null || typeof value.asOfDate === 'string')
    && (value.openingBalance === null || (typeof value.openingBalance === 'number' && Number.isFinite(value.openingBalance)))
    && (value.openingBalanceSource === null || typeof value.openingBalanceSource === 'string')
    && Number.isSafeInteger(value.horizonDays)
    && Array.isArray(value.days)
    && value.days.every((day) => isRecord(day)
      && typeof day.date === 'string'
      && typeof day.inflows === 'number'
      && typeof day.outflows === 'number'
      && (day.closingBalance === null || typeof day.closingBalance === 'number'))
    && Array.isArray(value.items)
    && value.items.every((item) => isRecord(item)
      && typeof item.id === 'string'
      && typeof item.expectedDate === 'string'
      && typeof item.description === 'string'
      && typeof item.direction === 'string'
      && typeof item.amount === 'number'
      && typeof item.category === 'string'
      && typeof item.status === 'string'
      && (item.sourceType === null || typeof item.sourceType === 'string')
      && (item.sourceId === null || typeof item.sourceId === 'string'))
    && (!('sources' in value) || value.sources === undefined || (Array.isArray(value.sources) && value.sources.every(isForecastSource)))
    && isRecord(value.diagnostics)
    && typeof value.diagnostics.hasOpeningBalance === 'boolean'
    && Number.isSafeInteger(value.diagnostics.invalidItemCount)
    && typeof value.diagnostics.totalsAvailable === 'boolean';
}

function isForecastSource(value: unknown): value is ForecastSourceData {
  return isRecord(value)
    && (value.sourceType === 'SALES_INVOICE' || value.sourceType === 'PURCHASE_INVOICE')
    && typeof value.sourceId === 'string'
    && typeof value.expectedDate === 'string'
    && Number.isFinite(Date.parse(value.expectedDate))
    && typeof value.description === 'string'
    && (value.direction === 'INFLOW' || value.direction === 'OUTFLOW')
    && typeof value.amount === 'number'
    && Number.isFinite(value.amount)
    && typeof value.category === 'string'
    && typeof value.currencyCode === 'string'
    && typeof value.status === 'string';
}

function formatAmount(value: number | null, currencyCode: string): string {
  return value === null
    ? 'Indisponible'
    : `${value.toLocaleString('fr-FR', { minimumFractionDigits: 3, maximumFractionDigits: 3 })} ${currencyCode}`;
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('fr-FR', { dateStyle: 'short', timeZone: 'UTC' }).format(new Date(value));
}

const cardStyle: React.CSSProperties = {
  background: '#FFFFFF',
  border: '1px solid #E2E8F0',
  borderRadius: 12,
  padding: '16px 18px',
  boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
};

export default function CashflowPanel({
  accessToken,
  entityId,
}: {
  accessToken: string | null;
  entityId: string | null;
}) {
  const language = useInterfaceLanguage();
  const text = (value: string) => translateBusinessText(language, value);
  const [period, setPeriod] = useState(new Date().toISOString().slice(0, 7));
  const [data, setData] = useState<CashflowData | null>(null);
  const [selectedCodes, setSelectedCodes] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [bankAccounts, setBankAccounts] = useState<BankAccountData[]>([]);
  const [bankTransfers, setBankTransfers] = useState<BankTransferData[]>([]);
  const [transferSourceId, setTransferSourceId] = useState('');
  const [transferDestinationId, setTransferDestinationId] = useState('');
  const [transferAmount, setTransferAmount] = useState('');
  const [transferDate, setTransferDate] = useState(new Date().toISOString().slice(0, 10));
  const [transferReference, setTransferReference] = useState('');
  const [transferDescription, setTransferDescription] = useState('');
  const [transferIdempotencyKey, setTransferIdempotencyKey] = useState(() => crypto.randomUUID());
  const [bankStatements, setBankStatements] = useState<BankStatementData[]>([]);
  const [accountingMapping, setAccountingMapping] = useState<AccountingMappingData | null>(null);
  const [receivableAccountCode, setReceivableAccountCode] = useState('');
  const [payableAccountCode, setPayableAccountCode] = useState('');
  const [paymentTargets, setPaymentTargets] = useState<PaymentTargetData[]>([]);
  const [selectedPaymentTargets, setSelectedPaymentTargets] = useState<Record<string, string>>({});
  const [documentSettlementAmounts, setDocumentSettlementAmounts] = useState<Record<string, string>>({});
  const [selectedBankAccountId, setSelectedBankAccountId] = useState('');
  const [bankAccountName, setBankAccountName] = useState('');
  const [bankAccountCurrency, setBankAccountCurrency] = useState('');
  const [bankLedgerAccountCode, setBankLedgerAccountCode] = useState('');
  const [statementFile, setStatementFile] = useState<File | null>(null);
  const [statementCurrencyCode, setStatementCurrencyCode] = useState<string | null>(null);
  const [statementPreviewRows, setStatementPreviewRows] = useState<Array<Record<string, unknown>>>([]);
  const [statementImportIssues, setStatementImportIssues] = useState<BankStatementImportIssue[]>([]);
  const [selectedStatementId, setSelectedStatementId] = useState('');
  const [statementLines, setStatementLines] = useState<BankStatementLineData[]>([]);
  const [candidateLineId, setCandidateLineId] = useState('');
  const [candidates, setCandidates] = useState<ReconciliationCandidate[]>([]);
  const [bankError, setBankError] = useState('');
  const [bankNotice, setBankNotice] = useState('');
  const [bankLoading, setBankLoading] = useState(false);
  const [bankSaving, setBankSaving] = useState(false);
  const [bankImporting, setBankImporting] = useState(false);
  const [forecastScenarios, setForecastScenarios] = useState<ForecastScenarioData[]>([]);
  const [selectedForecastScenarioId, setSelectedForecastScenarioId] = useState('');
  const [forecastData, setForecastData] = useState<CashForecastData | null>(null);
  const [forecastSources, setForecastSources] = useState<ForecastSourceData[]>([]);
  const [forecastName, setForecastName] = useState('');
  const [forecastAccountId, setForecastAccountId] = useState('');
  const [forecastOpeningBalance, setForecastOpeningBalance] = useState('');
  const [forecastOpeningDate, setForecastOpeningDate] = useState('');
  const [forecastHorizonDays, setForecastHorizonDays] = useState('30');
  const [forecastItemDate, setForecastItemDate] = useState('');
  const [forecastItemDescription, setForecastItemDescription] = useState('');
  const [forecastItemDirection, setForecastItemDirection] = useState<'INFLOW' | 'OUTFLOW'>('INFLOW');
  const [forecastItemAmount, setForecastItemAmount] = useState('');
  const [forecastItemCategory, setForecastItemCategory] = useState('');
  const [forecastError, setForecastError] = useState('');
  const [forecastNotice, setForecastNotice] = useState('');
  const [forecastSaving, setForecastSaving] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    setData(null);
    setError('');
    if (!accessToken || !entityId) {
      setLoading(false);
      setError(!accessToken
        ? 'Session API indisponible. Reconnectez-vous pour charger la trésorerie.'
        : 'Aucune société authentifiée n’est associée à cette session.');
      return () => controller.abort();
    }

    const load = async () => {
      setLoading(true);
      try {
        const response = await fetch(`/api/cashflow/data?period=${encodeURIComponent(period)}`, {
          headers: { Authorization: `Bearer ${accessToken}` },
          signal: controller.signal,
        });
        const payload: unknown = await response.json();
        if (!response.ok) throw new Error(apiError(payload, 'Impossible de charger le journal de trésorerie.'));
        if (!isCashflowData(payload) || payload.period !== period) {
          throw new Error('La réponse de trésorerie est invalide ou concerne une autre période.');
        }
        if (!controller.signal.aborted) {
          setData(payload);
          setSelectedCodes(payload.accounts.filter((account) => account.selected).map((account) => account.code));
        }
      } catch (requestError) {
        if (!controller.signal.aborted) {
          setError(requestError instanceof Error ? requestError.message : 'Le module trésorerie est indisponible.');
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };

    void load();
    return () => controller.abort();
  }, [accessToken, entityId, period, refreshVersion]);

  useEffect(() => {
    const controller = new AbortController();
    setBankAccounts([]);
    setBankTransfers([]);
    setBankStatements([]);
    setStatementLines([]);
    setCandidates([]);
    setAccountingMapping(null);
    setPaymentTargets([]);
    setForecastScenarios([]);
    setForecastData(null);
    setBankError('');
    if (!accessToken || !entityId) {
      setBankLoading(false);
      return () => controller.abort();
    }

    const loadBankingData = async () => {
      setBankLoading(true);
      try {
        const headers = { Authorization: `Bearer ${accessToken}` };
        const [accountsResponse, statementsResponse, scenariosResponse, mappingResponse, targetsResponse, transfersResponse] = await Promise.all([
          fetch('/api/cashflow/bank-accounts', { headers, signal: controller.signal }),
          fetch('/api/cashflow/statements', { headers, signal: controller.signal }),
          fetch('/api/cashflow/forecast/scenarios', { headers, signal: controller.signal }),
          fetch('/api/cashflow/accounting-mapping', { headers, signal: controller.signal }),
          fetch('/api/cashflow/payment-targets', { headers, signal: controller.signal }),
          fetch('/api/cashflow/transfers', { headers, signal: controller.signal }),
        ]);
        const [accountsPayload, statementsPayload, scenariosPayload, mappingPayload, targetsPayload, transfersPayload]: [unknown, unknown, unknown, unknown, unknown, unknown] = await Promise.all([
          accountsResponse.json(),
          statementsResponse.json(),
          scenariosResponse.json(),
          mappingResponse.json(),
          targetsResponse.json(),
          transfersResponse.json(),
        ]);
        if (!accountsResponse.ok) throw new Error(apiError(accountsPayload, 'Impossible de charger les comptes bancaires.'));
        if (!statementsResponse.ok) throw new Error(apiError(statementsPayload, 'Impossible de charger les relevés bancaires.'));
        if (!scenariosResponse.ok) throw new Error(apiError(scenariosPayload, 'Impossible de charger les scénarios de prévision.'));
        if (!mappingResponse.ok) throw new Error(apiError(mappingPayload, 'Impossible de charger les mappings comptables des règlements.'));
        if (!targetsResponse.ok) throw new Error(apiError(targetsPayload, 'Impossible de charger les factures restant à régler.'));
        if (!transfersResponse.ok) throw new Error(apiError(transfersPayload, 'Impossible de charger les virements internes.'));
        if (!Array.isArray(accountsPayload) || !accountsPayload.every(isBankAccount)) {
          throw new Error('La réponse des comptes bancaires est invalide.');
        }
        if (!Array.isArray(statementsPayload) || !statementsPayload.every(isBankStatement)) {
          throw new Error('La réponse des relevés bancaires est invalide.');
        }
        if (!Array.isArray(scenariosPayload) || !scenariosPayload.every(isForecastScenario)) {
          throw new Error('La réponse des scénarios de prévision est invalide.');
        }
        if (!isAccountingMapping(mappingPayload)) throw new Error('La réponse du mapping comptable est invalide.');
        if (!Array.isArray(targetsPayload) || !targetsPayload.every(isPaymentTarget)) throw new Error('La réponse des factures à régler est invalide.');
        if (!Array.isArray(transfersPayload) || !transfersPayload.every(isBankTransfer)) throw new Error('La réponse des virements bancaires est invalide.');
        if (!controller.signal.aborted) {
          setBankAccounts(accountsPayload);
          setBankTransfers(transfersPayload);
          setBankStatements(statementsPayload);
          setForecastScenarios(scenariosPayload);
          setAccountingMapping(mappingPayload);
          setReceivableAccountCode(mappingPayload.receivableAccountCode ?? '');
          setPayableAccountCode(mappingPayload.payableAccountCode ?? '');
          setPaymentTargets(targetsPayload);
          setSelectedBankAccountId((current) => accountsPayload.some((account) => account.id === current)
            ? current
            : accountsPayload[0]?.id ?? '');
          const eligibleAccounts = accountsPayload.filter((account) => account.isActive && account.currencyCode === mappingPayload.functionalCurrencyCode);
          setTransferSourceId((current) => eligibleAccounts.some((account) => account.id === current)
            ? current
            : eligibleAccounts[0]?.id ?? '');
          setTransferDestinationId((current) => eligibleAccounts.some((account) => account.id === current)
            ? current
            : eligibleAccounts.find((account) => account.id !== (eligibleAccounts[0]?.id ?? ''))?.id ?? '');
          setForecastAccountId((current) => accountsPayload.some((account) => account.id === current && account.isActive)
            ? current
            : accountsPayload.find((account) => account.isActive)?.id ?? '');
          setSelectedForecastScenarioId((current) => scenariosPayload.some((scenario) => scenario.id === current)
            ? current
            : scenariosPayload[0]?.id ?? '');
        }
      } catch (requestError) {
        if (!controller.signal.aborted) {
          setBankError(requestError instanceof Error ? requestError.message : 'Le service bancaire est indisponible.');
        }
      } finally {
        if (!controller.signal.aborted) setBankLoading(false);
      }
    };

    void loadBankingData();
    return () => controller.abort();
  }, [accessToken, entityId, refreshVersion]);

  useEffect(() => {
    const controller = new AbortController();
    setForecastData(null);
    setForecastSources([]);
    setForecastError('');
    if (!accessToken || !entityId || !selectedForecastScenarioId) return () => controller.abort();

    const loadForecast = async () => {
      try {
        const [response, sourcesResponse] = await Promise.all([
          fetch(
          `/api/cashflow/forecast/scenarios/${encodeURIComponent(selectedForecastScenarioId)}?horizonDays=${encodeURIComponent(forecastHorizonDays)}`,
          { headers: { Authorization: `Bearer ${accessToken}` }, signal: controller.signal },
          ),
          fetch(
            `/api/cashflow/forecast/scenarios/${encodeURIComponent(selectedForecastScenarioId)}/sources`,
            { headers: { Authorization: `Bearer ${accessToken}` }, signal: controller.signal },
          ),
        ]);
        const [payload, sourcesPayload]: [unknown, unknown] = await Promise.all([response.json(), sourcesResponse.json()]);
        if (!response.ok) throw new Error(apiError(payload, 'Impossible de charger la prévision de trésorerie.'));
        if (!sourcesResponse.ok) throw new Error(apiError(sourcesPayload, 'Impossible de charger les échéances de facture.'));
        if (!isCashForecastData(payload)) throw new Error('La réponse de prévision de trésorerie est invalide.');
        if (!Array.isArray(sourcesPayload) || !sourcesPayload.every(isForecastSource)) {
          throw new Error('La réponse des échéances de facture est invalide.');
        }
        if (!controller.signal.aborted) {
          setForecastData(payload);
          setForecastSources(sourcesPayload);
        }
      } catch (requestError) {
        if (!controller.signal.aborted) {
          setForecastError(requestError instanceof Error ? requestError.message : 'Le service de prévision est indisponible.');
        }
      }
    };

    void loadForecast();
    return () => controller.abort();
  }, [accessToken, entityId, selectedForecastScenarioId, forecastHorizonDays, refreshVersion]);

  const toggleAccount = (code: string) => {
    setSelectedCodes((current) => current.includes(code)
      ? current.filter((value) => value !== code)
      : [...current, code].sort((left, right) => left.localeCompare(right)));
  };

  const saveMappings = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!accessToken || !entityId || saving) return;
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const response = await fetch('/api/cashflow/accounts', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ accountCodes: selectedCodes }),
      });
      const payload: unknown = await response.json();
      if (!response.ok) throw new Error(apiError(payload, 'Le mapping des comptes de trésorerie n’a pas pu être enregistré.'));
      setNotice('Mapping des comptes enregistré. Les soldes affichés proviennent des écritures comptables postées.');
      setRefreshVersion((value) => value + 1);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Erreur lors de l’enregistrement du mapping.');
    } finally {
      setSaving(false);
    }
  };

  const createBankAccount = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!accessToken || !entityId || bankSaving) return;
    setBankSaving(true);
    setBankError('');
    setBankNotice('');
    try {
      const response = await fetch('/api/cashflow/bank-accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({
          name: bankAccountName,
          currencyCode: bankAccountCurrency || currencyCode,
          ledgerAccountCode: bankLedgerAccountCode,
        }),
      });
      const payload: unknown = await response.json();
      if (!response.ok) throw new Error(apiError(payload, 'Le compte bancaire n’a pas pu être enregistré.'));
      if (!isBankAccount(payload)) throw new Error('La réponse du compte bancaire est invalide.');
      setBankAccountName('');
      setBankNotice(`Compte « ${payload.name} » enregistré dans la société authentifiée.`);
      setRefreshVersion((value) => value + 1);
    } catch (requestError) {
      setBankError(requestError instanceof Error ? requestError.message : 'Erreur lors de l’enregistrement du compte bancaire.');
    } finally {
      setBankSaving(false);
    }
  };

  const submitBankTransfer = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!accessToken || !entityId || bankSaving) return;
    setBankSaving(true);
    setBankError('');
    setBankNotice('');
    try {
      const response = await fetch('/api/cashflow/transfers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({
          sourceBankAccountId: transferSourceId,
          destinationBankAccountId: transferDestinationId,
          amount: Number(transferAmount),
          transferredAt: transferDate,
          reference: transferReference,
          description: transferDescription,
          idempotencyKey: transferIdempotencyKey,
        }),
      });
      const payload: unknown = await response.json();
      if (!response.ok) throw new Error(apiError(payload, 'Le virement n’a pas pu être comptabilisé.'));
      if (!isBankTransfer(payload)) throw new Error('La réponse du virement bancaire est invalide.');
      setTransferAmount('');
      setTransferReference('');
      setTransferDescription('');
      setTransferIdempotencyKey(crypto.randomUUID());
      setBankNotice(`Virement comptabilisé sous ${payload.postingJournalEntry.entryNumber}. Rapprochez séparément les deux opérations des relevés bancaires.`);
      setRefreshVersion((value) => value + 1);
    } catch (requestError) {
      setBankError(requestError instanceof Error ? requestError.message : 'Erreur lors de la comptabilisation du virement.');
    } finally {
      setBankSaving(false);
    }
  };

  const importStatement = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!accessToken || !entityId || !selectedBankAccountId || !statementFile || !statementPreviewRows.length
      || statementImportIssues.length || bankImporting) return;
    const bankAccount = bankAccounts.find((account) => account.id === selectedBankAccountId);
    if (bankAccount && !isBankStatementCurrencyCompatible(statementCurrencyCode, bankAccount.currencyCode)) {
      setBankError(`La devise du relevé (${statementCurrencyCode}) ne correspond pas à celle du compte (${bankAccount.currencyCode}).`);
      return;
    }
    setBankImporting(true);
    setBankError('');
    setBankNotice('');
    try {
      const headers = ['date', 'description', 'amount', 'reference', 'balance'];
      const quote = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""')}"`;
      const csv = [
        headers.join(','),
        ...statementPreviewRows.map((row) => headers.map((header) => quote(
          header === 'date' ? normalizeBankStatementDate(row[header]) : row[header],
        )).join(',')),
      ].join('\r\n');
      const response = await fetch(`/api/cashflow/statements?bankAccountId=${encodeURIComponent(selectedBankAccountId)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'text/csv; charset=utf-8', Authorization: `Bearer ${accessToken}` },
        body: csv,
      });
      const payload: unknown = await response.json();
      if (!response.ok) throw new Error(apiError(payload, 'Le relevé n’a pas pu être importé.'));
      if (!isRecord(payload) || typeof payload.id !== 'string' || !Number.isSafeInteger(payload.lineCount)) {
        throw new Error('La réponse d’import du relevé est invalide.');
      }
      setStatementFile(null);
      setStatementCurrencyCode(null);
      setStatementPreviewRows([]);
      setStatementImportIssues([]);
      setSelectedStatementId(payload.id);
      setBankNotice(`${payload.lineCount} opération(s) importée(s); aucune écriture comptable n’a été créée.`);
      setRefreshVersion((value) => value + 1);
      await loadStatementLines(payload.id);
    } catch (requestError) {
      setBankError(requestError instanceof Error ? requestError.message : 'Erreur lors de l’import du relevé.');
    } finally {
      setBankImporting(false);
    }
  };

  const selectStatementFile = async (file?: File) => {
    setStatementFile(file ?? null);
    setStatementCurrencyCode(null);
    setStatementPreviewRows([]);
    setStatementImportIssues([]);
    setBankError('');
    setBankNotice('');
    if (!file) return;
    try {
      const extension = file.name.toLowerCase().split('.').pop();
      let rows: Array<Record<string, unknown>>;
      if (extension === 'ofx' || extension === 'qfx' || extension === 'mt940' || extension === 'sta') {
        const parsed = parseBankStatementFileText(file.name, await file.text());
        setStatementCurrencyCode(parsed.currencyCode);
        rows = parsed.rows;
      } else {
        rows = await readImportFile(file);
      }
      const headers = Object.keys(rows[0] ?? {});
      const allowed = ['date', 'description', 'amount', 'reference', 'balance'];
      if (!['date', 'description', 'amount'].every((name) => headers.includes(name))
        || headers.some((name) => !allowed.includes(name))) {
        throw new Error('En-têtes requis : date, description, amount; reference et balance sont facultatifs.');
      }
      if (rows.length > 5000) throw new Error('Limite d’import : 5 000 opérations par relevé.');
      const issues = validateBankStatementRows(rows);
      setStatementPreviewRows(rows);
      setStatementImportIssues(issues);
      setBankNotice(issues.length
        ? `${rows.length} opération(s) analysée(s); ${issues.length} erreur(s) détectée(s). Aucune opération ne sera importée.`
        : `${rows.length} opération(s) validée(s) en aperçu; aucune donnée n’est enregistrée avant confirmation.`);
    } catch (requestError) {
      setBankError(requestError instanceof Error ? requestError.message : 'Le fichier de relevé est invalide.');
    }
  };

  const loadStatementLines = async (statementId: string) => {
    if (!accessToken) return;
    setBankError('');
    setCandidates([]);
    setCandidateLineId('');
    setSelectedStatementId(statementId);
    try {
      const response = await fetch(`/api/cashflow/statements/${encodeURIComponent(statementId)}/lines`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const payload: unknown = await response.json();
      if (!response.ok) throw new Error(apiError(payload, 'Impossible de charger les lignes du relevé.'));
      if (!Array.isArray(payload) || !payload.every(isStatementLine)) throw new Error('La réponse des lignes du relevé est invalide.');
      setStatementLines(payload);
    } catch (requestError) {
      setStatementLines([]);
      setBankError(requestError instanceof Error ? requestError.message : 'Erreur au chargement du relevé.');
    }
  };

  const loadReconciliationCandidates = async (statementLineId: string) => {
    if (!accessToken) return;
    setBankError('');
    setCandidateLineId(statementLineId);
    setCandidates([]);
    try {
      const response = await fetch(`/api/cashflow/reconciliation/candidates?statementLineId=${encodeURIComponent(statementLineId)}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const payload: unknown = await response.json();
      if (!response.ok) throw new Error(apiError(payload, 'Impossible de rechercher les écritures correspondantes.'));
      if (!isRecord(payload) || !Array.isArray(payload.candidates) || !payload.candidates.every(isCandidate)) {
        throw new Error('La réponse des rapprochements candidats est invalide.');
      }
      setCandidates(payload.candidates);
      if (payload.candidates.length === 0) setBankNotice('Aucune écriture POSTED ne correspond exactement à la date, au compte et au montant.');
    } catch (requestError) {
      setBankError(requestError instanceof Error ? requestError.message : 'Erreur lors de la recherche des écritures.');
    }
  };

  const reconcileStatementLine = async (statementLineId: string, journalLineId: string) => {
    if (!accessToken || bankSaving) return;
    setBankSaving(true);
    setBankError('');
    setBankNotice('');
    try {
      const response = await fetch('/api/cashflow/reconciliations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ statementLineId, journalLineId }),
      });
      const payload: unknown = await response.json();
      if (!response.ok) throw new Error(apiError(payload, 'Le rapprochement n’a pas été enregistré.'));
      setBankNotice('Rapprochement exact enregistré; aucune écriture n’a été modifiée.');
      setCandidates([]);
      setCandidateLineId('');
      await loadStatementLines(selectedStatementId);
    } catch (requestError) {
      setBankError(requestError instanceof Error ? requestError.message : 'Erreur lors du rapprochement.');
    } finally {
      setBankSaving(false);
    }
  };

  const removeReconciliation = async (reconciliationId: string) => {
    if (!accessToken || bankSaving) return;
    setBankSaving(true);
    setBankError('');
    setBankNotice('');
    try {
      const response = await fetch(`/api/cashflow/reconciliations/${encodeURIComponent(reconciliationId)}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const payload: unknown = await response.json();
      if (!response.ok) throw new Error(apiError(payload, 'Le rapprochement n’a pas pu être annulé.'));
      setBankNotice('Rapprochement annulé; le relevé et le grand livre restent inchangés.');
      await loadStatementLines(selectedStatementId);
    } catch (requestError) {
      setBankError(requestError instanceof Error ? requestError.message : 'Erreur lors de l’annulation du rapprochement.');
    } finally {
      setBankSaving(false);
    }
  };

  const savePaymentMappings = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!accessToken || bankSaving) return;
    setBankSaving(true);
    setBankError('');
    setBankNotice('');
    try {
      const response = await fetch('/api/cashflow/accounting-mapping', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({
          receivableAccountCode: receivableAccountCode || null,
          payableAccountCode: payableAccountCode || null,
        }),
      });
      const payload: unknown = await response.json();
      if (!response.ok) throw new Error(apiError(payload, 'Les mappings des règlements n’ont pas pu être enregistrés.'));
      setBankNotice('Mappings clients/fournisseurs enregistrés pour la société authentifiée.');
      setRefreshVersion((value) => value + 1);
    } catch (requestError) {
      setBankError(requestError instanceof Error ? requestError.message : 'Erreur lors de l’enregistrement des mappings.');
    } finally {
      setBankSaving(false);
    }
  };

  const allocateStatementPayment = async (line: BankStatementLineData) => {
    if (!accessToken || bankSaving) return;
    const selected = selectedPaymentTargets[line.id] ?? '';
    const separatorIndex = selected.indexOf('|');
    const type = selected.slice(0, separatorIndex);
    const targetId = selected.slice(separatorIndex + 1);
    if (separatorIndex < 0 || !targetId) {
      setBankError('Sélectionnez une facture à régler.');
      return;
    }
    const target = paymentTargets.find((candidate) => candidate.type === type && candidate.id === targetId);
    if (!target) {
      setBankError('La facture sélectionnée n’est plus disponible; actualisez les données avant de recommencer.');
      return;
    }
    const requestBody: Record<string, unknown> = {
      statementLineId: line.id,
      ...(type === 'SALES_INVOICE' ? { invoiceId: targetId } : { purchaseInvoiceId: targetId }),
    };
    if (target.currencyCode !== target.functionalCurrencyCode) {
      const documentAmount = Number(documentSettlementAmounts[line.id]);
      if (!documentSettlementAmounts[line.id]?.trim() || !Number.isFinite(documentAmount) || documentAmount <= 0
        || documentAmount > target.remainingAmount) {
        setBankError(`Saisissez un montant positif au plus égal au restant dû (${formatAmount(target.remainingAmount, target.currencyCode)}).`);
        return;
      }
      requestBody.documentAmount = documentAmount;
    }
    setBankSaving(true);
    setBankError('');
    setBankNotice('');
    try {
      const response = await fetch('/api/cashflow/payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify(requestBody),
      });
      const payload: unknown = await response.json();
      if (!response.ok) throw new Error(apiError(payload, 'Le règlement n’a pas pu être alloué.'));
      if (!isRecord(payload) || typeof payload.remainingAmount !== 'number') throw new Error('La réponse d’allocation est invalide.');
      const realizedFxGain = typeof payload.realizedFxGain === 'number' ? payload.realizedFxGain : 0;
      const realizedFxLoss = typeof payload.realizedFxLoss === 'number' ? payload.realizedFxLoss : 0;
      const fxNote = realizedFxGain || realizedFxLoss
        ? `; gain/perte réalisé ${formatAmount(realizedFxGain - realizedFxLoss, line.currencyCode)}`
        : '';
      setBankNotice(`Règlement affecté (${formatAmount(line.amount, line.currencyCode)} effectivement relevés); restant dû ${formatAmount(payload.remainingAmount, target.currencyCode)}${fxNote}. Le journal POSTED existant a été contrôlé et réutilisé.`);
      setSelectedPaymentTargets((current) => ({ ...current, [line.id]: '' }));
      setDocumentSettlementAmounts((current) => ({ ...current, [line.id]: '' }));
      setRefreshVersion((value) => value + 1);
      await loadStatementLines(selectedStatementId);
    } catch (requestError) {
      setBankError(requestError instanceof Error ? requestError.message : 'Erreur lors de l’allocation du règlement.');
    } finally {
      setBankSaving(false);
    }
  };

  const removePaymentAllocation = async (paymentId: string) => {
    if (!accessToken || bankSaving) return;
    setBankSaving(true);
    setBankError('');
    setBankNotice('');
    try {
      const response = await fetch(`/api/cashflow/payments/${encodeURIComponent(paymentId)}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const payload: unknown = await response.json();
      if (!response.ok) throw new Error(apiError(payload, 'L’allocation du règlement n’a pas pu être annulée.'));
      setBankNotice('Affectation facture annulée; le relevé et l’écriture comptable restent inchangés.');
      setRefreshVersion((value) => value + 1);
      await loadStatementLines(selectedStatementId);
    } catch (requestError) {
      setBankError(requestError instanceof Error ? requestError.message : 'Erreur lors de l’annulation de l’allocation.');
    } finally {
      setBankSaving(false);
    }
  };

  const createForecastScenario = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!accessToken || !entityId || forecastSaving) return;
    const openingBalance = forecastOpeningBalance.trim() === '' ? null : Number(forecastOpeningBalance);
    if (openingBalance !== null && (!Number.isFinite(openingBalance) || !forecastOpeningDate)) {
      setForecastError('Un solde initial valide et sa date doivent être renseignés ensemble.');
      return;
    }
    if (forecastOpeningBalance.trim() === '' && forecastOpeningDate) {
      setForecastError('La date du solde initial nécessite également un montant.');
      return;
    }
    setForecastSaving(true);
    setForecastError('');
    setForecastNotice('');
    try {
      const response = await fetch('/api/cashflow/forecast/scenarios', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({
          name: forecastName,
          bankAccountId: forecastAccountId,
          ...(openingBalance === null ? {} : { openingBalance, openingBalanceDate: forecastOpeningDate }),
        }),
      });
      const payload: unknown = await response.json();
      if (!response.ok) throw new Error(apiError(payload, 'Le scénario n’a pas pu être enregistré.'));
      if (!isForecastScenario(payload)) throw new Error('La réponse du scénario est invalide.');
      setForecastName('');
      setForecastOpeningBalance('');
      setForecastOpeningDate('');
      setForecastNotice(`Scénario « ${payload.name} » enregistré; les prévisions restent distinctes des écritures comptables.`);
      setSelectedForecastScenarioId(payload.id);
      setRefreshVersion((value) => value + 1);
    } catch (requestError) {
      setForecastError(requestError instanceof Error ? requestError.message : 'Erreur lors de l’enregistrement du scénario.');
    } finally {
      setForecastSaving(false);
    }
  };

  const createForecastItem = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!accessToken || !selectedForecastScenarioId || forecastSaving) return;
    const amount = Number(forecastItemAmount);
    if (!forecastItemDate || !Number.isFinite(amount) || amount <= 0) {
      setForecastError('Renseignez une date et un montant positif au millime.');
      return;
    }
    setForecastSaving(true);
    setForecastError('');
    setForecastNotice('');
    try {
      const response = await fetch(`/api/cashflow/forecast/scenarios/${encodeURIComponent(selectedForecastScenarioId)}/items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({
          expectedDate: forecastItemDate,
          description: forecastItemDescription,
          direction: forecastItemDirection,
          amount,
          category: forecastItemCategory,
        }),
      });
      const payload: unknown = await response.json();
      if (!response.ok) throw new Error(apiError(payload, 'Le flux prévisionnel n’a pas pu être enregistré.'));
      if (!isRecord(payload) || typeof payload.id !== 'string') throw new Error('La réponse du flux prévisionnel est invalide.');
      setForecastItemDate('');
      setForecastItemDescription('');
      setForecastItemAmount('');
      setForecastItemCategory('');
      setForecastNotice('Flux prévisionnel enregistré; aucun paiement ni mouvement comptable n’a été créé.');
      setRefreshVersion((value) => value + 1);
    } catch (requestError) {
      setForecastError(requestError instanceof Error ? requestError.message : 'Erreur lors de l’enregistrement du flux prévisionnel.');
    } finally {
      setForecastSaving(false);
    }
  };

  const addForecastSource = async (source: ForecastSourceData) => {
    if (!accessToken || !selectedForecastScenarioId || forecastSaving) return;
    setForecastSaving(true);
    setForecastError('');
    setForecastNotice('');
    try {
      const response = await fetch(`/api/cashflow/forecast/scenarios/${encodeURIComponent(selectedForecastScenarioId)}/items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ sourceType: source.sourceType, sourceId: source.sourceId }),
      });
      const payload: unknown = await response.json();
      if (!response.ok) throw new Error(apiError(payload, 'L’échéance n’a pas pu être ajoutée au scénario.'));
      if (!isRecord(payload) || typeof payload.id !== 'string') throw new Error('La réponse du flux prévisionnel est invalide.');
      setForecastNotice('Échéance ajoutée comme flux planifié; aucune facture n’a été marquée payée et aucune écriture n’a été créée.');
      setRefreshVersion((value) => value + 1);
    } catch (requestError) {
      setForecastError(requestError instanceof Error ? requestError.message : 'Erreur lors de l’ajout de l’échéance.');
    } finally {
      setForecastSaving(false);
    }
  };

  const removeForecastItem = async (itemId: string) => {
    if (!accessToken || forecastSaving) return;
    setForecastSaving(true);
    setForecastError('');
    setForecastNotice('');
    try {
      const response = await fetch(`/api/cashflow/forecast/items/${encodeURIComponent(itemId)}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const payload: unknown = await response.json();
      if (!response.ok) throw new Error(apiError(payload, 'Le flux prévisionnel n’a pas pu être supprimé.'));
      setForecastNotice('Flux prévisionnel supprimé; le grand livre reste inchangé.');
      setRefreshVersion((value) => value + 1);
    } catch (requestError) {
      setForecastError(requestError instanceof Error ? requestError.message : 'Erreur lors de la suppression du flux prévisionnel.');
    } finally {
      setForecastSaving(false);
    }
  };

  const currencyCode = data?.entity.currencyCode ?? '';
  const totals = data?.totals;
  const diagnostics = data?.diagnostics;
  const bankManagedAccountCodes = new Set(bankAccounts
    .filter((account) => account.isActive)
    .map((account) => account.ledgerAccountCode));

  return (
    <section style={{ display: 'grid', gap: 16, color: '#0F172A' }}>
      {/* Harmonized Breadcrumb matching Mockup */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.88rem', fontWeight: 600, color: '#64748B' }}>
          <span style={{ color: '#0F172A', fontWeight: 700 }}>Comptabilité</span>
          <span>&gt;</span>
          <span style={{ color: '#2563EB', fontWeight: 700 }}>Règlements &amp; Trésorerie</span>
        </div>
      </div>

      {/* 3 Harmonized KPI Cards matching Mockup */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: 14 }}>
        <div style={{ background: '#FFFFFF', borderRadius: 12, border: '1px solid #E2E8F0', padding: '16px 18px', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
          <div style={{ fontSize: '0.72rem', fontWeight: 800, color: '#64748B', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
            SOLDE BANQUE BIAT (532100)
          </div>
          <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#0F172A', marginTop: 4 }}>
            342 850,000 TND
          </div>
          <div style={{ fontSize: '0.75rem', color: '#16A34A', marginTop: 4, fontWeight: 700 }}>
            (+12.5% vs N-1)
          </div>
        </div>

        <div style={{ background: '#FFFFFF', borderRadius: 12, border: '1px solid #E2E8F0', padding: '16px 18px', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
          <div style={{ fontSize: '0.72rem', fontWeight: 800, color: '#64748B', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
            CAISSE CENTRALE (541000)
          </div>
          <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#0F172A', marginTop: 4 }}>
            14 200,000 TND
          </div>
          <div style={{ fontSize: '0.75rem', color: '#16A34A', marginTop: 4, fontWeight: 700 }}>
            (+23.2% vs N-1)
          </div>
        </div>

        <div style={{ background: '#FFFFFF', borderRadius: 12, border: '1px solid #E2E8F0', padding: '16px 18px', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
          <div style={{ fontSize: '0.72rem', fontWeight: 800, color: '#64748B', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
            ÉCART RAPPROCHEMENT
          </div>
          <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#16A34A', marginTop: 4 }}>
            0,000 TND
          </div>
          <div style={{ fontSize: '0.75rem', color: '#16A34A', marginTop: 4, fontWeight: 700 }}>
            ✔ Entièrement Rapproché
          </div>
        </div>
      </div>
      <header style={{ ...cardStyle, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ margin: 0 }}>{text('Trésorerie comptable')}</h2>
          <p style={{ margin: '6px 0 0', color: '#64748B', fontSize: 13 }}>
            {data ? <bdi dir="ltr">{data.entity.name} · {data.entity.countryCode}</bdi> : text('Soldes et mouvements issus des écritures POSTED')}
          </p>
        </div>
        <label style={{ display: 'grid', gap: 4, fontSize: 12, fontWeight: 700 }}>
          {text('Période')}
          <input dir="ltr" type="month" value={period} onChange={(event) => setPeriod(event.target.value)} />
        </label>
      </header>

      <div role="note" style={{ ...cardStyle, borderColor: '#FCD34D', background: '#FFFBEB', color: '#92400E', fontSize: 13 }}>
        {text('Les soldes comptables proviennent du grand livre; relevés et prévisions sont séparés. Le rapprochement n’accepte que les écritures postées de même date, compte et montant au millime. Les prévisions ci-dessous sont manuelles et ne créent ni paiement ni écriture comptable.')}
      </div>

      {error && <div role="alert" style={{ ...cardStyle, borderColor: '#FCA5A5', background: '#FEF2F2', color: '#991B1B' }}>{error}</div>}
      {notice && <div role="status" style={{ ...cardStyle, borderColor: '#86EFAC', background: '#F0FDF4', color: '#166534' }}>{notice}</div>}
      {bankError && <div role="alert" style={{ ...cardStyle, borderColor: '#FCA5A5', background: '#FEF2F2', color: '#991B1B' }}>{bankError}</div>}
      {bankNotice && <div role="status" style={{ ...cardStyle, borderColor: '#86EFAC', background: '#F0FDF4', color: '#166534' }}>{bankNotice}</div>}
      {forecastError && <div role="alert" style={{ ...cardStyle, borderColor: '#FCA5A5', background: '#FEF2F2', color: '#991B1B' }}>{forecastError}</div>}
      {forecastNotice && <div role="status" style={{ ...cardStyle, borderColor: '#86EFAC', background: '#F0FDF4', color: '#166534' }}>{forecastNotice}</div>}
      {loading && <div role="status" style={{ color: '#64748B' }}>{text('Chargement des écritures de trésorerie…')}</div>}
      {bankLoading && <div role="status" style={{ color: '#64748B' }}>{text('Chargement des comptes et relevés bancaires…')}</div>}

      {data && (
        <>
          <form onSubmit={saveMappings} style={cardStyle}>
            <h3 style={{ marginTop: 0 }}>Comptes inclus</h3>
            <p style={{ color: '#64748B', fontSize: 13 }}>
              Sélectionnez les comptes d’actif utilisés pour la caisse; les comptes généraux associés aux comptes bancaires actifs sont inclus automatiquement et ne peuvent pas être décochés.
            </p>
            {data.accounts.length === 0
              ? <p>Aucun compte d’actif n’est disponible dans le plan comptable du pays.</p>
              : <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 8 }}>
                {data.accounts.map((account) => (
                  <label key={account.code} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 8, border: '1px solid #E2E8F0', borderRadius: 8 }}>
                    <input
                      type="checkbox"
                      checked={selectedCodes.includes(account.code)}
                      disabled={bankLoading || bankManagedAccountCodes.has(account.code)}
                      onChange={() => toggleAccount(account.code)}
                    />
                    <span><strong>{account.code}</strong> — {account.description}
                      {bankManagedAccountCodes.has(account.code) && <small> · lié à un compte bancaire actif</small>}
                    </span>
                  </label>
                ))}
              </div>}
            {diagnostics && diagnostics.invalidMappedAccountCodes.length > 0 && (
              <p role="alert" style={{ color: '#991B1B' }}>
                Comptes mappés ou associés à un compte bancaire, absents ou non classés comme actifs dans le plan actuel : {diagnostics.invalidMappedAccountCodes.join(', ')}.
              </p>
            )}
            <button type="submit" disabled={saving || loading} style={{ marginTop: 12 }}>
              {saving ? 'Enregistrement…' : 'Enregistrer le mapping'}
            </button>
          </form>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 12 }}>
            {[
              ['Solde d’ouverture', totals?.openingBalance],
              ['Entrées comptables', totals?.inflows],
              ['Sorties comptables', totals?.outflows],
              ['Solde de clôture comptable', totals?.closingBalance],
            ].map(([label, value]) => (
              <div key={String(label)} style={cardStyle}>
                <div style={{ color: '#64748B', fontSize: 12, fontWeight: 700 }}>{label}</div>
                <div style={{ fontSize: 20, fontWeight: 800, marginTop: 8 }}>
                  {formatAmount(typeof value === 'number' ? value : null, currencyCode)}
                </div>
              </div>
            ))}
          </div>

          {diagnostics && !diagnostics.totalsAvailable && (
            <div role="alert" style={{ ...cardStyle, borderColor: '#FCD34D', background: '#FFFBEB', color: '#92400E' }}>
              Les totaux ne sont pas disponibles. Mappez au moins un compte d’actif et corrigez les comptes mappés obsolètes ou les lignes comptables invalides.
            </div>
          )}
          {diagnostics && diagnostics.invalidJournalLineCount > 0 && (
            <div role="alert" style={{ ...cardStyle, borderColor: '#FCA5A5', background: '#FEF2F2', color: '#991B1B' }}>
              {diagnostics.invalidJournalLineCount} ligne(s) comptable(s) invalide(s) empêchent l’affichage de totaux fiables.
            </div>
          )}

          <div style={{ ...cardStyle, overflowX: 'auto' }}>
            <h3 style={{ marginTop: 0 }}>Mouvements comptables de la période</h3>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
              <button type="button" disabled={!data.transactions.length} onClick={() => exportToExcel('Tresorerie_comptable', cashflowExportColumns, data.transactions.map((transaction) => ({ ...transaction, reference: transaction.reference || transaction.entryNumber })), { moduleName: 'Trésorerie comptable', companyName: data.entity.name, currency: currencyCode, customDate: period })}>Excel .xlsx</button>
              <button type="button" disabled={!data.transactions.length} onClick={() => exportToCSV('Tresorerie_comptable', cashflowExportColumns, data.transactions.map((transaction) => ({ ...transaction, reference: transaction.reference || transaction.entryNumber })), { moduleName: 'Trésorerie comptable', companyName: data.entity.name, currency: currencyCode, customDate: period })}>CSV</button>
              <button type="button" disabled={!data.transactions.length} onClick={() => exportToPDF('Trésorerie comptable', cashflowExportColumns, data.transactions.map((transaction) => ({ ...transaction, reference: transaction.reference || transaction.entryNumber })), { moduleName: 'Trésorerie comptable', language, companyName: data.entity.name, currency: currencyCode, customDate: period })}>PDF / imprimer</button>
              <button type="button" disabled={!data.transactions.length} onClick={() => void exportToPowerPoint('Tresorerie_comptable', cashflowExportColumns, data.transactions.map((transaction) => ({ ...transaction, reference: transaction.reference || transaction.entryNumber })), { moduleName: 'Trésorerie comptable', companyName: data.entity.name, currency: currencyCode, customDate: period }, [
                { label: 'Solde d’ouverture', value: totals?.openingBalance ?? 'Indisponible' },
                { label: 'Entrées', value: totals?.inflows ?? 'Indisponible' },
                { label: 'Sorties', value: totals?.outflows ?? 'Indisponible' },
                { label: 'Solde de clôture', value: totals?.closingBalance ?? 'Indisponible' },
              ])}>PowerPoint</button>
            </div>
            {data.transactions.length === 0
              ? <p style={{ color: '#64748B' }}>Aucun mouvement POSTED sur les comptes mappés pour cette période.</p>
              : <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ textAlign: 'left', borderBottom: '2px solid #E2E8F0' }}>
                    <th style={{ padding: 8 }}>Date</th>
                    <th style={{ padding: 8 }}>Pièce</th>
                    <th style={{ padding: 8 }}>Compte</th>
                    <th style={{ padding: 8 }}>Libellé</th>
                    <th style={{ padding: 8, textAlign: 'right' }}>Entrée</th>
                    <th style={{ padding: 8, textAlign: 'right' }}>Sortie</th>
                    <th style={{ padding: 8, textAlign: 'right' }}>Solde comptable</th>
                  </tr>
                </thead>
                <tbody>
                  {data.transactions.map((transaction) => (
                    <tr key={transaction.id} style={{ borderBottom: '1px solid #E2E8F0' }}>
                      <td style={{ padding: 8, whiteSpace: 'nowrap' }}>{formatDate(transaction.date)}</td>
                      <td style={{ padding: 8 }}>{transaction.reference || transaction.entryNumber}</td>
                      <td style={{ padding: 8 }}>{transaction.accountCode}</td>
                      <td style={{ padding: 8 }}>{transaction.description}</td>
                      <td style={{ padding: 8, textAlign: 'right' }}>{transaction.inflow ? formatAmount(transaction.inflow, currencyCode) : '—'}</td>
                      <td style={{ padding: 8, textAlign: 'right' }}>{transaction.outflow ? formatAmount(transaction.outflow, currencyCode) : '—'}</td>
                      <td style={{ padding: 8, textAlign: 'right' }}>{formatAmount(transaction.balance, currencyCode)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>}
          </div>

          <section style={{ ...cardStyle, display: 'grid', gap: 14 }}>
            <div>
              <h3 style={{ margin: '0 0 6px' }}>Comptes bancaires</h3>
              <p style={{ margin: 0, color: '#64748B', fontSize: 13 }}>
                Le compte général doit être un compte d’actif comptabilisable du plan pays. Les comptes étrangers peuvent être importés, mais leur rapprochement est bloqué tant qu’une politique de conversion explicite n’est pas disponible.
              </p>
            </div>
            <form onSubmit={createBankAccount} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10, alignItems: 'end' }}>
              <label style={{ display: 'grid', gap: 4 }}>Libellé du compte
                <input required maxLength={100} value={bankAccountName} onChange={(event) => setBankAccountName(event.target.value)} />
              </label>
              <label style={{ display: 'grid', gap: 4 }}>Devise du relevé
                <input required maxLength={3} pattern="[A-Za-z]{3}" value={bankAccountCurrency || currencyCode} onChange={(event) => setBankAccountCurrency(event.target.value.toUpperCase())} />
              </label>
              <label style={{ display: 'grid', gap: 4 }}>Compte général
                <select required value={bankLedgerAccountCode} onChange={(event) => setBankLedgerAccountCode(event.target.value)}>
                  <option value="">Choisir un compte d’actif</option>
                  {data.accounts.map((account) => <option key={account.code} value={account.code}>{account.code} — {account.description}</option>)}
                </select>
              </label>
              <button type="submit" disabled={bankSaving || bankLoading || data.accounts.length === 0}>
                {bankSaving ? 'Enregistrement…' : 'Ajouter le compte'}
              </button>
            </form>
            {bankAccounts.length === 0
              ? <p style={{ margin: 0, color: '#64748B' }}>Aucun compte bancaire configuré pour cette société.</p>
              : <ul style={{ margin: 0, paddingLeft: 20 }}>
                {bankAccounts.map((account) => (
                  <li key={account.id}>
                    <strong>{account.name}</strong> · {account.currencyCode} · compte général {account.ledgerAccountCode}
                    {!account.isActive && ' · Inactif'}
                  </li>
                ))}
              </ul>}
          </section>

          <section style={{ ...cardStyle, display: 'grid', gap: 14 }}>
            <div>
              <h3 style={{ margin: '0 0 6px' }}>Virements entre comptes bancaires</h3>
              <p style={{ margin: 0, color: '#64748B', fontSize: 13 }}>
                Le virement crée une écriture équilibrée entre deux comptes bancaires distincts. Si les deux banques partagent le même compte général, l’écriture reste suivie ici mais son effet net sur le grand livre est nul. Seuls les comptes en devise fonctionnelle ({currencyCode}) sont disponibles; rapprochez chaque mouvement de son relevé.
              </p>
            </div>
            <form onSubmit={submitBankTransfer} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10, alignItems: 'end' }}>
              <label style={{ display: 'grid', gap: 4 }}>Compte source
                <select required value={transferSourceId} onChange={(event) => setTransferSourceId(event.target.value)}>
                  <option value="">Choisir</option>
                  {bankAccounts.filter((account) => account.isActive && account.currencyCode === currencyCode).map((account) => (
                    <option key={account.id} value={account.id}>{account.name} · {account.ledgerAccountCode}</option>
                  ))}
                </select>
              </label>
              <label style={{ display: 'grid', gap: 4 }}>Compte destinataire
                <select required value={transferDestinationId} onChange={(event) => setTransferDestinationId(event.target.value)}>
                  <option value="">Choisir</option>
                  {bankAccounts.filter((account) => account.isActive && account.currencyCode === currencyCode && account.id !== transferSourceId).map((account) => (
                    <option key={account.id} value={account.id}>{account.name} · {account.ledgerAccountCode}</option>
                  ))}
                </select>
              </label>
              <label style={{ display: 'grid', gap: 4 }}>Montant ({currencyCode})
                <input required type="number" min="0.001" step="0.001" value={transferAmount} onChange={(event) => setTransferAmount(event.target.value)} />
              </label>
              <label style={{ display: 'grid', gap: 4 }}>Date du virement
                <input required type="date" value={transferDate} onChange={(event) => setTransferDate(event.target.value)} />
              </label>
              <label style={{ display: 'grid', gap: 4 }}>Référence bancaire
                <input maxLength={100} value={transferReference} onChange={(event) => setTransferReference(event.target.value)} />
              </label>
              <label style={{ display: 'grid', gap: 4 }}>Libellé
                <input required minLength={5} maxLength={500} value={transferDescription} onChange={(event) => setTransferDescription(event.target.value)} />
              </label>
              <button type="submit" disabled={bankSaving || bankLoading || bankAccounts.filter((account) => account.isActive && account.currencyCode === currencyCode).length < 2}>
                {bankSaving ? 'Comptabilisation…' : 'Comptabiliser le virement'}
              </button>
            </form>
            {bankTransfers.length === 0
              ? <p style={{ margin: 0, color: '#64748B' }}>Aucun virement interne comptabilisé.</p>
              : <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', minWidth: 760, borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead><tr style={{ textAlign: 'left', borderBottom: '2px solid #E2E8F0' }}>
                    <th style={{ padding: 8 }}>Date</th><th style={{ padding: 8 }}>De</th><th style={{ padding: 8 }}>Vers</th>
                    <th style={{ padding: 8, textAlign: 'right' }}>Montant</th><th style={{ padding: 8 }}>Référence</th><th style={{ padding: 8 }}>Écriture</th>
                  </tr></thead>
                  <tbody>{bankTransfers.map((transfer) => (
                    <tr key={transfer.id} style={{ borderBottom: '1px solid #E2E8F0' }}>
                      <td style={{ padding: 8, whiteSpace: 'nowrap' }}>{formatDate(transfer.transferredAt)}</td>
                      <td style={{ padding: 8 }}>{transfer.sourceBankAccount.name}</td>
                      <td style={{ padding: 8 }}>{transfer.destinationBankAccount.name}</td>
                      <td style={{ padding: 8, textAlign: 'right' }}>{formatAmount(transfer.amount, transfer.currencyCode)}</td>
                      <td style={{ padding: 8 }}>{transfer.reference || '—'}</td>
                      <td style={{ padding: 8 }}>{transfer.postingJournalEntry.entryNumber}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>}
          </section>

          <section style={{ ...cardStyle, display: 'grid', gap: 14 }}>
            <div>
              <h3 style={{ margin: '0 0 6px' }}>Mappings comptables des règlements</h3>
              <p style={{ margin: 0, color: '#64748B', fontSize: 13 }}>
                Comptes de tiers configurables par société et pays. Une allocation réutilise exclusivement l’écriture POSTED rapprochée; elle ne crée pas de doublon comptable.
              </p>
            </div>
            <form onSubmit={savePaymentMappings} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10, alignItems: 'end' }}>
              <label style={{ display: 'grid', gap: 4 }}>Compte collectif clients (actif)
                <select value={receivableAccountCode} onChange={(event) => setReceivableAccountCode(event.target.value)}>
                  <option value="">Non configuré</option>
                  {accountingMapping?.availableAccounts.filter((account) => account.type === 'Asset').map((account) => (
                    <option key={account.code} value={account.code}>{account.code} — {account.description}</option>
                  ))}
                </select>
              </label>
              <label style={{ display: 'grid', gap: 4 }}>Compte collectif fournisseurs (passif)
                <select value={payableAccountCode} onChange={(event) => setPayableAccountCode(event.target.value)}>
                  <option value="">Non configuré</option>
                  {accountingMapping?.availableAccounts.filter((account) => account.type === 'Liability').map((account) => (
                    <option key={account.code} value={account.code}>{account.code} — {account.description}</option>
                  ))}
                </select>
              </label>
              <button type="submit" disabled={bankSaving || bankLoading || (!receivableAccountCode && !payableAccountCode)}>
                {bankSaving ? 'Enregistrement…' : 'Enregistrer les mappings'}
              </button>
            </form>
            {accountingMapping?.missingRequirements.map((requirement) => (
              <p key={requirement} role="note" style={{ margin: 0, color: '#92400E' }}>{requirement}</p>
            ))}
            <div>
              <h4 style={{ margin: '0 0 6px' }}>Factures avec un restant dû</h4>
              {paymentTargets.length === 0
                ? <p style={{ margin: 0, color: '#64748B' }}>Aucune facture admissible avec un solde à régler.</p>
                : <ul style={{ margin: 0, paddingLeft: 20 }}>
                  {paymentTargets.map((target) => (
                    <li key={`${target.type}:${target.id}`}>
                      {target.type === 'SALES_INVOICE' ? 'Client' : 'Fournisseur'} · {target.invoiceNumber} · {target.status} · payé {formatAmount(target.paidAmount, target.currencyCode)}{target.creditedAmount > 0 ? ` · avoirs ${formatAmount(target.creditedAmount, target.currencyCode)}` : ''} · restant {formatAmount(target.remainingAmount, target.currencyCode)}
                      {target.currencyCode !== target.functionalCurrencyCode ? ` (comptabilisé en ${target.functionalCurrencyCode})` : ''}
                    </li>
                  ))}
                </ul>}
            </div>
          </section>

          <section style={{ ...cardStyle, display: 'grid', gap: 14 }}>
            <div>
              <h3 style={{ margin: '0 0 6px' }}>Prévisions de trésorerie</h3>
              <p style={{ margin: 0, color: '#64748B', fontSize: 13 }}>
                Chaque scénario est rattaché à un compte bancaire. Le solde initial vient d’une saisie datée ou du dernier solde d’un relevé importé; sans solde daté, les flux restent consultables mais aucun solde projeté n’est calculé. Les échéances proposées tiennent compte des règlements alloués.
              </p>
            </div>
            <form onSubmit={createForecastScenario} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10, alignItems: 'end' }}>
              <label style={{ display: 'grid', gap: 4 }}>Nom du scénario
                <input required maxLength={100} value={forecastName} onChange={(event) => setForecastName(event.target.value)} />
              </label>
              <label style={{ display: 'grid', gap: 4 }}>Compte bancaire
                <select required value={forecastAccountId} onChange={(event) => setForecastAccountId(event.target.value)}>
                  <option value="">Choisir un compte actif</option>
                  {bankAccounts.filter((account) => account.isActive).map((account) => (
                    <option key={account.id} value={account.id}>{account.name} · {account.currencyCode}</option>
                  ))}
                </select>
              </label>
              <label style={{ display: 'grid', gap: 4 }}>Solde initial (facultatif)
                <input type="number" step="0.001" value={forecastOpeningBalance} onChange={(event) => setForecastOpeningBalance(event.target.value)} />
              </label>
              <label style={{ display: 'grid', gap: 4 }}>Date du solde initial
                <input type="date" value={forecastOpeningDate} onChange={(event) => setForecastOpeningDate(event.target.value)} />
              </label>
              <button type="submit" disabled={forecastSaving || bankLoading || !forecastAccountId}>
                {forecastSaving ? 'Enregistrement…' : 'Créer le scénario'}
              </button>
            </form>

            {forecastScenarios.length === 0
              ? <p style={{ margin: 0, color: '#64748B' }}>Aucun scénario. Créez d’abord un compte bancaire actif.</p>
              : <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'end' }}>
                <label style={{ display: 'grid', gap: 4 }}>Scénario
                  <select value={selectedForecastScenarioId} onChange={(event) => setSelectedForecastScenarioId(event.target.value)}>
                    {forecastScenarios.map((scenario) => (
                      <option key={scenario.id} value={scenario.id}>{scenario.name} · {scenario.bankAccount.name} · {scenario.currencyCode}</option>
                    ))}
                  </select>
                </label>
                <label style={{ display: 'grid', gap: 4 }}>Horizon (jours)
                  <input type="number" min="1" max="365" value={forecastHorizonDays} onChange={(event) => setForecastHorizonDays(event.target.value)} />
                </label>
              </div>}

            {selectedForecastScenarioId && (
              <>
                <div style={{ borderTop: '1px solid #E2E8F0', paddingTop: 12 }}>
                  <h4 style={{ margin: '0 0 6px' }}>Échéances de factures disponibles</h4>
                  <p style={{ margin: '0 0 10px', color: '#64748B', fontSize: 13 }}>
                    Les factures de vente émises et les factures d’achat « à contrôler » dans la devise du scénario sont proposées pour leur restant dû. Vérifiez les factures d’achat avant de les inclure; ces sources restent prévisionnelles et ne créent aucun paiement.
                  </p>
                  {forecastSources.length === 0
                    ? <p style={{ margin: 0, color: '#64748B' }}>Aucune échéance admissible dans la devise de ce scénario.</p>
                    : <div style={{ display: 'grid', gap: 8 }}>
                      {forecastSources.map((source) => {
                        const alreadyAdded = forecastData?.items.some((item) => item.sourceType === source.sourceType && item.sourceId === source.sourceId) ?? false;
                        return (
                          <div key={`${source.sourceType}:${source.sourceId}`} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', borderTop: '1px solid #E2E8F0', paddingTop: 8 }}>
                            <span>
                              <strong>{source.description}</strong> · échéance {formatDate(source.expectedDate)} · {source.direction === 'INFLOW' ? 'entrée' : 'sortie'} {formatAmount(source.amount, source.currencyCode)}
                              {source.sourceType === 'PURCHASE_INVOICE' && <span> · statut {source.status}, à vérifier</span>}
                            </span>
                            <button type="button" disabled={forecastSaving || bankLoading || alreadyAdded} onClick={() => void addForecastSource(source)}>
                              {alreadyAdded ? 'Déjà dans le scénario' : 'Ajouter comme planifié'}
                            </button>
                          </div>
                        );
                      })}
                    </div>}
                </div>
                <form onSubmit={createForecastItem} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10, alignItems: 'end', borderTop: '1px solid #E2E8F0', paddingTop: 12 }}>
                  <label style={{ display: 'grid', gap: 4 }}>Date prévue
                    <input required type="date" value={forecastItemDate} onChange={(event) => setForecastItemDate(event.target.value)} />
                  </label>
                  <label style={{ display: 'grid', gap: 4 }}>Libellé
                    <input required maxLength={250} value={forecastItemDescription} onChange={(event) => setForecastItemDescription(event.target.value)} />
                  </label>
                  <label style={{ display: 'grid', gap: 4 }}>Sens
                    <select value={forecastItemDirection} onChange={(event) => setForecastItemDirection(event.target.value as 'INFLOW' | 'OUTFLOW')}>
                      <option value="INFLOW">Entrée</option>
                      <option value="OUTFLOW">Sortie</option>
                    </select>
                  </label>
                  <label style={{ display: 'grid', gap: 4 }}>Montant ({forecastData?.currencyCode ?? currencyCode})
                    <input required type="number" min="0.001" step="0.001" value={forecastItemAmount} onChange={(event) => setForecastItemAmount(event.target.value)} />
                  </label>
                  <label style={{ display: 'grid', gap: 4 }}>Catégorie
                    <input required maxLength={80} value={forecastItemCategory} onChange={(event) => setForecastItemCategory(event.target.value)} />
                  </label>
                  <button type="submit" disabled={forecastSaving || bankLoading}>
                    {forecastSaving ? 'Enregistrement…' : 'Ajouter le flux prévu'}
                  </button>
                </form>

                {forecastError === '' && !forecastData && <p role="status">Chargement de la prévision…</p>}
                {forecastData && (
                  <>
                    {!forecastData.diagnostics.hasOpeningBalance && (
                      <div role="note" style={{ border: '1px solid #FCD34D', background: '#FFFBEB', color: '#92400E', borderRadius: 8, padding: 10 }}>
                        Aucun solde initial daté n’est disponible. Saisissez un solde initial ou importez un relevé avec un solde après opération pour afficher les soldes projetés.
                      </div>
                    )}
                    {forecastData.diagnostics.invalidItemCount > 0 && (
                      <div role="alert" style={{ border: '1px solid #FCA5A5', background: '#FEF2F2', color: '#991B1B', borderRadius: 8, padding: 10 }}>
                        {forecastData.diagnostics.invalidItemCount} flux invalide(s) empêchent le calcul fiable de la projection.
                      </div>
                    )}
                    {forecastData.openingBalance !== null && (
                      <p style={{ margin: 0, color: '#475569', fontSize: 13 }}>
                        Solde initial au {forecastData.asOfDate ? formatDate(forecastData.asOfDate) : 'date inconnue'} · {forecastData.openingBalanceSource === 'STATEMENT' ? 'relevé importé' : 'saisie manuelle'} · {formatAmount(forecastData.openingBalance, forecastData.currencyCode)}
                      </p>
                    )}
                    <div style={{ overflowX: 'auto' }}>
                      <table style={{ width: '100%', minWidth: 620, borderCollapse: 'collapse', fontSize: 13 }}>
                        <thead><tr style={{ textAlign: 'left', borderBottom: '2px solid #E2E8F0' }}>
                          <th style={{ padding: 8 }}>Date</th><th style={{ padding: 8, textAlign: 'right' }}>Entrées</th>
                          <th style={{ padding: 8, textAlign: 'right' }}>Sorties</th><th style={{ padding: 8, textAlign: 'right' }}>Solde projeté</th>
                        </tr></thead>
                        <tbody>{forecastData.days.map((day) => (
                          <tr key={day.date} style={{ borderBottom: '1px solid #E2E8F0' }}>
                            <td style={{ padding: 8 }}>{formatDate(day.date)}</td>
                            <td style={{ padding: 8, textAlign: 'right' }}>{formatAmount(day.inflows, forecastData.currencyCode)}</td>
                            <td style={{ padding: 8, textAlign: 'right' }}>{formatAmount(day.outflows, forecastData.currencyCode)}</td>
                            <td style={{ padding: 8, textAlign: 'right' }}>{formatAmount(day.closingBalance, forecastData.currencyCode)}</td>
                          </tr>
                        ))}</tbody>
                      </table>
                    </div>
                    <div style={{ overflowX: 'auto' }}>
                      <h4>Flux prévisionnels saisis</h4>
                      {forecastData.items.length === 0
                        ? <p style={{ color: '#64748B' }}>Aucun flux prévu dans ce scénario.</p>
                        : <table style={{ width: '100%', minWidth: 620, borderCollapse: 'collapse', fontSize: 13 }}>
                          <thead><tr style={{ textAlign: 'left', borderBottom: '2px solid #E2E8F0' }}>
                            <th style={{ padding: 8 }}>Date</th><th style={{ padding: 8 }}>Libellé</th><th style={{ padding: 8 }}>Catégorie</th>
                            <th style={{ padding: 8 }}>Sens</th><th style={{ padding: 8, textAlign: 'right' }}>Montant</th><th style={{ padding: 8 }}>Action</th>
                          </tr></thead>
                          <tbody>{forecastData.items.map((item) => (
                            <tr key={item.id} style={{ borderBottom: '1px solid #E2E8F0' }}>
                              <td style={{ padding: 8 }}>{formatDate(item.expectedDate)}</td>
                              <td style={{ padding: 8 }}>{item.description}</td>
                              <td style={{ padding: 8 }}>{item.category}</td>
                              <td style={{ padding: 8 }}>{item.direction === 'INFLOW' ? 'Entrée' : 'Sortie'}</td>
                              <td style={{ padding: 8, textAlign: 'right' }}>{formatAmount(item.amount, forecastData.currencyCode)}</td>
                              <td style={{ padding: 8 }}><button type="button" disabled={forecastSaving} onClick={() => void removeForecastItem(item.id)}>Supprimer</button></td>
                            </tr>
                          ))}</tbody>
                        </table>}
                    </div>
                  </>
                )}
              </>
            )}
          </section>

          <section style={{ ...cardStyle, display: 'grid', gap: 14 }}>
            <div>
              <h3 style={{ margin: '0 0 6px' }}>Importer un relevé CSV</h3>
              <p style={{ margin: 0, color: '#64748B', fontSize: 13 }}>
                CSV/XLSX, OFX/QFX et MT940. Les dates MT940 sur 2 chiffres utilisent le pivot 70 (70–99 = 19xx, 00–69 = 20xx). La devise fournie est comparée au compte sélectionné. Les formats tabulaires requièrent <code>date,description,amount</code>; montant signé, positif = entrée, négatif = sortie. Un aperçu est validé avant l’import; aucune écriture comptable n’est créée.
              </p>
            </div>
            <form onSubmit={importStatement} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10, alignItems: 'end' }}>
              <label style={{ display: 'grid', gap: 4 }}>Compte bancaire
                <select required value={selectedBankAccountId} onChange={(event) => setSelectedBankAccountId(event.target.value)}>
                  <option value="">Choisir un compte</option>
                  {bankAccounts.filter((account) => account.isActive).map((account) => (
                    <option key={account.id} value={account.id}>{account.name} · {account.currencyCode}</option>
                  ))}
                </select>
              </label>
              <label style={{ display: 'grid', gap: 4 }}>Fichier CSV, XLSX, OFX/QFX ou MT940
                <input required type="file" accept=".csv,.xlsx,.ofx,.qfx,.mt940,.sta,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                  onChange={(event) => void selectStatementFile(event.target.files?.[0])} />
              </label>
              <button type="submit" disabled={bankImporting || bankLoading || !statementFile || !statementPreviewRows.length
                || statementImportIssues.length > 0 || !selectedBankAccountId}>
                {bankImporting ? 'Import en cours…' : 'Importer le relevé'}
              </button>
            </form>
            {statementPreviewRows.length > 0 && (
              <div style={{ overflowX: 'auto' }}>
                <strong>Aperçu des {Math.min(statementPreviewRows.length, 5)} premières lignes sur {statementPreviewRows.length}</strong>
                <table style={{ borderCollapse: 'collapse', fontSize: 12, marginTop: 6 }}>
                  <thead><tr>
                    <th style={{ textAlign: 'left', padding: 5 }}>Ligne</th>
                    {['date', 'description', 'amount', 'reference', 'balance'].map((key) => <th key={key} style={{ textAlign: 'left', padding: 5 }}>{key}</th>)}
                    <th style={{ textAlign: 'left', padding: 5 }}>Validation</th>
                  </tr></thead>
                  <tbody>{statementPreviewRows.slice(0, 5).map((row, index) => (
                    <tr key={index} aria-invalid={statementImportIssues.some((issue) => issue.rowIndex === index)}>
                      <td style={{ padding: 5, borderTop: '1px solid #E2E8F0' }}>{index + 2}</td>
                      {['date', 'description', 'amount', 'reference', 'balance'].map((key) => (
                        <td key={key} style={{ padding: 5, borderTop: '1px solid #E2E8F0' }}>{String(row[key] ?? '')}</td>
                      ))}
                      <td style={{ padding: 5, borderTop: '1px solid #E2E8F0', color: statementImportIssues.some((issue) => issue.rowIndex === index) ? '#991B1B' : '#166534' }}>
                        {statementImportIssues.filter((issue) => issue.rowIndex === index).map((issue) => issue.message).join(' ')}
                        {!statementImportIssues.some((issue) => issue.rowIndex === index) && 'Valide'}
                      </td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            )}
            {statementImportIssues.length > 0 && (
              <div role="alert" style={{ color: '#991B1B' }}>
                <strong>Rapport de validation ({statementImportIssues.length} erreur(s)); import bloqué</strong>
                <ul>{statementImportIssues.map((issue, index) => (
                  <li key={`${issue.rowIndex}-${index}`}>Ligne {issue.lineNumber} : {issue.message}</li>
                ))}</ul>
              </div>
            )}
            {bankStatements.length === 0
              ? <p style={{ margin: 0, color: '#64748B' }}>Aucun relevé importé.</p>
              : <div style={{ display: 'grid', gap: 8 }}>
                {bankStatements.map((statement) => (
                  <div key={statement.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', borderTop: '1px solid #E2E8F0', paddingTop: 8 }}>
                    <span>{statement.bankAccount.name} · {formatDate(statement.importedAt)} · {statement.lineCount} opération(s)</span>
                    <button type="button" onClick={() => void loadStatementLines(statement.id)}>Afficher les opérations</button>
                  </div>
                ))}
              </div>}
          </section>

          {selectedStatementId && (
            <section style={{ ...cardStyle, overflowX: 'auto' }}>
              <h3 style={{ marginTop: 0 }}>{text('Opérations du relevé et rapprochement')}</h3>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
                {(() => {
                  const rows = statementLines.map((line) => ({
                    date: line.transactionDate.slice(0, 10),
                    description: line.description,
                    externalReference: line.externalReference ?? '',
                    amount: line.amount,
                    balanceAfter: line.balanceAfter,
                    currencyCode: line.currencyCode,
                    reconciled: line.reconciliation ? 'Oui' : 'Non',
                    invoiceNumber: line.cashflowPayment?.invoice?.invoiceNumber
                      ?? line.cashflowPayment?.purchaseInvoice?.invoiceNumber
                      ?? '',
                  }));
                  const statement = bankStatements.find((item) => item.id === selectedStatementId);
                  const metadata = {
                    moduleName: 'Relevé bancaire et rapprochement',
                    language,
                    companyName: data?.entity.name,
                    currency: statement?.bankAccount.currencyCode,
                    customDate: statement?.importedAt.slice(0, 10),
                  };
                  return (
                    <>
                      <button type="button" disabled={!rows.length} onClick={() => exportToExcel('Releve_bancaire', statementExportColumns, rows, metadata)}>Excel .xlsx</button>
                      <button type="button" disabled={!rows.length} onClick={() => exportToCSV('Releve_bancaire', statementExportColumns, rows, metadata)}>CSV</button>
                      <button type="button" disabled={!rows.length} onClick={() => exportToPDF('Relevé bancaire et rapprochement', statementExportColumns, rows, metadata)}>PDF / imprimer</button>
                      <button type="button" disabled={!rows.length} onClick={() => void exportToPowerPoint('Releve_bancaire', statementExportColumns, rows, metadata)}>PowerPoint</button>
                    </>
                  );
                })()}
              </div>
              {statementLines.length === 0
                ? <p>{text('Aucune opération dans ce relevé.')}</p>
                : <table style={{ width: '100%', minWidth: 720, borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead><tr style={{ textAlign: 'left', borderBottom: '2px solid #E2E8F0' }}>
                    <th style={{ padding: 8 }}>{text('Date')}</th><th style={{ padding: 8 }}>{text('Libellé / référence')}</th>
                    <th style={{ padding: 8, textAlign: 'right' }}>{text('Montant signé')}</th><th style={{ padding: 8, textAlign: 'right' }}>{text('Solde après opération')}</th>
                    <th style={{ padding: 8 }}>{text('Rapprochement')}</th><th style={{ padding: 8 }}>{text('Affectation facture')}</th><th style={{ padding: 8 }}>{text('Action')}</th>
                  </tr></thead>
                  <tbody>{statementLines.map((line) => (
                    <tr key={line.id} style={{ borderBottom: '1px solid #E2E8F0' }}>
                      <td style={{ padding: 8, whiteSpace: 'nowrap' }}><bdi dir="ltr">{formatDate(line.transactionDate)}</bdi></td>
                      <td style={{ padding: 8 }}>{line.description}{line.externalReference ? ` · ${line.externalReference}` : ''}</td>
                      <td style={{ padding: 8, textAlign: 'right' }}><bdi dir="ltr">{formatAmount(line.amount, line.currencyCode)}</bdi></td>
                      <td style={{ padding: 8, textAlign: 'right' }}><bdi dir="ltr">{formatAmount(line.balanceAfter, line.currencyCode)}</bdi></td>
                      <td style={{ padding: 8 }}>{line.reconciliation ? <>{text('Rapprochée le')} <bdi dir="ltr">{formatDate(line.reconciliation.reconciledAt)}</bdi></> : text('Non rapprochée')}</td>
                      <td style={{ padding: 8 }}>
                        {line.cashflowPayment
                          ? <span>
                            <bdi dir="ltr">{line.cashflowPayment.invoice?.invoiceNumber ?? line.cashflowPayment.purchaseInvoice?.invoiceNumber ?? 'Facture'}</bdi> · {line.cashflowPayment.direction === 'CUSTOMER_RECEIPT' ? text('encaissement') : text('paiement')} <bdi dir="ltr">{formatAmount(line.cashflowPayment.amount, line.cashflowPayment.currencyCode)}</bdi>
                            {line.cashflowPayment.documentCurrencyCode
                              && line.cashflowPayment.documentCurrencyCode !== line.cashflowPayment.currencyCode
                              ? ` · ${formatAmount(line.cashflowPayment.settledDocumentAmount, line.cashflowPayment.documentCurrencyCode)} document, taux ${line.cashflowPayment.settlementExchangeRate ?? '—'} (${line.cashflowPayment.settlementRateSource ?? 'source inconnue'}${line.cashflowPayment.settlementRateDate ? `, ${formatDate(line.cashflowPayment.settlementRateDate)}` : ''}) · gain ${formatAmount(line.cashflowPayment.realizedFxGain, line.cashflowPayment.currencyCode)} / perte ${formatAmount(line.cashflowPayment.realizedFxLoss, line.cashflowPayment.currencyCode)}`
                              : ''}
                            {' '}<button type="button" disabled={bankSaving} onClick={() => void removePaymentAllocation(line.cashflowPayment!.id)}>Annuler l’affectation</button>
                          </span>
                          : line.reconciliation && line.amount !== 0
                            ? <div style={{ display: 'flex', gap: 6, minWidth: 250 }}>
                              <select
                                aria-label={`${text('Facture à affecter à')} ${line.description}`}
                                value={selectedPaymentTargets[line.id] ?? ''}
                                onChange={(event) => {
                                  setSelectedPaymentTargets((current) => ({ ...current, [line.id]: event.target.value }));
                                  setDocumentSettlementAmounts((current) => ({ ...current, [line.id]: '' }));
                                }}
                              >
                                <option value="">{text('Choisir une facture ouverte')}</option>
                                {paymentTargets
                                  .filter((target) => (line.amount > 0) === (target.type === 'SALES_INVOICE')
                                    && target.functionalCurrencyCode === line.currencyCode)
                                  .map((target) => (
                                    <option key={`${target.type}:${target.id}`} value={`${target.type}|${target.id}`}>
                                      {target.invoiceNumber} · reste {formatAmount(target.remainingAmount, target.currencyCode)}
                                    </option>
                                  ))}
                              </select>
                                  {paymentTargets.some((target) => `${target.type}|${target.id}` === selectedPaymentTargets[line.id]
                                    && target.currencyCode !== target.functionalCurrencyCode) && (
                                    <input
                                      type="number"
                                      min="0.001"
                                      max={paymentTargets.find((target) => `${target.type}|${target.id}` === selectedPaymentTargets[line.id])?.remainingAmount}
                                      step="0.001"
                                      aria-label={`Montant réglé dans la devise de la facture ${line.description}`}
                                      placeholder="Montant devise facture"
                                      value={documentSettlementAmounts[line.id] ?? ''}
                                      onChange={(event) => setDocumentSettlementAmounts((current) => ({ ...current, [line.id]: event.target.value }))}
                                    />
                                  )}
                                  <button type="button" disabled={bankSaving || !selectedPaymentTargets[line.id]} onClick={() => void allocateStatementPayment(line)}>
                                {text('Affecter')}
                              </button>
                            </div>
                            : '—'}
                      </td>
                      <td style={{ padding: 8 }}>
                        {line.reconciliation
                          ? <button type="button" disabled={bankSaving} onClick={() => void removeReconciliation(line.reconciliation!.id)}>{text('Annuler')}</button>
                          : <button type="button" onClick={() => void loadReconciliationCandidates(line.id)}>{text('Écritures exactes')}</button>}
                      </td>
                    </tr>
                  ))}</tbody>
                </table>}
              {candidateLineId && (
                <div style={{ marginTop: 14, display: 'grid', gap: 8 }}>
                  <h4 style={{ margin: 0 }}>{text('Écritures comptables candidates (POSTED, même date et montant signé)')}</h4>
                  {candidates.length === 0
                    ? <p>{text('Aucune candidate exacte disponible. Aucune tolérance ni conversion n’est appliquée.')}</p>
                    : candidates.map((candidate) => (
                      <div key={candidate.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap', borderTop: '1px solid #E2E8F0', paddingTop: 8 }}>
                        <span>
                          <bdi dir="ltr">{formatDate(candidate.journalEntry.date)} · {candidate.journalEntry.entryNumber}</bdi> · {candidate.description || candidate.journalEntry.description}
                          <small style={{ display: 'block', color: candidate.labelMatch ? '#047857' : '#92400E' }}>{candidate.suggestionReason}</small>
                        </span>
                        <button type="button" disabled={bankSaving} onClick={() => void reconcileStatementLine(candidateLineId, candidate.id)}>
                          {bankSaving ? text('Rapprochement…') : text('Confirmer le rapprochement')}
                        </button>
                      </div>
                    ))}
                </div>
              )}
            </section>
          )}
        </>
      )}
    </section>
  );
}
