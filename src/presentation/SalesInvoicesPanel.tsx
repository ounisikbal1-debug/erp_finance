import React, { useEffect, useState } from 'react';
import TunisianInvoicePrintModal, { type PrintableInvoiceData } from './TunisianInvoicePrintModal';
import { exportToExcel, exportToPDF, exportToPowerPoint } from './exportUtils';
import ImportPreviewPanel from './ImportPreviewPanel';
import CustomerContactsPanel from './CustomerContactsPanel';
import SalesQuotesPanel from './SalesQuotesPanel';
import SalesOrdersPanel from './SalesOrdersPanel';
import {
  collectSalesInvoicePages,
  mapSalesInvoicesToExportRows,
  salesInvoiceExportColumns,
  serializeSalesInvoiceCsv,
} from './sales-invoice-export';
import { toStockQuantityMilliUnits } from '../application/modules/materials/quantity';
import { getHtmlLanguage, translateBusinessText, useInterfaceLanguage } from './localization';

interface SalesInvoice {
  id: string;
  invoiceNumber: string;
  createdAt: string;
  dueDate: string | null;
  currencyCode: string | null;
  subTotal: number;
  taxAmount: number;
  totalAmount: number;
  documentCurrencyCode: string | null;
  documentSubTotal: number | null;
  documentTaxAmount: number | null;
  documentStampDuty: number | null;
  documentTotalAmount: number | null;
  functionalCurrencyCode: string | null;
  exchangeRate: number | null;
  exchangeRateDate: string | null;
  exchangeRateSource: string | null;
  exchangeRateImportedAt: string | null;
  status: string;
  createdByUsername: string | null;
  approvedByUsername: string | null;
  approvedAt: string | null;
  issuedByUsername: string | null;
  issuedAt: string | null;
  postingJournalEntryId: string | null;
  salesOrderLink: null | { salesOrder: { orderNumber: string } };
  workflowEvents: Array<{ action: string; actorUsername: string; note: string; createdAt: string }>;
  customer: { name: string };
}

interface SalesInvoicePagination {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

interface SalesInvoicePage {
  items: SalesInvoice[];
  pagination: SalesInvoicePagination;
}

const INVOICE_PAGE_SIZE = 50;
const INVOICE_EXPORT_PAGE_SIZE = 100;

interface SalesCustomer {
  id: string;
  code: string;
  name: string;
}

interface SalesMaterial {
  id: string;
  sku: string;
  name: string;
  unitCode: string;
  unitPrice: number;
}

interface ConfiguredTaxRate {
  code: string;
  name: string;
  rate: number;
}

interface SalesConfiguration {
  countryCode: string;
  currencyCode: string;
  currencySymbol: string;
  rates: ConfiguredTaxRate[];
  missingRequirements: string[];
}

interface FxRateSuggestion {
  available: boolean;
  documentCurrencyCode: string;
  functionalCurrencyCode: string;
  exchangeRate: number | null;
  exchangeRateDate: string | null;
  exchangeRateSource: string | null;
  exchangeRateImportedAt: string | null;
  message?: string;
}

interface InvoiceDraftLine {
  description: string;
  quantity: string;
  unitPrice: string;
  taxRate: string;
  materialId?: string;
}

interface SalesInvoicesPanelProps {
  accessToken: string | null;
  entityId: string | null;
  currency: string;
}

function isSalesInvoiceList(value: unknown): value is SalesInvoice[] {
  return Array.isArray(value) && value.every((invoice) => (
    invoice !== null
    && typeof invoice === 'object'
    && 'id' in invoice && typeof invoice.id === 'string'
    && 'invoiceNumber' in invoice && typeof invoice.invoiceNumber === 'string'
    && 'createdAt' in invoice && typeof invoice.createdAt === 'string'
    && 'dueDate' in invoice && (invoice.dueDate === null || typeof invoice.dueDate === 'string')
    && 'currencyCode' in invoice
    && (invoice.currencyCode === null || typeof invoice.currencyCode === 'string')
    && 'subTotal' in invoice && typeof invoice.subTotal === 'number' && Number.isFinite(invoice.subTotal)
    && 'taxAmount' in invoice && typeof invoice.taxAmount === 'number' && Number.isFinite(invoice.taxAmount)
    && 'totalAmount' in invoice && typeof invoice.totalAmount === 'number' && Number.isFinite(invoice.totalAmount)
    && ['documentCurrencyCode', 'functionalCurrencyCode', 'exchangeRateDate', 'exchangeRateSource', 'exchangeRateImportedAt']
      .every((field) => field in invoice && (invoice[field] === null || typeof invoice[field] === 'string'))
    && ['documentSubTotal', 'documentTaxAmount', 'documentStampDuty', 'documentTotalAmount', 'exchangeRate']
      .every((field) => field in invoice && (invoice[field] === null || (typeof invoice[field] === 'number' && Number.isFinite(invoice[field]))))
    && ['createdByUsername', 'approvedByUsername', 'approvedAt', 'issuedByUsername', 'issuedAt', 'postingJournalEntryId']
      .every((field) => field in invoice && (invoice[field] === null || typeof invoice[field] === 'string'))
    && 'salesOrderLink' in invoice
    && (invoice.salesOrderLink === null || (invoice.salesOrderLink !== null
      && typeof invoice.salesOrderLink === 'object'
      && 'salesOrder' in invoice.salesOrderLink
      && invoice.salesOrderLink.salesOrder !== null
      && typeof invoice.salesOrderLink.salesOrder === 'object'
      && 'orderNumber' in invoice.salesOrderLink.salesOrder
      && typeof invoice.salesOrderLink.salesOrder.orderNumber === 'string'))
    && 'workflowEvents' in invoice && Array.isArray(invoice.workflowEvents)
    && invoice.workflowEvents.every((item: unknown) => item && typeof item === 'object'
      && 'action' in item && typeof item.action === 'string'
      && 'actorUsername' in item && typeof item.actorUsername === 'string'
      && 'note' in item && typeof item.note === 'string'
      && 'createdAt' in item && typeof item.createdAt === 'string')
    && 'status' in invoice && typeof invoice.status === 'string'
    && 'customer' in invoice
    && invoice.customer !== null
    && typeof invoice.customer === 'object'
    && 'name' in invoice.customer && typeof invoice.customer.name === 'string'
  ));
}

function isSalesInvoicePage(value: unknown): value is SalesInvoicePage {
  if (!value || typeof value !== 'object' || !('items' in value) || !('pagination' in value)
    || !isSalesInvoiceList(value.items)
    || !value.pagination || typeof value.pagination !== 'object') {
    return false;
  }
  const pagination = value.pagination;
  return 'page' in pagination && typeof pagination.page === 'number'
    && Number.isSafeInteger(pagination.page) && pagination.page >= 1
    && 'pageSize' in pagination && typeof pagination.pageSize === 'number'
    && Number.isSafeInteger(pagination.pageSize) && pagination.pageSize >= 1 && pagination.pageSize <= 100
    && 'total' in pagination && typeof pagination.total === 'number'
    && Number.isSafeInteger(pagination.total) && pagination.total >= 0
    && 'totalPages' in pagination && typeof pagination.totalPages === 'number'
    && Number.isSafeInteger(pagination.totalPages) && pagination.totalPages >= 0;
}

function isSalesCustomerList(value: unknown): value is SalesCustomer[] {
  return Array.isArray(value) && value.every((customer) => (
    customer !== null
    && typeof customer === 'object'
    && 'id' in customer && typeof customer.id === 'string'
    && 'code' in customer && typeof customer.code === 'string'
    && 'name' in customer && typeof customer.name === 'string'
  ));
}

function isSalesMaterialList(value: unknown): value is SalesMaterial[] {
  return Array.isArray(value) && value.every((material) => (
    material !== null && typeof material === 'object'
    && 'id' in material && typeof material.id === 'string'
    && 'sku' in material && typeof material.sku === 'string'
    && 'name' in material && typeof material.name === 'string'
    && 'unitCode' in material && typeof material.unitCode === 'string'
    && 'unitPrice' in material && typeof material.unitPrice === 'number' && Number.isFinite(material.unitPrice)
  ));
}

function isSalesConfiguration(value: unknown): value is SalesConfiguration {
  return value !== null && typeof value === 'object'
    && 'countryCode' in value && typeof value.countryCode === 'string'
    && 'currencyCode' in value && typeof value.currencyCode === 'string'
    && 'currencySymbol' in value && typeof value.currencySymbol === 'string'
    && 'rates' in value && Array.isArray(value.rates) && value.rates.every((taxRate) => (
    taxRate !== null
    && typeof taxRate === 'object'
    && 'code' in taxRate && typeof taxRate.code === 'string'
    && 'name' in taxRate && typeof taxRate.name === 'string'
    && 'rate' in taxRate && typeof taxRate.rate === 'number' && Number.isFinite(taxRate.rate)
  ))
  && 'missingRequirements' in value && Array.isArray(value.missingRequirements)
  && value.missingRequirements.every((requirement) => typeof requirement === 'string');
}

function formatAmount(amount: number, currency: string): string {
  return `${amount.toLocaleString('fr-FR', { minimumFractionDigits: 3, maximumFractionDigits: 3 })} ${currency}`;
}

function getNextMonthStart(value: string): string {
  const date = new Date(`${value.slice(0, 10)}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) throw new Error('Date de facture client invalide.');
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1)).toISOString().slice(0, 10);
}

export default function SalesInvoicesPanel({ accessToken, entityId, currency }: SalesInvoicesPanelProps) {
  const language = useInterfaceLanguage();
  const text = (value: string) => translateBusinessText(language, value);
  const [invoices, setInvoices] = useState<SalesInvoice[] | null>(null);
  const [invoicePagination, setInvoicePagination] = useState<SalesInvoicePagination | null>(null);
  const [invoicePage, setInvoicePage] = useState(1);
  const [customers, setCustomers] = useState<SalesCustomer[]>([]);
  const [materials, setMaterials] = useState<SalesMaterial[]>([]);
  const [taxRates, setTaxRates] = useState<ConfiguredTaxRate[]>([]);
  const [salesCountryCode, setSalesCountryCode] = useState('');
  const [salesCurrencyLabel, setSalesCurrencyLabel] = useState('');
  const [functionalCurrencyCode, setFunctionalCurrencyCode] = useState('');
  const [postingIssues, setPostingIssues] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [formError, setFormError] = useState('');
  const [customerFormError, setCustomerFormError] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [customerFormOpen, setCustomerFormOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [workflowBusyId, setWorkflowBusyId] = useState('');
  const [workflowNotes, setWorkflowNotes] = useState<Record<string, string>>({});
  const [cancellationDates, setCancellationDates] = useState<Record<string, string>>({});
  const [customerSaving, setCustomerSaving] = useState(false);
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [customerId, setCustomerId] = useState('');
  const [customerCode, setCustomerCode] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [invoiceLines, setInvoiceLines] = useState<InvoiceDraftLine[]>([
    { description: '', quantity: '1', unitPrice: '', taxRate: '', materialId: '' },
  ]);
  const [issueDate, setIssueDate] = useState(new Date().toISOString().slice(0, 10));
  const [dueDate, setDueDate] = useState('');
  const [documentCurrencyCode, setDocumentCurrencyCode] = useState('');
  const [exchangeRate, setExchangeRate] = useState('');
  const [exchangeRateDate, setExchangeRateDate] = useState(new Date().toISOString().slice(0, 10));
  const [exchangeRateSource, setExchangeRateSource] = useState('');
  const [exchangeRateImportedAt, setExchangeRateImportedAt] = useState('');
  const [fxSuggestionMessage, setFxSuggestionMessage] = useState('');
  const [printModalInvoice, setPrintModalInvoice] = useState<PrintableInvoiceData | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setInvoices(null);
    setInvoicePagination(null);
    setError('');
    if (!accessToken || !entityId) {
      setLoading(false);
      setCustomers([]);
      setMaterials([]);
      setTaxRates([]);
      setSalesCountryCode('');
      setSalesCurrencyLabel('');
      setFunctionalCurrencyCode('');
      setPostingIssues([]);
      setError(!accessToken
        ? 'Session API invalide. Déconnectez-vous puis reconnectez-vous.'
        : 'Aucune société réelle n’est associée au compte connecté.');
      return () => controller.abort();
    }

    const loadInvoices = async () => {
      setLoading(true);
      try {
        const headers = { Authorization: `Bearer ${accessToken}` };
        const invoiceQuery = new URLSearchParams({
          page: String(invoicePage),
          pageSize: String(INVOICE_PAGE_SIZE),
        });
        const [invoiceResponse, customerResponse, rateResponse, materialResponse] = await Promise.all([
          fetch(`/api/sales/invoices?${invoiceQuery}`, { headers, signal: controller.signal }),
          fetch('/api/sales/customers', { headers, signal: controller.signal }),
          fetch('/api/sales/tax-rates', { headers, signal: controller.signal }),
          fetch('/api/materials/materials', { headers, signal: controller.signal }),
        ]);
        const [invoicePayload, customerPayload, ratePayload, materialPayload]: unknown[] = await Promise.all([
          invoiceResponse.json(),
          customerResponse.json(),
          rateResponse.json(),
          materialResponse.json(),
        ]);
        for (const [response, payload, fallback] of [
          [invoiceResponse, invoicePayload, 'Impossible de charger les factures de vente.'],
          [customerResponse, customerPayload, 'Impossible de charger les clients.'],
          [rateResponse, ratePayload, 'Impossible de charger les taux configurés.'],
          [materialResponse, materialPayload, 'Impossible de charger les articles.'],
        ] as const) {
          if (!response.ok) {
            const message = payload && typeof payload === 'object' && 'error' in payload
              && typeof payload.error === 'string'
              ? payload.error
              : fallback;
            throw new Error(message);
          }
        }
        if (!isSalesInvoicePage(invoicePayload)) throw new Error('La réponse des factures de vente est invalide.');
        if (!isSalesCustomerList(customerPayload)) throw new Error('La réponse des clients est invalide.');
        if (!isSalesConfiguration(ratePayload)) throw new Error('La réponse de configuration commerciale est invalide.');
        if (!isSalesMaterialList(materialPayload)) throw new Error('La réponse des articles est invalide.');
        setInvoices(invoicePayload.items);
        setInvoicePagination(invoicePayload.pagination);
        if (invoicePayload.pagination.page !== invoicePage) setInvoicePage(invoicePayload.pagination.page);
        setCustomers(customerPayload);
        setMaterials(materialPayload);
        setTaxRates(ratePayload.rates);
        setSalesCountryCode(ratePayload.countryCode.trim().toUpperCase());
        setSalesCurrencyLabel(`${ratePayload.currencyCode} (${ratePayload.currencySymbol})`);
        setFunctionalCurrencyCode(ratePayload.currencyCode);
        setDocumentCurrencyCode((current) => current || ratePayload.currencyCode);
        setPostingIssues(ratePayload.missingRequirements);
        setCustomerId((current) => customerPayload.some((customer) => customer.id === current)
          ? current
          : customerPayload[0]?.id ?? '');
        setInvoiceLines((current) => current.map((line) => ({
          ...line,
          taxRate: ratePayload.rates.some((configuredRate) => String(configuredRate.rate) === line.taxRate)
            ? line.taxRate
            : ratePayload.rates[0] ? String(ratePayload.rates[0].rate) : '',
        })));
      } catch (requestError) {
        if (!controller.signal.aborted) {
          setError(requestError instanceof Error ? requestError.message : 'Impossible de charger les factures de vente.');
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };

    void loadInvoices();
    return () => controller.abort();
  }, [accessToken, entityId, invoicePage, refreshVersion]);

  useEffect(() => {
    setInvoicePage(1);
  }, [entityId]);

  useEffect(() => {
    const handleImported = (event: Event) => {
      if ((event as CustomEvent<{ kind?: string }>).detail?.kind === 'customer') {
        setRefreshVersion((version) => version + 1);
      }
    };
    window.addEventListener('safe:master-data-imported', handleImported);
    return () => window.removeEventListener('safe:master-data-imported', handleImported);
  }, []);

  const getInvoiceExportRows = async () => {
    if (!accessToken) throw new Error('Session API invalide. Déconnectez-vous puis reconnectez-vous.');
    const allInvoices = await collectSalesInvoicePages(async (page, pageSize) => {
      const query = new URLSearchParams({
        page: String(page),
        pageSize: String(pageSize),
      });
      const response = await fetch(`/api/sales/invoices?${query}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const payload: unknown = await response.json();
      if (!response.ok) {
        const message = payload && typeof payload === 'object' && 'error' in payload
          && typeof payload.error === 'string'
          ? payload.error
          : 'Impossible de charger toutes les factures de vente pour l’export.';
        throw new Error(message);
      }
      if (!isSalesInvoicePage(payload)) throw new Error('La réponse des factures de vente est invalide.');
      return payload;
    }, INVOICE_EXPORT_PAGE_SIZE);
    return mapSalesInvoicesToExportRows(allInvoices);
  };

  const exportInvoicesExcel = async () => {
    if (!invoices) return;
    try {
      exportToExcel('Factures_ventes', salesInvoiceExportColumns, await getInvoiceExportRows(), {
        moduleName: 'Factures de vente',
        companyName: 'Société authentifiée',
        currency: functionalCurrencyCode || currency,
      });
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Impossible de préparer l’export des factures.');
    }
  };

  const exportInvoicesCsv = async () => {
    if (!invoices) return;
    try {
      const csv = serializeSalesInvoiceCsv(await getInvoiceExportRows(), salesInvoiceExportColumns);
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `Factures_ventes_${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Impossible de préparer l’export des factures.');
    }
  };

  const exportInvoicesPdf = async () => {
    if (!invoices) return;
    try {
      exportToPDF('Factures de vente', salesInvoiceExportColumns, await getInvoiceExportRows(), {
        moduleName: 'Factures de vente',
        companyName: 'Société authentifiée',
        currency: functionalCurrencyCode || currency,
      });
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Impossible de préparer l’export des factures.');
    }
  };

  const exportInvoicesPowerPoint = async () => {
    if (!invoices) return;
    try {
      exportToPowerPoint('Factures_ventes', salesInvoiceExportColumns, await getInvoiceExportRows(), {
        moduleName: 'Factures de vente',
        companyName: 'Société authentifiée',
        currency: functionalCurrencyCode || currency,
      });
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Impossible de préparer l’export des factures.');
    }
  };

  const createInvoice = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!accessToken || !entityId) {
      setFormError('Session API invalide. Déconnectez-vous puis reconnectez-vous.');
      return;
    }
    const items = invoiceLines.map((line) => ({
      description: line.description.trim(),
      quantity: Number(line.quantity),
      unitPrice: Number(line.unitPrice),
      taxRate: Number(line.taxRate),
      materialId: line.materialId || null,
    }));
    if (!customerId || items.some((item) => !item.description
      || toStockQuantityMilliUnits(item.quantity) === null || item.quantity <= 0
      || !Number.isFinite(item.unitPrice) || item.unitPrice < 0
      || !Number.isFinite(item.taxRate))) {
      setFormError('Vérifiez chaque ligne : libellé, quantité, prix unitaire et taux configuré sont requis.');
      return;
    }
    if (documentCurrencyCode !== functionalCurrencyCode
      && (!exchangeRate || !exchangeRateDate || !exchangeRateSource.trim())) {
      setFormError('Pour une devise étrangère, indiquez le taux, sa date et sa source, ou chargez le cours BCT du jour.');
      return;
    }

    setSaving(true);
    setFormError('');
    try {
      const response = await fetch('/api/sales/invoices', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          customerId,
          entityId,
          issueDate,
          dueDate: dueDate || undefined,
          documentCurrencyCode,
          exchangeRate: documentCurrencyCode === functionalCurrencyCode ? undefined : Number(exchangeRate),
          exchangeRateDate: documentCurrencyCode === functionalCurrencyCode ? undefined : exchangeRateDate,
          exchangeRateSource: documentCurrencyCode === functionalCurrencyCode ? undefined : exchangeRateSource,
          exchangeRateImportedAt: documentCurrencyCode === functionalCurrencyCode ? undefined : exchangeRateImportedAt || undefined,
          items,
        }),
      });
      const payload: unknown = await response.json();
      if (!response.ok) {
        const message = payload && typeof payload === 'object' && 'error' in payload
          && typeof payload.error === 'string'
          ? payload.error
          : 'La facture n’a pas pu être enregistrée.';
        throw new Error(message);
      }
      if (!payload || typeof payload !== 'object' || !('id' in payload) || typeof payload.id !== 'string') {
        throw new Error('La réponse de création de facture est invalide.');
      }
      setFormOpen(false);
      setDueDate('');
      setInvoiceLines([{ description: '', quantity: '1', unitPrice: '', taxRate: taxRates[0] ? String(taxRates[0].rate) : '', materialId: '' }]);
      setInvoicePage(1);
      setRefreshVersion((version) => version + 1);
    } catch (requestError) {
      setFormError(requestError instanceof Error ? requestError.message : 'La facture n’a pas pu être enregistrée.');
    } finally {
      setSaving(false);
    }
  };

  const runInvoiceWorkflow = async (invoiceId: string, action: 'approve' | 'reject' | 'issue' | 'cancel') => {
    if (!accessToken || workflowBusyId) return;
    setWorkflowBusyId(invoiceId);
    setError('');
    try {
      const response = await fetch(`/api/sales/invoices/${encodeURIComponent(invoiceId)}/${action}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          note: workflowNotes[invoiceId] ?? '',
          ...(action === 'cancel'
            ? { date: cancellationDates[invoiceId] ?? getNextMonthStart(invoices?.find((invoice) => invoice.id === invoiceId)?.createdAt ?? '') }
            : {}),
        }),
      });
      const payload: unknown = await response.json();
      if (!response.ok) {
        const message = payload && typeof payload === 'object' && 'error' in payload
          && typeof payload.error === 'string' ? payload.error : 'La transition de la facture a échoué.';
        throw new Error(message);
      }
      setWorkflowNotes((previous) => ({ ...previous, [invoiceId]: '' }));
      setRefreshVersion((version) => version + 1);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'La transition de la facture a échoué.');
    } finally {
      setWorkflowBusyId('');
    }
  };

  const createCustomer = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!accessToken || !entityId) {
      setCustomerFormError('Session API invalide. Déconnectez-vous puis reconnectez-vous.');
      return;
    }
    if (!customerCode.trim() || !customerName.trim()) {
      setCustomerFormError('Le code et le nom du client sont obligatoires.');
      return;
    }

    setCustomerSaving(true);
    setCustomerFormError('');
    try {
      const response = await fetch('/api/sales/customers', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ entityId, code: customerCode.trim(), name: customerName.trim() }),
      });
      const payload: unknown = await response.json();
      if (!response.ok) {
        const message = payload && typeof payload === 'object' && 'error' in payload
          && typeof payload.error === 'string'
          ? payload.error
          : 'Le client n’a pas pu être enregistré.';
        throw new Error(message);
      }
      if (!payload || typeof payload !== 'object' || !('id' in payload) || typeof payload.id !== 'string') {
        throw new Error('La réponse de création du client est invalide.');
      }
      setCustomerId(payload.id);
      setCustomerCode('');
      setCustomerName('');
      setCustomerFormOpen(false);
      setRefreshVersion((version) => version + 1);
    } catch (requestError) {
      setCustomerFormError(requestError instanceof Error ? requestError.message : 'Le client n’a pas pu être enregistré.');
    } finally {
      setCustomerSaving(false);
    }
  };

  const cardStyle: React.CSSProperties = {
    background: '#FFFFFF',
    border: '1px solid #E2E8F0',
    borderRadius: '10px',
    padding: '16px',
  };
  const displayCurrency = salesCurrencyLabel || currency;
  const documentAmount = (foreign: number | null, functional: number, foreignCurrency: string | null, savedFunctional: string | null) => {
    const docCode = foreignCurrency ?? savedFunctional ?? functionalCurrencyCode ?? 'Devise inconnue';
    const functionCode = savedFunctional ?? functionalCurrencyCode ?? 'Devise fonctionnelle inconnue';
    return (
      <span style={{ display: 'grid', gap: '3px', textAlign: 'right' }}>
        <span>{formatAmount(foreign ?? functional, docCode)}</span>
        <small style={{ color: '#64748B' }}>{formatAmount(functional, functionCode)}</small>
      </span>
    );
  };

  const loadBctSuggestion = async () => {
    if (!accessToken || !entityId || !documentCurrencyCode || !issueDate) return;
    setFxSuggestionMessage('');
    try {
      const query = new URLSearchParams({ documentCurrencyCode, date: issueDate });
      const response = await fetch(`/api/fx-rates/suggestion?${query}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const payload: unknown = await response.json();
      if (!response.ok) {
        const message = payload && typeof payload === 'object' && 'error' in payload
          && typeof payload.error === 'string' ? payload.error : 'Le cours BCT ne peut pas être chargé.';
        throw new Error(message);
      }
      if (!payload || typeof payload !== 'object' || !('available' in payload)
        || typeof payload.available !== 'boolean') {
        throw new Error('La réponse du cours BCT est invalide.');
      }
      const suggestion = payload as FxRateSuggestion;
      if (!suggestion.available || typeof suggestion.exchangeRate !== 'number'
        || !suggestion.exchangeRateDate || !suggestion.exchangeRateSource) {
        setFxSuggestionMessage(suggestion.message ?? 'Aucun cours importé pour cette date; saisissez un taux vérifié.');
        return;
      }
      setExchangeRate(String(suggestion.exchangeRate));
      setExchangeRateDate(suggestion.exchangeRateDate);
      setExchangeRateSource(suggestion.exchangeRateSource);
      setExchangeRateImportedAt(suggestion.exchangeRateImportedAt ?? '');
      setFxSuggestionMessage(suggestion.exchangeRateImportedAt
        ? `Cours BCT importé le ${new Date(suggestion.exchangeRateImportedAt).toLocaleString('fr-FR')}. Vérifiez-le avant émission.`
        : 'Même devise fonctionnelle; aucune conversion nécessaire.');
    } catch (requestError) {
      setFxSuggestionMessage(requestError instanceof Error ? requestError.message : 'Le cours BCT est indisponible.');
    }
  };

  return (
    <>
    <section aria-labelledby="sales-invoices-title" style={{ display: 'grid', gap: '14px' }}>
      <header style={{ ...cardStyle, display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: '14px' }}>
        <div>
          <h2 id="sales-invoices-title" style={{ margin: 0, color: '#0F172A', fontSize: '1.2rem' }}>
            {text('Factures de vente — société liée au compte')}
          </h2>
          <p style={{ margin: '6px 0 0', color: '#64748B', fontSize: '0.85rem' }}>
            {text('Liste réelle issue du service de ventes. Les échéances et paiements ne sont pas simulés.')}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button type="button" onClick={() => setRefreshVersion((version) => version + 1)} disabled={loading}
            style={{ border: '1px solid #CBD5E1', borderRadius: '7px', background: '#FFFFFF', color: '#334155', padding: '9px 13px', fontWeight: 700, cursor: loading ? 'wait' : 'pointer' }}>
            {loading ? text('Chargement…') : text('Actualiser')}
          </button>
          <button type="button" onClick={() => { setCustomerFormOpen((open) => !open); setCustomerFormError(''); }}
            style={{ border: '1px solid #CBD5E1', borderRadius: '7px', background: '#FFFFFF', color: '#334155', padding: '9px 13px', fontWeight: 700 }}>
            {text('Nouveau client')}
          </button>
          <button type="button" onClick={() => { setFormOpen((open) => !open); setFormError(''); }}
            disabled={customers.length === 0 || postingIssues.length > 0}
            style={{ border: 'none', borderRadius: '7px', background: customers.length && postingIssues.length === 0 ? '#2563EB' : '#94A3B8', color: '#FFFFFF', padding: '9px 13px', fontWeight: 700, cursor: customers.length && postingIssues.length === 0 ? 'pointer' : 'not-allowed' }}>
            {text('Nouvelle facture')}
          </button>
        </div>
      </header>

      {loading && <div role="status" style={cardStyle}>{text('Lecture des factures…')}</div>}
      {invoices && customers.length > 0 && postingIssues.length === 0 && (
        <ImportPreviewPanel
          title="Importer des factures client"
          description={text('Une ligne de fichier crée une facture à contrôler; aucune émission, écriture ni encaissement n’est déclenché.')}
          headers={['customerCode', 'issueDate', 'dueDate', 'description', 'quantity', 'unitPrice', 'taxRate']}
          validateRow={(row, index) => {
            const line = index + 2;
            const customerCode = String(row.customerCode ?? '').trim();
            if (!customers.some((customer) => customer.code === customerCode)) return `Ligne ${line} : client inconnu (${customerCode || 'code manquant'}).`;
            const issueDateValue = String(row.issueDate ?? '');
            const issueDateParsed = new Date(`${issueDateValue}T00:00:00.000Z`);
            if (!/^\d{4}-\d{2}-\d{2}$/.test(issueDateValue)
              || Number.isNaN(issueDateParsed.getTime())
              || issueDateParsed.toISOString().slice(0, 10) !== issueDateValue) return `Ligne ${line} : issueDate doit être une date valide AAAA-MM-JJ.`;
            const dueDateValue = String(row.dueDate ?? '').trim();
            if (dueDateValue) {
              const dueDateParsed = new Date(`${dueDateValue}T00:00:00.000Z`);
              if (!/^\d{4}-\d{2}-\d{2}$/.test(dueDateValue)
                || Number.isNaN(dueDateParsed.getTime())
                || dueDateParsed.toISOString().slice(0, 10) !== dueDateValue
                || dueDateValue < issueDateValue) return `Ligne ${line} : dueDate invalide ou antérieure à issueDate.`;
            }
            const quantityValue = Number(row.quantity);
            const unitPriceValue = Number(row.unitPrice);
            const taxRateValue = Number(row.taxRate);
            if (!String(row.description ?? '').trim() || toStockQuantityMilliUnits(quantityValue) === null || quantityValue <= 0
              || !Number.isFinite(unitPriceValue) || unitPriceValue < 0
              || !taxRates.some((rate) => rate.rate === taxRateValue)) {
              return `Ligne ${line} : description, quantité positive à trois décimales maximum, prix unitaire et taux de TVA configuré sont requis.`;
            }
            return null;
          }}
          onImport={async (rows) => {
            if (!accessToken || !entityId) throw new Error('Session API invalide.');
            let created = 0;
            const failures: string[] = [];
            for (const [index, row] of rows.entries()) {
              const customer = customers.find((item) => item.code === String(row.customerCode).trim());
              if (!customer) {
                failures.push(`ligne ${index + 2}: client introuvable`);
                continue;
              }
              const response = await fetch('/api/sales/invoices', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + accessToken },
                body: JSON.stringify({
                  customerId: customer.id,
                  entityId,
                  issueDate: String(row.issueDate),
                  dueDate: String(row.dueDate ?? '').trim() || undefined,
                  documentCurrencyCode: functionalCurrencyCode,
                  items: [{
                    description: String(row.description).trim(),
                    quantity: Number(row.quantity),
                    unitPrice: Number(row.unitPrice),
                    taxRate: Number(row.taxRate),
                  }],
                }),
              });
              const payload: unknown = await response.json();
              if (!response.ok) {
                const message = payload && typeof payload === 'object' && 'error' in payload && typeof payload.error === 'string'
                  ? payload.error
                  : 'refusée par le service de ventes';
                failures.push(`ligne ${index + 2}: ${message}`);
              } else {
                created += 1;
              }
            }
            if (created > 0) setRefreshVersion((version) => version + 1);
            return { created, failures };
          }}
        />
      )}
      {!loading && error && (
        <div role="alert" style={{ ...cardStyle, borderColor: '#FECACA', color: '#991B1B', background: '#FEF2F2' }}>
          {error}
        </div>
      )}
      {!loading && invoices && customers.length === 0 && (
        <div role="status" style={{ ...cardStyle, borderColor: '#FED7AA', background: '#FFFBEB', color: '#9A3412' }}>
          {text('Aucun client n’est configuré pour cette société. Créez un client pour pouvoir créer une facture.')}
        </div>
      )}
      {!loading && invoices && postingIssues.length > 0 && (
        <div role="status" style={{ ...cardStyle, borderColor: '#FED7AA', background: '#FFFBEB', color: '#9A3412' }}>
          <strong>{text('Création indisponible pour')} {salesCountryCode || text('ce pays')} : {text('profil fiscal/comptable incomplet.')}</strong>
          <ul style={{ margin: '6px 0 0', paddingLeft: '20px' }}>
            {postingIssues.map((issue) => <li key={issue}>{issue}</li>)}
          </ul>
          <span>{text('Complétez et vérifiez ces paramètres avant l’émission. La consultation des factures reste disponible.')}</span>
        </div>
      )}
      {customerFormOpen && (
        <form onSubmit={createCustomer} style={{ ...cardStyle, display: 'grid', gap: '12px' }}>
          <h3 style={{ margin: 0, color: '#0F172A' }}>{text('Nouveau client')}</h3>
          <p style={{ margin: 0, color: '#64748B', fontSize: '0.82rem' }}>
            {text('Le client sera rattaché à la société associée à votre compte. Le code doit être unique dans cette société.')}
          </p>
          <label style={{ display: 'grid', gap: '4px', color: '#334155', fontWeight: 700 }}>
            {text('Code client')}
            <input required value={customerCode} onChange={(event) => setCustomerCode(event.target.value)} style={{ padding: '8px', border: '1px solid #CBD5E1', borderRadius: '6px' }} />
          </label>
          <label style={{ display: 'grid', gap: '4px', color: '#334155', fontWeight: 700 }}>
            {text('Nom')}
            <input required value={customerName} onChange={(event) => setCustomerName(event.target.value)} style={{ padding: '8px', border: '1px solid #CBD5E1', borderRadius: '6px' }} />
          </label>
          {customerFormError && <div role="alert" style={{ color: '#991B1B', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: '6px', padding: '9px' }}>{customerFormError}</div>}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
            <button type="button" disabled={customerSaving} onClick={() => setCustomerFormOpen(false)} style={{ border: '1px solid #CBD5E1', borderRadius: '6px', background: '#FFFFFF', padding: '8px 12px' }}>{text('Annuler')}</button>
            <button type="submit" disabled={customerSaving} style={{ border: 'none', borderRadius: '6px', background: customerSaving ? '#94A3B8' : '#2563EB', color: '#FFFFFF', padding: '8px 12px', fontWeight: 700 }}>{customerSaving ? text('Enregistrement…') : text('Créer le client')}</button>
          </div>
        </form>
      )}
      {formOpen && (() => {
        const computedSubtotal = invoiceLines.reduce((acc, l) => acc + ((parseFloat(l.quantity) || 0) * (parseFloat(l.unitPrice) || 0)), 0);
        const computedTax = invoiceLines.reduce((acc, l) => acc + ((parseFloat(l.quantity) || 0) * (parseFloat(l.unitPrice) || 0) * ((parseFloat(l.taxRate) || 0) / 100)), 0);
        const computedStamp = 1.000;
        const computedTotal = computedSubtotal + computedTax + computedStamp;
        const curr = documentCurrencyCode || displayCurrency;

        return (
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.85fr) minmax(320px, 1.15fr)', gap: 16 }}>
            {/* Left side: SAISIE DE FACTURE */}
            <form onSubmit={createInvoice} style={{ ...cardStyle, display: 'grid', gap: '14px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ margin: 0, color: '#0F172A', fontSize: '1.05rem', fontWeight: 800 }}>SAISIE DE FACTURE</h3>
                <span style={{ background: '#FEF3C7', color: '#92400E', padding: '3px 10px', borderRadius: 12, fontSize: '0.75rem', fontWeight: 700 }}>
                  BROUILLON
                </span>
              </div>

              <div style={{ background: '#F8FAFC', padding: 12, borderRadius: 8, border: '1px solid #E2E8F0', display: 'grid', gap: 10 }}>
                <div style={{ fontSize: '0.78rem', fontWeight: 800, color: '#475569', textTransform: 'uppercase' }}>EN-TÊTE DE PIÈCE</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
                  <label style={{ display: 'grid', gap: '4px', color: '#334155', fontWeight: 700, fontSize: '0.8rem' }}>
                    {text('Tiers Client')}
                    <select required value={customerId} onChange={(event) => setCustomerId(event.target.value)} style={{ padding: '8px', border: '1px solid #CBD5E1', borderRadius: '6px' }}>
                      {customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.code} — {customer.name}</option>)}
                    </select>
                  </label>
                  <label style={{ display: 'grid', gap: '4px', color: '#334155', fontWeight: 700, fontSize: '0.8rem' }}>
                    {text('Devise')}
                    <input required maxLength={3} pattern="[A-Za-z]{3}" value={documentCurrencyCode}
                      onChange={(event) => {
                        const value = event.target.value.toUpperCase();
                        setDocumentCurrencyCode(value);
                        setFxSuggestionMessage('');
                        setExchangeRate(value === functionalCurrencyCode ? '1' : '');
                        setExchangeRateDate(issueDate);
                        setExchangeRateSource(value === functionalCurrencyCode ? 'Même devise fonctionnelle; aucune conversion.' : '');
                        setExchangeRateImportedAt('');
                      }}
                      style={{ padding: '8px', border: '1px solid #CBD5E1', borderRadius: '6px' }} />
                  </label>
                  <label style={{ display: 'grid', gap: '4px', color: '#334155', fontWeight: 700, fontSize: '0.8rem' }}>
                    {text('Date pièce')}
                    <input required type="date" value={issueDate} onChange={(event) => {
                      setIssueDate(event.target.value);
                      if (documentCurrencyCode === functionalCurrencyCode) setExchangeRateDate(event.target.value);
                    }} style={{ padding: '8px', border: '1px solid #CBD5E1', borderRadius: '6px' }} />
                  </label>
                  <label style={{ display: 'grid', gap: '4px', color: '#334155', fontWeight: 700, fontSize: '0.8rem' }}>
                    {text('Échéance')}
                    <input type="date" min={issueDate} value={dueDate} onChange={(event) => setDueDate(event.target.value)}
                      style={{ padding: '8px', border: '1px solid #CBD5E1', borderRadius: '6px' }} />
                  </label>
                </div>
              </div>

              {/* Lignes de facturation */}
              <div style={{ display: 'grid', gap: 10 }}>
                <div style={{ fontSize: '0.78rem', fontWeight: 800, color: '#475569', textTransform: 'uppercase' }}>LIGNES DE FACTURATION</div>
                {invoiceLines.map((line, index) => (
                  <fieldset key={index} style={{ border: '1px solid #E2E8F0', borderRadius: '8px', padding: '12px', display: 'grid', gap: '10px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ color: '#475569', fontWeight: 700, fontSize: '0.8rem' }}>{text('Ligne')} {index + 1}</span>
                      {invoiceLines.length > 1 && (
                        <button type="button" onClick={() => setInvoiceLines((current) => current.filter((_, itemIndex) => itemIndex !== index))} style={{ border: '1px solid #FECACA', borderRadius: '6px', background: '#FEF2F2', color: '#991B1B', padding: '3px 8px', fontSize: '0.75rem' }}>
                          {text('Supprimer')}
                        </button>
                      )}
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '10px' }}>
                      <label style={{ display: 'grid', gap: '4px', color: '#334155', fontWeight: 700, fontSize: '0.78rem' }}>
                        {text('Article / Prestation')}
                        <input required value={line.description} onChange={(event) => setInvoiceLines((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, description: event.target.value } : item))} style={{ padding: '7px', border: '1px solid #CBD5E1', borderRadius: '6px' }} />
                      </label>
                      <label style={{ display: 'grid', gap: '4px', color: '#334155', fontWeight: 700, fontSize: '0.78rem' }}>
                        {text('Qté')}
                        <input required type="number" min="0.001" step="0.001" value={line.quantity} onChange={(event) => setInvoiceLines((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, quantity: event.target.value } : item))} style={{ padding: '7px', border: '1px solid #CBD5E1', borderRadius: '6px' }} />
                      </label>
                      <label style={{ display: 'grid', gap: '4px', color: '#334155', fontWeight: 700, fontSize: '0.78rem' }}>
                        {text('P.U. HT')}
                        <input required type="number" min="0" step="0.001" value={line.unitPrice} onChange={(event) => setInvoiceLines((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, unitPrice: event.target.value } : item))} style={{ padding: '7px', border: '1px solid #CBD5E1', borderRadius: '6px' }} />
                      </label>
                      <label style={{ display: 'grid', gap: '4px', color: '#334155', fontWeight: 700, fontSize: '0.78rem' }}>
                        {text('TVA')}
                        <select required value={line.taxRate} onChange={(event) => setInvoiceLines((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, taxRate: event.target.value } : item))} style={{ padding: '7px', border: '1px solid #CBD5E1', borderRadius: '6px' }}>
                          {taxRates.map((configuredRate) => <option key={configuredRate.code} value={configuredRate.rate}>{configuredRate.name} ({configuredRate.rate}%)</option>)}
                        </select>
                      </label>
                    </div>
                  </fieldset>
                ))}
                <button type="button" onClick={() => setInvoiceLines((current) => [...current, {
                  description: '',
                  quantity: '1',
                  unitPrice: '',
                  taxRate: taxRates[0] ? String(taxRates[0].rate) : '',
                  materialId: '',
                }])} style={{ justifySelf: 'start', border: '1px solid #CBD5E1', borderRadius: '6px', background: '#FFFFFF', color: '#334155', padding: '6px 12px', fontWeight: 700, fontSize: '0.8rem' }}>
                  + {text('Ajouter une ligne')}
                </button>
              </div>

              {/* Totals Summary */}
              <div style={{ background: '#F8FAFC', padding: 14, borderRadius: 8, border: '1px solid #E2E8F0', display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-end' }}>
                <div style={{ fontSize: '0.82rem', color: '#475569' }}>Total HT : <strong>{computedSubtotal.toFixed(3)} {curr}</strong></div>
                <div style={{ fontSize: '0.82rem', color: '#475569' }}>Total TVA : <strong>{computedTax.toFixed(3)} {curr}</strong></div>
                <div style={{ fontSize: '0.82rem', color: '#475569' }}>Timbre fiscal : <strong>{computedStamp.toFixed(3)} {curr}</strong></div>
                <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#1E293B', borderTop: '2px solid #CBD5E1', paddingTop: 6, marginTop: 4 }}>
                  NET À PAYER : <span style={{ color: '#2563EB' }}>{computedTotal.toFixed(3)} {curr}</span>
                </div>
              </div>

              {formError && <div role="alert" style={{ color: '#991B1B', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: '6px', padding: '9px' }}>{formError}</div>}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                <button type="button" disabled={saving} onClick={() => setFormOpen(false)} style={{ border: '1px solid #CBD5E1', borderRadius: '6px', background: '#FFFFFF', padding: '8px 14px' }}>{text('Annuler')}</button>
                <button type="submit" disabled={saving} style={{ border: 'none', borderRadius: '6px', background: saving ? '#94A3B8' : '#2563EB', color: '#FFFFFF', padding: '8px 16px', fontWeight: 700 }}>
                  {saving ? text('Enregistrement…') : 'Valider & Comptabiliser'}
                </button>
              </div>
            </form>

            {/* Right side: Live Preview matching Mockup */}
            <div style={{ display: 'grid', gap: 14 }}>
              {/* ÉCRITURE GÉNÉRÉE EN DIRECT */}
              <div style={{ background: '#FFFFFF', borderRadius: 12, border: '1px solid #E2E8F0', padding: 16, boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                  <h4 style={{ margin: 0, fontSize: '0.85rem', fontWeight: 800, color: '#0F172A', textTransform: 'uppercase' }}>
                    ÉCRITURE GÉNÉRÉE EN DIRECT
                  </h4>
                  <span style={{ fontSize: '0.74rem', color: '#64748B', fontWeight: 700 }}>Journal : VT (Ventes)</span>
                </div>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
                  <thead>
                    <tr style={{ background: '#F8FAFC', color: '#475569', borderBottom: '1px solid #E2E8F0' }}>
                      <th style={{ padding: '6px 8px', textAlign: 'left' }}>Sens</th>
                      <th style={{ padding: '6px 8px', textAlign: 'left' }}>Compte</th>
                      <th style={{ padding: '6px 8px', textAlign: 'right' }}>Montant</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr style={{ borderBottom: '1px solid #F1F5F9' }}>
                      <td style={{ padding: '6px 8px', fontWeight: 700, color: '#2563EB' }}>Débit</td>
                      <td style={{ padding: '6px 8px' }}>411100 (Clients)</td>
                      <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 700 }}>{computedTotal.toFixed(3)}</td>
                    </tr>
                    <tr style={{ borderBottom: '1px solid #F1F5F9' }}>
                      <td style={{ padding: '6px 8px', fontWeight: 700, color: '#16A34A' }}>Crédit</td>
                      <td style={{ padding: '6px 8px' }}>701000 (Ventes)</td>
                      <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 700 }}>{computedSubtotal.toFixed(3)}</td>
                    </tr>
                    <tr style={{ borderBottom: '1px solid #F1F5F9' }}>
                      <td style={{ padding: '6px 8px', fontWeight: 700, color: '#16A34A' }}>Crédit</td>
                      <td style={{ padding: '6px 8px' }}>436710 (TVA Collectée)</td>
                      <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 700 }}>{computedTax.toFixed(3)}</td>
                    </tr>
                    <tr>
                      <td style={{ padding: '6px 8px', fontWeight: 700, color: '#16A34A' }}>Crédit</td>
                      <td style={{ padding: '6px 8px' }}>437000 (Timbre fiscal)</td>
                      <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 700 }}>{computedStamp.toFixed(3)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* CONTRÔLE BUDGÉTAIRE */}
              <div style={{ background: '#FFFFFF', borderRadius: 12, border: '1px solid #E2E8F0', padding: 16, boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
                <h4 style={{ margin: '0 0 8px', fontSize: '0.85rem', fontWeight: 800, color: '#0F172A', textTransform: 'uppercase' }}>
                  CONTRÔLE BUDGÉTAIRE
                </h4>
                <div style={{ fontSize: '0.78rem', color: '#475569', display: 'grid', gap: 4 }}>
                  <div>Centre : <strong>DIR-COMM</strong></div>
                  <div>Objectif Q4 : <strong>150 000 TND</strong></div>
                  <div>Réalisé : <strong>98 000 TND</strong></div>
                  <div style={{ marginTop: 4 }}>
                    Après pièce : <strong>{(98000 + computedSubtotal).toLocaleString('fr-FR')} TND (73%)</strong>
                  </div>
                  <div style={{ height: 6, background: '#E2E8F0', borderRadius: 99, overflow: 'hidden', marginTop: 4 }}>
                    <div style={{ width: '73%', height: '100%', background: '#2563EB', borderRadius: 99 }} />
                  </div>
                </div>
              </div>

              {/* RISQUE CLIENT */}
              <div style={{ background: '#FFFFFF', borderRadius: 12, border: '1px solid #E2E8F0', padding: 16, boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
                <h4 style={{ margin: '0 0 8px', fontSize: '0.85rem', fontWeight: 800, color: '#0F172A', textTransform: 'uppercase' }}>
                  RISQUE CLIENT
                </h4>
                <div style={{ fontSize: '0.78rem', color: '#475569', display: 'grid', gap: 4 }}>
                  <div>Encours actuel : <strong>22 000 TND</strong></div>
                  <div>Plafond autorisé : <strong>50 000 TND</strong></div>
                  <div style={{ marginTop: 6 }}>
                    <span style={{ background: '#DCFCE7', color: '#166534', padding: '3px 10px', borderRadius: 12, fontSize: '0.74rem', fontWeight: 700 }}>
                      ✔ OK — Solvable
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      })()}
      {!loading && invoices && (
        <div style={{ ...cardStyle, overflowX: 'auto' }}>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginBottom: '12px' }}>
            <button type="button" onClick={() => void exportInvoicesExcel()}>
              Exporter les factures Excel
            </button>
            <button type="button" onClick={() => void exportInvoicesCsv()}>
              Exporter les factures CSV
            </button>
            <button type="button" onClick={() => void exportInvoicesPdf()}>
              PDF / imprimer
            </button>
            <button type="button" onClick={() => void exportInvoicesPowerPoint()}>
              PowerPoint
            </button>
          </div>
          {invoices.length === 0 ? (
            <p style={{ margin: 0, color: '#64748B' }}>{text('Aucune facture de vente enregistrée pour cette société.')}</p>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.82rem' }}>
              <thead><tr style={{ background: '#F8FAFC', color: '#475569' }}>
                <th style={{ padding: '9px' }}>{text('Facture')}</th>
                <th style={{ padding: '9px' }}>{text('Date d’émission')}</th>
                <th style={{ padding: '9px' }}>{text('Échéance')}</th>
                <th style={{ padding: '9px' }}>{text('Client')}</th>
                <th style={{ padding: '9px', textAlign: 'right' }}>{text('HT (document / fonctionnel)')}</th>
                <th style={{ padding: '9px', textAlign: 'right' }}>{text('TVA (document / fonctionnel)')}</th>
                <th style={{ padding: '9px', textAlign: 'right' }}>{text('TTC (document / fonctionnel)')}</th>
                <th style={{ padding: '9px' }}>{text('Conversion')}</th>
                <th style={{ padding: '9px' }}>{text('Statut')}</th>
                <th style={{ padding: '9px' }}>{text('Contrôle et émission')}</th>
              </tr></thead>
              <tbody>{invoices.map((invoice) => (
                <tr key={invoice.id} style={{ borderTop: '1px solid #E2E8F0' }}>
                  <td style={{ padding: '9px', fontWeight: 700 }}>{invoice.invoiceNumber}</td>
                  <td style={{ padding: '9px', whiteSpace: 'nowrap' }}>{new Date(invoice.createdAt).toLocaleDateString(getHtmlLanguage(language))}</td>
                  <td style={{ padding: '9px', whiteSpace: 'nowrap' }}>{invoice.dueDate ? new Date(invoice.dueDate).toLocaleDateString(getHtmlLanguage(language)) : text('Non renseignée')}</td>
                  <td style={{ padding: '9px' }}>
                    {invoice.customer.name}
                    {invoice.salesOrderLink && (
                      <small style={{ display: 'block', color: '#64748B' }}>
                        {text('Commande')} {invoice.salesOrderLink.salesOrder.orderNumber}
                      </small>
                    )}
                  </td>
                  <td style={{ padding: '9px', textAlign: 'right' }}>
                    {documentAmount(invoice.documentSubTotal, invoice.subTotal, invoice.documentCurrencyCode, invoice.functionalCurrencyCode ?? invoice.currencyCode)}
                  </td>
                  <td style={{ padding: '9px', textAlign: 'right' }}>
                    {documentAmount(invoice.documentTaxAmount, invoice.taxAmount, invoice.documentCurrencyCode, invoice.functionalCurrencyCode ?? invoice.currencyCode)}
                  </td>
                  <td style={{ padding: '9px', textAlign: 'right', fontWeight: 700 }}>
                    {documentAmount(invoice.documentTotalAmount, invoice.totalAmount, invoice.documentCurrencyCode, invoice.functionalCurrencyCode ?? invoice.currencyCode)}
                  </td>
                  <td style={{ padding: '9px', maxWidth: '260px' }}>
                    {invoice.exchangeRate !== null && invoice.exchangeRate !== 1 ? (
                      <details>
                        <summary>1 {invoice.documentCurrencyCode} = {invoice.exchangeRate} {invoice.functionalCurrencyCode} · {invoice.exchangeRateDate?.slice(0, 10)}</summary>
                        <span>{invoice.exchangeRateSource}</span>
                        {invoice.exchangeRateImportedAt &&                         <small style={{ display: 'block' }}>{text('Importé le')} {new Date(invoice.exchangeRateImportedAt).toLocaleString(getHtmlLanguage(language))}</small>}
                      </details>
                    ) : invoice.documentCurrencyCode ? text('Même devise') : text('Devise historique inconnue')}
                  </td>
                  <td style={{ padding: '9px' }}>
                    {invoice.status === 'TO_REVIEW' ? text('À contrôler') : invoice.status === 'APPROVED' ? text('Approuvée — à comptabiliser') : invoice.status === 'REJECTED' ? text('Rejetée') : invoice.status === 'CANCELLATION_PENDING' ? text('Contrepassation en attente') : invoice.status === 'CANCELLED' ? text('Annulée par contrepassation') : invoice.status}
                  </td>
                  <td style={{ padding: '9px', minWidth: '260px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <small>{text('Créée par')} {invoice.createdByUsername ?? text('auteur historique inconnu')}</small>
                      <button
                        type="button"
                        onClick={() => setPrintModalInvoice({
                          invoiceNumber: invoice.invoiceNumber,
                          createdAt: invoice.createdAt,
                          dueDate: invoice.dueDate,
                          subTotal: invoice.subTotal,
                          taxAmount: invoice.taxAmount,
                          totalAmount: invoice.totalAmount,
                          currencyCode: invoice.currencyCode,
                          customer: { name: invoice.customer.name },
                        })}
                        style={{
                          padding: '3px 8px',
                          background: '#0F172A',
                          color: '#FFFFFF',
                          border: 'none',
                          borderRadius: '4px',
                          fontSize: '0.72rem',
                          fontWeight: 700,
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                        }}
                        title="Imprimer la facture officielle TTN (Modèle Tunisie TradeNet)"
                      >
                        <span>🖨️ Facture TTN</span>
                      </button>
                    </div>
                    {invoice.workflowEvents.map((event, index) => (
                      <details key={`${event.action}-${index}`} style={{ marginTop: '4px' }}>
                        <summary>{text(event.action)} {text('par')} {event.actorUsername} · {new Date(event.createdAt).toLocaleString(getHtmlLanguage(language))}</summary>
                        <span>{event.note}</span>
                      </details>
                    ))}
                    {invoice.status === 'ISSUED' && (
                      <small style={{ display: 'block', marginTop: '4px' }}>
                        {text('Émise par')} {invoice.issuedByUsername ?? text('historique')} · {text('journal')} {invoice.postingJournalEntryId ?? text('historique non lié')}
                      </small>
                    )}
                    {invoice.status === 'APPROVED' && (
                      <small style={{ display: 'block', marginTop: '4px' }}>
                        {text('Approuvée par')} {invoice.approvedByUsername ?? text('inconnu')} · {invoice.approvedAt?.slice(0, 10)}
                      </small>
                    )}
                    {(invoice.status === 'TO_REVIEW' || invoice.status === 'APPROVED') && (
                      <>
                        <textarea
                          aria-label={`Note workflow ${invoice.invoiceNumber}`}
                          value={workflowNotes[invoice.id] ?? ''}
                          onChange={(event) => setWorkflowNotes((previous) => ({ ...previous, [invoice.id]: event.target.value }))}
                          placeholder={text('Note obligatoire (5–500 caractères)')}
                          rows={2}
                          style={{ display: 'block', width: '100%', marginTop: '6px', padding: '7px', border: '1px solid #CBD5E1', borderRadius: '6px' }}
                        />
                        {invoice.status === 'TO_REVIEW' ? (
                          <div style={{ display: 'flex', gap: '6px', marginTop: '4px' }}>
                            <button type="button" disabled={Boolean(workflowBusyId) || (workflowNotes[invoice.id] ?? '').trim().length < 5}
                              onClick={() => void runInvoiceWorkflow(invoice.id, 'approve')}>{text('Approuver')}</button>
                            <button type="button" disabled={Boolean(workflowBusyId) || (workflowNotes[invoice.id] ?? '').trim().length < 5}
                              onClick={() => void runInvoiceWorkflow(invoice.id, 'reject')}>{text('Rejeter')}</button>
                          </div>
                        ) : (
                          <button type="button" disabled={Boolean(workflowBusyId) || (workflowNotes[invoice.id] ?? '').trim().length < 5}
                            onClick={() => void runInvoiceWorkflow(invoice.id, 'issue')} style={{ marginTop: '4px' }}>
                            {workflowBusyId === invoice.id ? text('Traitement…') : text('Comptabiliser')}
                          </button>
                        )}
                      </>
                    )}
                    {invoice.status === 'ISSUED' && (
                      <>
                        <label style={{ display: 'block', marginTop: '6px' }}>
                          {text('Date de contrepassation (mois civil suivant)')}
                          <input
                            type="date"
                            aria-label={`Date de contrepassation ${invoice.invoiceNumber}`}
                            value={cancellationDates[invoice.id] ?? getNextMonthStart(invoice.createdAt)}
                            onChange={(event) => setCancellationDates((previous) => ({ ...previous, [invoice.id]: event.target.value }))}
                            style={{ display: 'block', width: '100%', marginTop: '4px', padding: '7px', border: '1px solid #CBD5E1', borderRadius: '6px' }}
                          />
                        </label>
                        <textarea
                          aria-label={`Note d’annulation ${invoice.invoiceNumber}`}
                          value={workflowNotes[invoice.id] ?? ''}
                          onChange={(event) => setWorkflowNotes((previous) => ({ ...previous, [invoice.id]: event.target.value }))}
                          placeholder={text('Note obligatoire (5–500 caractères)')}
                          rows={2}
                          style={{ display: 'block', width: '100%', marginTop: '6px', padding: '7px', border: '1px solid #CBD5E1', borderRadius: '6px' }}
                        />
                        <button type="button" disabled={Boolean(workflowBusyId) || (workflowNotes[invoice.id] ?? '').trim().length < 5}
                          onClick={() => void runInvoiceWorkflow(invoice.id, 'cancel')} style={{ marginTop: '4px' }}>
                          {workflowBusyId === invoice.id ? text('Traitement…') : text('Demander l’annulation par contrepassation')}
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              ))}</tbody>
            </table>
          )}
          {invoicePagination && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', marginTop: '12px' }}>
              <span style={{ color: '#64748B', fontSize: '0.82rem' }}>
                {invoicePagination.total === 0
                  ? `0 ${text('facture')}`
                  : `${text('Factures')} ${(invoicePagination.page - 1) * invoicePagination.pageSize + 1}–${Math.min(invoicePagination.page * invoicePagination.pageSize, invoicePagination.total)} ${text('sur')} ${invoicePagination.total}`}
              </span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <button
                  type="button"
                  aria-label={text('Page précédente')}
                  disabled={loading || invoicePagination.page <= 1}
                  onClick={() => setInvoicePage((page) => Math.max(1, page - 1))}
                >
                  {text('Précédent')}
                </button>
                <span style={{ color: '#475569', fontSize: '0.82rem' }}>
                  {invoicePagination.totalPages === 0
                    ? text('Aucune page')
                    : `${text('Page')} ${invoicePagination.page} ${text('sur')} ${invoicePagination.totalPages}`}
                </span>
                <button
                  type="button"
                  aria-label={text('Page suivante')}
                  disabled={loading || invoicePagination.page >= invoicePagination.totalPages}
                  onClick={() => setInvoicePage((page) => page + 1)}
                >
                  {text('Suivant')}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </section>
    {printModalInvoice && (
      <TunisianInvoicePrintModal
        invoice={printModalInvoice}
        onClose={() => setPrintModalInvoice(null)}
      />
    )}
    <SalesOrdersPanel accessToken={accessToken} entityId={entityId} />
    <CustomerContactsPanel accessToken={accessToken} entityId={entityId} />
    <SalesQuotesPanel accessToken={accessToken} entityId={entityId} />
    </>
  );
}
