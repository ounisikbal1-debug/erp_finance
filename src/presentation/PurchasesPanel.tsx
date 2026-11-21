import React, { useEffect, useMemo, useState } from 'react';
import ImportPreviewPanel from './ImportPreviewPanel';
import AiInvoiceAnalysisPanel from './AiInvoiceAnalysisPanel';
import { exportToCSV, exportToExcel, exportToPDF, exportToPowerPoint } from './exportUtils';
import { toStockQuantityMilliUnits } from '../application/modules/materials/quantity';
import { translateBusinessText, useInterfaceLanguage } from './localization';

interface PurchasesData {
  entity: { name: string; countryCode: string; currencyCode: string };
  vendors: Array<{ id: string; code: string; name: string }>;
  materials: Array<{ id: string; sku: string; name: string; unitCode: string }>;
  warehouses: Array<{ id: string; code: string; name: string }>;
  taxRates: Array<{ id: string; code: string; name: string; rate: number; purchaseVatRecoverable: boolean }>;
  invoices: Array<{
    id: string;
    invoiceNumber: string;
    issueDate: string;
    dueDate: string;
    currencyCode: string;
    subTotal: number;
    taxRateCode: string;
    taxRate: number;
    taxAmount: number;
    totalAmount: number;
    documentCurrencyCode: string | null;
    documentSubTotal: number | null;
    documentTaxAmount: number | null;
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
    postedByUsername: string | null;
    postedAt: string | null;
    workflowEvents: Array<{ action: string; actorUsername: string; note: string; createdAt: string }>;
    postingJournalEntry: { id: string; entryNumber: string; date: string } | null;
    vendor: { id: string; code: string; name: string };
    lines: Array<{ id: string; description: string; materialId: string | null; purchaseOrderLineId: string | null; quantity: number; unitPrice: number }>;
  }>;
}

interface SupplierScore {
  score: number;
  alertThreshold: number;
  alertTriggered: boolean;
  configurationVersion: number;
  calculatedAt: string;
  isCurrent: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isSupplierScore(value: unknown): value is SupplierScore | null {
  return value === null || (isRecord(value)
    && typeof value.score === 'number'
    && Number.isFinite(value.score)
    && typeof value.alertThreshold === 'number'
    && Number.isFinite(value.alertThreshold)
    && typeof value.alertTriggered === 'boolean'
    && typeof value.configurationVersion === 'number'
    && Number.isInteger(value.configurationVersion)
    && typeof value.calculatedAt === 'string'
    && typeof value.isCurrent === 'boolean');
}

function validQuantity(value: number, unitCode?: string): boolean {
  const milliUnits = toStockQuantityMilliUnits(value);
  return milliUnits !== null
    && (!unitCode || !['EA', 'BOX', 'PACK'].includes(unitCode.toUpperCase()) || milliUnits % 1000 === 0);
}

interface PurchaseOrderLineData {
  id: string;
  description: string;
  materialId: string | null;
  quantity: number;
  unitPrice: number;
  material: { id: string; sku: string; unitCode: string } | null;
}

interface PurchaseOrderData {
  id: string;
  orderNumber: string;
  currencyCode: string;
  expectedAt: string | null;
  description: string | null;
  status: string;
  createdByUserId: string;
  createdByUsername: string;
  approvedByUsername: string | null;
  vendor: { id: string; code: string; name: string };
  lines: PurchaseOrderLineData[];
}

interface SupplierCreditNoteData {
  id: string;
  supplierDocumentNumber: string | null;
  creditDate: string | null;
  currencyCode: string;
  functionalCurrencyCode: string;
  exchangeRate: number;
  documentSubTotal: number;
  documentTaxAmount: number;
  documentTotalAmount: number;
  subTotal: number;
  taxAmount: number;
  totalAmount: number;
  unappliedDocumentAmount: number;
  unappliedFunctionalAmount: number;
  quantity: number;
  unitPrice: number;
  status: string;
  createdByUserId: string;
  createdByUsername: string;
  approvedByUserId: string | null;
  approvedByUsername: string | null;
  postedByUserId: string | null;
  postedByUsername: string | null;
  vendor: { id: string; code: string; name: string };
  sourceInvoice: { id: string; invoiceNumber: string; status: string };
  sourceInvoiceLine: { description: string; quantity: number; unitPrice: number };
  sourceReturn: { id: string; quantity: number; reason: string; createdAt: string };
  workflowEvents: Array<{ action: string; actorUsername: string; note: string; createdAt: string }>;
  applications: Array<{
    id: string;
    documentAmount: number;
    functionalAmount: number;
    createdByUsername: string;
    note: string;
    createdAt: string;
    targetPurchaseInvoice: { id: string; invoiceNumber: string };
  }>;
}

interface SupplierCreditNoteDocumentForm {
  supplierDocumentNumber: string;
  creditDate: string;
  documentSubTotal: string;
  documentTaxAmount: string;
  documentTotalAmount: string;
  note: string;
}

interface SupplierCreditApplicationForm {
  targetPurchaseInvoiceId: string;
  documentAmount: string;
  idempotencyKey: string;
  note: string;
}

function isSupplierCreditNoteList(value: unknown): value is SupplierCreditNoteData[] {
  return Array.isArray(value) && value.every((item) => item && typeof item === 'object'
    && typeof item.id === 'string' && typeof item.status === 'string'
    && (item.supplierDocumentNumber === null || typeof item.supplierDocumentNumber === 'string')
    && (item.creditDate === null || typeof item.creditDate === 'string')
    && typeof item.currencyCode === 'string' && typeof item.functionalCurrencyCode === 'string'
    && typeof item.exchangeRate === 'number' && Number.isFinite(item.exchangeRate)
    && ['documentSubTotal', 'documentTaxAmount', 'documentTotalAmount', 'subTotal', 'taxAmount', 'totalAmount', 'quantity', 'unitPrice',
      'unappliedDocumentAmount', 'unappliedFunctionalAmount']
      .every((field) => typeof item[field] === 'number' && Number.isFinite(item[field]))
    && typeof item.createdByUserId === 'string' && typeof item.createdByUsername === 'string'
    && (item.approvedByUserId === null || typeof item.approvedByUserId === 'string')
    && (item.approvedByUsername === null || typeof item.approvedByUsername === 'string')
    && (item.postedByUserId === null || typeof item.postedByUserId === 'string')
    && (item.postedByUsername === null || typeof item.postedByUsername === 'string')
    && item.vendor && typeof item.vendor === 'object'
    && typeof item.vendor.id === 'string' && typeof item.vendor.code === 'string' && typeof item.vendor.name === 'string'
    && item.sourceInvoice && typeof item.sourceInvoice === 'object'
    && typeof item.sourceInvoice.id === 'string' && typeof item.sourceInvoice.invoiceNumber === 'string'
    && typeof item.sourceInvoice.status === 'string'
    && item.sourceInvoiceLine && typeof item.sourceInvoiceLine === 'object'
    && typeof item.sourceInvoiceLine.description === 'string'
    && typeof item.sourceInvoiceLine.quantity === 'number' && typeof item.sourceInvoiceLine.unitPrice === 'number'
    && item.sourceReturn && typeof item.sourceReturn === 'object'
    && typeof item.sourceReturn.id === 'string' && typeof item.sourceReturn.quantity === 'number'
    && typeof item.sourceReturn.reason === 'string' && typeof item.sourceReturn.createdAt === 'string'
    && Array.isArray(item.workflowEvents)
    && item.workflowEvents.every((event) => event && typeof event === 'object'
      && typeof event.action === 'string' && typeof event.actorUsername === 'string'
      && typeof event.note === 'string' && typeof event.createdAt === 'string')
    && Array.isArray(item.applications)
    && item.applications.every((application) => application && typeof application === 'object'
      && typeof application.id === 'string' && typeof application.documentAmount === 'number'
      && typeof application.functionalAmount === 'number' && typeof application.createdByUsername === 'string'
      && typeof application.note === 'string' && typeof application.createdAt === 'string'
      && application.targetPurchaseInvoice && typeof application.targetPurchaseInvoice === 'object'
      && typeof application.targetPurchaseInvoice.id === 'string'
      && typeof application.targetPurchaseInvoice.invoiceNumber === 'string'));
}

function isPurchaseOrderList(value: unknown): value is PurchaseOrderData[] {
  return Array.isArray(value) && value.every((order) => order !== null && typeof order === 'object'
    && typeof order.id === 'string' && typeof order.orderNumber === 'string'
    && typeof order.currencyCode === 'string' && typeof order.status === 'string'
    && typeof order.createdByUserId === 'string' && typeof order.createdByUsername === 'string'
    && (order.expectedAt === null || typeof order.expectedAt === 'string')
    && (order.description === null || typeof order.description === 'string')
    && order.vendor !== null && typeof order.vendor === 'object'
    && typeof order.vendor.id === 'string' && typeof order.vendor.code === 'string' && typeof order.vendor.name === 'string'
    && order.approvedByUsername !== undefined
    && (order.approvedByUsername === null || typeof order.approvedByUsername === 'string')
    && Array.isArray(order.lines) && order.lines.every((line) => line !== null && typeof line === 'object'
      && typeof line.id === 'string' && typeof line.description === 'string'
      && (line.materialId === null || typeof line.materialId === 'string')
      && typeof line.quantity === 'number' && validQuantity(line.quantity, line.material?.unitCode) && typeof line.unitPrice === 'number' && Number.isFinite(line.unitPrice)
      && (line.material === null || (typeof line.material === 'object'
        && typeof line.material.id === 'string' && typeof line.material.sku === 'string'
        && typeof line.material.unitCode === 'string'))));
}

function isPurchasesData(value: unknown): value is PurchasesData {
  if (!value || typeof value !== 'object') return false;
  const data = value as Record<string, unknown>;
  if (!data.entity || typeof data.entity !== 'object'
    || !Array.isArray(data.vendors) || !Array.isArray(data.materials)
    || !Array.isArray(data.warehouses) || !Array.isArray(data.taxRates) || !Array.isArray(data.invoices)) return false;
  const entity = data.entity as Record<string, unknown>;
  return typeof entity.name === 'string'
    && typeof entity.countryCode === 'string'
    && typeof entity.currencyCode === 'string'
    && data.vendors.every((vendor) => vendor && typeof vendor === 'object'
      && typeof vendor.id === 'string' && typeof vendor.code === 'string' && typeof vendor.name === 'string')
    && data.materials.every((material) => material && typeof material === 'object'
      && typeof material.id === 'string' && typeof material.sku === 'string'
      && typeof material.name === 'string' && typeof material.unitCode === 'string')
    && data.warehouses.every((warehouse) => warehouse && typeof warehouse === 'object'
      && typeof warehouse.id === 'string' && typeof warehouse.code === 'string' && typeof warehouse.name === 'string')
    && data.taxRates.every((rate) => rate && typeof rate === 'object'
      && typeof rate.id === 'string' && typeof rate.code === 'string' && typeof rate.name === 'string'
      && typeof rate.rate === 'number' && Number.isFinite(rate.rate) && rate.rate >= 0 && rate.rate <= 100
      && typeof rate.purchaseVatRecoverable === 'boolean')
    && data.invoices.every((invoice) => invoice && typeof invoice === 'object'
      && typeof invoice.id === 'string' && typeof invoice.invoiceNumber === 'string'
      && typeof invoice.issueDate === 'string' && typeof invoice.dueDate === 'string'
      && typeof invoice.currencyCode === 'string' && typeof invoice.taxRateCode === 'string'
      && typeof invoice.taxRate === 'number' && Number.isFinite(invoice.taxRate)
      && ['subTotal', 'taxAmount', 'totalAmount'].every((field) => typeof invoice[field] === 'number' && Number.isFinite(invoice[field]))
      && ['documentCurrencyCode', 'functionalCurrencyCode', 'exchangeRateDate', 'exchangeRateSource', 'exchangeRateImportedAt']
        .every((field) => field in invoice && (invoice[field] === null || typeof invoice[field] === 'string'))
      && ['documentSubTotal', 'documentTaxAmount', 'documentTotalAmount', 'exchangeRate']
        .every((field) => field in invoice && (invoice[field] === null || (typeof invoice[field] === 'number' && Number.isFinite(invoice[field]))))
      && ['createdByUsername', 'approvedByUsername', 'approvedAt', 'postedByUsername', 'postedAt']
        .every((field) => field in invoice && (invoice[field] === null || typeof invoice[field] === 'string'))
      && Array.isArray(invoice.workflowEvents)
      && invoice.workflowEvents.every((item) => item && typeof item === 'object'
        && typeof item.action === 'string' && typeof item.actorUsername === 'string'
        && typeof item.note === 'string' && typeof item.createdAt === 'string')
      && ('postingJournalEntry' in invoice)
      && (invoice.postingJournalEntry === null || (
        typeof invoice.postingJournalEntry === 'object'
        && typeof invoice.postingJournalEntry.entryNumber === 'string'
        && typeof invoice.postingJournalEntry.date === 'string'
      ))
      && typeof invoice.status === 'string'
      && invoice.vendor && typeof invoice.vendor === 'object'
      && typeof invoice.vendor.code === 'string' && typeof invoice.vendor.name === 'string'
      && Array.isArray(invoice.lines)
      && invoice.lines.every((line) => line && typeof line === 'object'
        && typeof line.id === 'string' && typeof line.description === 'string'
        && (line.materialId === null || typeof line.materialId === 'string')
        && (line.purchaseOrderLineId === null || typeof line.purchaseOrderLineId === 'string')
        && typeof line.quantity === 'number' && validQuantity(line.quantity) && typeof line.unitPrice === 'number' && Number.isFinite(line.unitPrice)));
}

function amount(value: number, currency: string): string {
  return `${value.toLocaleString('fr-FR', { minimumFractionDigits: 3, maximumFractionDigits: 3 })} ${currency}`;
}

function getNextMonthStart(value: string): string {
  const date = new Date(`${value.slice(0, 10)}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) throw new Error('Date de facture fournisseur invalide.');
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1)).toISOString().slice(0, 10);
}

export default function PurchasesPanel({
  accessToken,
  entityId,
  userId,
}: {
  accessToken: string | null;
  entityId: string | null;
  userId: string | null;
}) {
  const language = useInterfaceLanguage();
  const text = (value: string) => translateBusinessText(language, value);
  const today = new Date().toISOString().slice(0, 10);
  const [data, setData] = useState<PurchasesData | null>(null);
  const [supplierScore, setSupplierScore] = useState<SupplierScore | null>(null);
  const [supplierScoreError, setSupplierScoreError] = useState('');
  const [supplierScoreLoading, setSupplierScoreLoading] = useState(false);
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrderData[]>([]);
  const [supplierCreditNotes, setSupplierCreditNotes] = useState<SupplierCreditNoteData[]>([]);
  const [creditDocumentForms, setCreditDocumentForms] = useState<Record<string, SupplierCreditNoteDocumentForm>>({});
  const [creditApplicationForms, setCreditApplicationForms] = useState<Record<string, SupplierCreditApplicationForm>>({});
  const [orderNumber, setOrderNumber] = useState('');
  const [orderExpectedAt, setOrderExpectedAt] = useState('');
  const [orderDescription, setOrderDescription] = useState('');
  const [receiptOrderLineId, setReceiptOrderLineId] = useState('');
  const [receiptWarehouseId, setReceiptWarehouseId] = useState('');
  const [receiptQuantity, setReceiptQuantity] = useState('1');
  const [receiptReason, setReceiptReason] = useState('');
  const [orderLines, setOrderLines] = useState<Array<{ description: string; materialId: string; quantity: string; unitPrice: string }>>([
    { description: '', materialId: '', quantity: '1', unitPrice: '' },
  ]);
  const [orderWorkflowNotes, setOrderWorkflowNotes] = useState<Record<string, string>>({});
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [vendorId, setVendorId] = useState('');
  const [issueDate, setIssueDate] = useState(today);
  const [dueDate, setDueDate] = useState('');
  const [subTotal, setSubTotal] = useState('');
  const [invoiceLines, setInvoiceLines] = useState<Array<{ description: string; materialId: string; purchaseOrderLineId: string; quantity: string; unitPrice: string }>>([]);
  const [taxRateId, setTaxRateId] = useState('');
  const [documentCurrencyCode, setDocumentCurrencyCode] = useState('');
  const [exchangeRate, setExchangeRate] = useState('');
  const [exchangeRateDate, setExchangeRateDate] = useState(today);
  const [exchangeRateSource, setExchangeRateSource] = useState('');
  const [exchangeRateImportedAt, setExchangeRateImportedAt] = useState('');
  const [fxSuggestionMessage, setFxSuggestionMessage] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [workflowBusyId, setWorkflowBusyId] = useState('');
  const [workflowNotes, setWorkflowNotes] = useState<Record<string, string>>({});
  const [cancellationDates, setCancellationDates] = useState<Record<string, string>>({});
  const [refreshVersion, setRefreshVersion] = useState(0);
  const selectedVendor = data?.vendors.find((vendor) => vendor.id === vendorId) ?? null;

  useEffect(() => {
    const controller = new AbortController();
    setData(null);
    setError('');
    if (!accessToken || !entityId) {
      setLoading(false);
      setError(!accessToken
        ? 'Session API indisponible. Reconnectez-vous pour charger les données fournisseurs.'
        : 'Aucune société authentifiée n’est associée à cette session.');
      return () => controller.abort();
    }

    const loadData = async () => {
      setLoading(true);
      try {
        const headers = { Authorization: 'Bearer ' + accessToken };
        const [response, orderResponse, creditNoteResponse] = await Promise.all([
          fetch('/api/purchases/data', { headers, signal: controller.signal }),
          fetch('/api/purchases/orders', { headers, signal: controller.signal }),
          fetch('/api/purchases/credit-notes', { headers, signal: controller.signal }),
        ]);
        const [payload, orderPayload, creditNotePayload]: [unknown, unknown, unknown] = await Promise.all([
          response.json(),
          orderResponse.json(),
          creditNoteResponse.json(),
        ]);
        for (const result of [response, orderResponse, creditNoteResponse]) {
          if (!result.ok) {
            const body = result === response ? payload : result === orderResponse ? orderPayload : creditNotePayload;
            const message = body && typeof body === 'object' && 'error' in body
              && typeof body.error === 'string'
              ? body.error
              : 'Impossible de charger les achats de cette société.';
            throw new Error(message);
          }
        }
        if (!isPurchasesData(payload)) throw new Error('La réponse des achats est invalide.');
        if (!isPurchaseOrderList(orderPayload)) throw new Error('La réponse des commandes fournisseur est invalide.');
        if (!isSupplierCreditNoteList(creditNotePayload)) throw new Error('La réponse des avoirs fournisseurs est invalide.');
        if (!controller.signal.aborted) {
          setData(payload);
          setPurchaseOrders(orderPayload);
          setSupplierCreditNotes(creditNotePayload);
          setDocumentCurrencyCode((current) => current || payload.entity.currencyCode);
          setVendorId((current) => current && payload.vendors.some((vendor) => vendor.id === current)
            ? current
            : payload.vendors[0]?.id ?? '');
          setTaxRateId((current) => current && payload.taxRates.some((rate) => rate.id === current)
            ? current
            : '');
        }
      } catch (requestError) {
        if (!controller.signal.aborted) {
          setError(requestError instanceof Error ? requestError.message : 'Le module Achats est indisponible.');
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };

    void loadData();
    return () => controller.abort();
  }, [accessToken, entityId, refreshVersion]);

  useEffect(() => {
    const controller = new AbortController();
    setSupplierScore(null);
    setSupplierScoreError('');
    if (!accessToken || !entityId || !vendorId) {
      setSupplierScoreLoading(false);
      return () => controller.abort();
    }
    const loadScore = async () => {
      setSupplierScoreLoading(true);
      try {
        const response = await fetch(`/api/purchases/vendors/${encodeURIComponent(vendorId)}/score`, {
          headers: { Authorization: 'Bearer ' + accessToken },
          signal: controller.signal,
        });
        const payload: unknown = await response.json();
        if (!response.ok) {
          const message = payload && typeof payload === 'object' && 'error' in payload
            && typeof payload.error === 'string' ? payload.error : 'Impossible de charger le score fournisseur.';
          throw new Error(message);
        }
        if (!isSupplierScore(payload)) throw new Error('Le score fournisseur reçu est invalide.');
        if (!controller.signal.aborted) setSupplierScore(payload);
      } catch (requestError) {
        if (!controller.signal.aborted) {
          setSupplierScoreError(requestError instanceof Error ? requestError.message : 'Impossible de charger le score fournisseur.');
        }
      } finally {
        if (!controller.signal.aborted) setSupplierScoreLoading(false);
      }
    };
    void loadScore();
    return () => controller.abort();
  }, [accessToken, entityId, vendorId, refreshVersion]);

  useEffect(() => {
    const handleImported = (event: Event) => {
      if ((event as CustomEvent<{ kind?: string }>).detail?.kind === 'vendor') {
        setRefreshVersion((version) => version + 1);
      }
    };
    window.addEventListener('safe:master-data-imported', handleImported);
    return () => window.removeEventListener('safe:master-data-imported', handleImported);
  }, []);

  const selectedRate = data?.taxRates.find((rate) => rate.id === taxRateId);
  const selectedReceiptOrderLine = purchaseOrders
    .filter((order) => order.status === 'APPROVED')
    .flatMap((order) => order.lines.map((line) => ({ order, line })))
    .find(({ line }) => line.id === receiptOrderLineId);
  const invoiceLinesTotal = invoiceLines.reduce((total, line) => {
    const quantity = Number(line.quantity);
    const unitPrice = Number(line.unitPrice);
    return total + (validQuantity(quantity) && quantity > 0 && Number.isFinite(unitPrice)
      ? Math.round(Math.round(unitPrice * 1000) * quantity)
      : 0);
  }, 0);
  const preview = useMemo(() => {
    const base = Number(subTotal);
    if (!Number.isFinite(base) || base <= 0 || !selectedRate) return null;
    const baseMillimes = Math.round(base * 1000);
    if (!Number.isSafeInteger(baseMillimes) || Math.abs(base * 1000 - baseMillimes) > 1e-7) return null;
    const taxMillimes = Math.round(baseMillimes * selectedRate.rate / 100);
    const totalMillimes = baseMillimes + taxMillimes;
    if (!Number.isSafeInteger(taxMillimes) || !Number.isSafeInteger(totalMillimes)) return null;
    return { tax: taxMillimes / 1000, total: totalMillimes / 1000 };
  }, [selectedRate, subTotal]);
  const functionalPreview = useMemo(() => {
    if (!preview || !data || documentCurrencyCode === data.entity.currencyCode) return null;
    const rate = Number(exchangeRate);
    if (!Number.isFinite(rate) || rate <= 0) return null;
    const subTotalMillimes = Math.round(Number(subTotal) * 1000);
    const taxMillimes = Math.round(preview.tax * 1000);
    const functionalSubTotal = Math.round(subTotalMillimes * rate);
    const functionalTax = Math.round(taxMillimes * rate);
    if (!Number.isSafeInteger(functionalSubTotal) || !Number.isSafeInteger(functionalTax)) return null;
    return (functionalSubTotal + functionalTax) / 1000;
  }, [data, documentCurrencyCode, exchangeRate, preview, subTotal]);
  const purchaseExportColumns = [
    { header: 'N° facture', key: 'invoiceNumber' },
    { header: 'Code fournisseur', key: 'vendorCode' },
    { header: 'Fournisseur', key: 'vendorName' },
    { header: 'Date facture', key: 'issueDate' },
    { header: 'Échéance', key: 'dueDate' },
    { header: 'Devise', key: 'currency' },
    { header: 'HT', key: 'subTotal' },
    { header: 'TVA', key: 'taxAmount' },
    { header: 'TTC', key: 'totalAmount' },
    { header: 'Détail des lignes', key: 'lineDetails' },
    { header: 'Statut', key: 'status' },
  ];
  const purchaseExportRows = data?.invoices.map((invoice) => ({
    invoiceNumber: invoice.invoiceNumber,
    vendorCode: invoice.vendor.code,
    vendorName: invoice.vendor.name,
    issueDate: invoice.issueDate.slice(0, 10),
    dueDate: invoice.dueDate.slice(0, 10),
    currency: invoice.documentCurrencyCode ?? invoice.currencyCode,
    subTotal: invoice.documentSubTotal ?? invoice.subTotal,
    taxAmount: invoice.documentTaxAmount ?? invoice.taxAmount,
    totalAmount: invoice.documentTotalAmount ?? invoice.totalAmount,
    lineDetails: invoice.lines.map((line) => {
      const material = line.materialId ? data?.materials.find((item) => item.id === line.materialId) : null;
      return `${line.description} · ${line.quantity} × ${line.unitPrice.toFixed(3)}${material ? ` · ${material.sku}` : ''}`;
    }).join(' | ') || 'Détail non fourni',
    status: invoice.status,
  })) ?? [];
  const purchaseExportMeta = data ? {
    moduleName: 'Factures fournisseurs',
    companyName: data.entity.name,
    currency: data.entity.currencyCode,
  } : null;

  const submitPurchaseOrder = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!accessToken || !entityId || saving || !data) return;
    setSaving(true);
    setError('');
    setNotice('');
    const validLines = orderLines.every((line) => line.description.trim()
      && validQuantity(Number(line.quantity), data.materials.find((material) => material.id === line.materialId)?.unitCode)
      && Number(line.quantity) > 0
      && Number.isFinite(Number(line.unitPrice)) && Number(line.unitPrice) > 0);
    if (!validLines) {
      setError('Complétez la désignation, une quantité adaptée à l’unité et un prix positif sur chaque ligne de commande.');
      setSaving(false);
      return;
    }
    try {
      const response = await fetch('/api/purchases/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + accessToken },
        body: JSON.stringify({
          orderNumber,
          vendorId,
          currencyCode: data.entity.currencyCode,
          expectedAt: orderExpectedAt || null,
          description: orderDescription,
          lines: orderLines.map((line) => ({
            description: line.description.trim(),
            materialId: line.materialId || null,
            quantity: Number(line.quantity),
            unitPrice: Number(line.unitPrice),
          })),
        }),
      });
      const payload: unknown = await response.json();
      if (!response.ok) {
        const message = payload && typeof payload === 'object' && 'error' in payload && typeof payload.error === 'string'
          ? payload.error
          : 'La commande fournisseur n’a pas pu être enregistrée.';
        throw new Error(message);
      }
      setOrderNumber('');
      setOrderExpectedAt('');
      setOrderDescription('');
      setOrderLines([{ description: '', materialId: '', quantity: '1', unitPrice: '' }]);
      setNotice('Commande enregistrée pour contrôle; elle ne peut être réceptionnée avant approbation.');
      setRefreshVersion((version) => version + 1);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Erreur lors de l’enregistrement de la commande.');
    } finally {
      setSaving(false);
    }
  };

  const runPurchaseOrderAction = async (orderId: string, action: 'approve' | 'reject') => {
    if (!accessToken || workflowBusyId) return;
    setWorkflowBusyId(orderId);
    setError('');
    setNotice('');
    try {
      const response = await fetch(`/api/purchases/orders/${encodeURIComponent(orderId)}/${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + accessToken },
        body: JSON.stringify({ note: orderWorkflowNotes[orderId] ?? '' }),
      });
      const payload: unknown = await response.json();
      if (!response.ok) {
        const message = payload && typeof payload === 'object' && 'error' in payload && typeof payload.error === 'string'
          ? payload.error
          : 'La commande ne peut pas changer de statut.';
        throw new Error(message);
      }
      setOrderWorkflowNotes((previous) => ({ ...previous, [orderId]: '' }));
      setNotice(action === 'approve' ? 'Commande approuvée; les réceptions peuvent être engagées.'
        : 'Commande rejetée; aucune réception n’a été créée.');
      setRefreshVersion((version) => version + 1);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Le contrôle de la commande a échoué.');
    } finally {
      setWorkflowBusyId('');
    }
  };

  const getCreditDocumentForm = (creditNote: SupplierCreditNoteData): SupplierCreditNoteDocumentForm => (
    creditDocumentForms[creditNote.id] ?? {
      supplierDocumentNumber: '',
      creditDate: today,
      documentSubTotal: String(creditNote.documentSubTotal),
      documentTaxAmount: String(creditNote.documentTaxAmount),
      documentTotalAmount: String(creditNote.documentTotalAmount),
      note: '',
    }
  );

  const creditApplicationTargets = (creditNote: SupplierCreditNoteData) => (data?.invoices ?? []).filter((invoice) => (
    invoice.status === 'POSTED'
    && invoice.id !== creditNote.sourceInvoice.id
    && invoice.vendor.id === creditNote.vendor.id
    && (invoice.documentCurrencyCode ?? invoice.currencyCode) === creditNote.currencyCode
    && (invoice.functionalCurrencyCode ?? invoice.currencyCode) === creditNote.functionalCurrencyCode
    && (invoice.exchangeRate ?? 1) === creditNote.exchangeRate
  ));

  const getCreditApplicationForm = (creditNote: SupplierCreditNoteData): SupplierCreditApplicationForm => (
    creditApplicationForms[creditNote.id] ?? {
      targetPurchaseInvoiceId: '',
      documentAmount: String(creditNote.unappliedDocumentAmount),
      idempotencyKey: '',
      note: '',
    }
  );

  const applySupplierCredit = async (creditNote: SupplierCreditNoteData) => {
    if (!accessToken || workflowBusyId) return;
    const form = getCreditApplicationForm(creditNote);
    const documentAmount = Number(form.documentAmount);
    if (!form.targetPurchaseInvoiceId || !creditApplicationTargets(creditNote)
      .some((invoice) => invoice.id === form.targetPurchaseInvoiceId)
      || !Number.isFinite(documentAmount) || documentAmount <= 0
      || documentAmount > creditNote.unappliedDocumentAmount || form.note.trim().length < 5) {
      setError('Choisissez une facture payable compatible, un montant dans le solde d’avoir et une note de 5 caractères minimum.');
      return;
    }
    const idempotencyKey = form.idempotencyKey || crypto.randomUUID();
    setCreditApplicationForms((current) => ({
      ...current,
      [creditNote.id]: { ...form, idempotencyKey },
    }));
    setWorkflowBusyId(creditNote.id);
    setError('');
    setNotice('');
    try {
      const response = await fetch(`/api/purchases/credit-notes/${encodeURIComponent(creditNote.id)}/applications`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + accessToken },
        body: JSON.stringify({
          targetPurchaseInvoiceId: form.targetPurchaseInvoiceId,
          documentAmount,
          idempotencyKey,
          note: form.note,
        }),
      });
      const payload: unknown = await response.json();
      if (!response.ok) {
        const message = payload && typeof payload === 'object' && 'error' in payload && typeof payload.error === 'string'
          ? payload.error
          : 'Le solde d’avoir ne peut pas être affecté à cette facture.';
        throw new Error(message);
      }
      setCreditApplicationForms((current) => ({
        ...current,
        [creditNote.id]: { targetPurchaseInvoiceId: '', documentAmount: '', idempotencyKey: '', note: '' },
      }));
      setNotice('Affectation fournisseur enregistrée; le solde payable cible a été réduit sans générer de mouvement bancaire.');
      setRefreshVersion((version) => version + 1);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'L’affectation du solde fournisseur a échoué.');
    } finally {
      setWorkflowBusyId('');
    }
  };

  const submitSupplierCreditDocument = async (creditNote: SupplierCreditNoteData) => {
    if (!accessToken || workflowBusyId) return;
    const form = getCreditDocumentForm(creditNote);
    if (!form.supplierDocumentNumber.trim() || !form.creditDate || form.note.trim().length < 5
      || ![form.documentSubTotal, form.documentTaxAmount, form.documentTotalAmount]
        .every((value) => Number.isFinite(Number(value)) && Number(value) >= 0)) {
      setError('La référence, la date, les montants document et une note de contrôle d’au moins 5 caractères sont requis.');
      return;
    }
    setWorkflowBusyId(creditNote.id);
    setError('');
    setNotice('');
    try {
      const response = await fetch(`/api/purchases/credit-notes/${encodeURIComponent(creditNote.id)}/document`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + accessToken },
        body: JSON.stringify({
          supplierDocumentNumber: form.supplierDocumentNumber,
          creditDate: form.creditDate,
          documentSubTotal: Number(form.documentSubTotal),
          documentTaxAmount: Number(form.documentTaxAmount),
          documentTotalAmount: Number(form.documentTotalAmount),
          note: form.note,
        }),
      });
      const payload: unknown = await response.json();
      if (!response.ok) {
        const message = payload && typeof payload === 'object' && 'error' in payload && typeof payload.error === 'string'
          ? payload.error
          : 'Le document fournisseur ne peut pas être enregistré.';
        throw new Error(message);
      }
      setNotice('Document fournisseur enregistré; l’avoir attend un contrôle indépendant.');
      setRefreshVersion((version) => version + 1);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Le document fournisseur n’a pas pu être enregistré.');
    } finally {
      setWorkflowBusyId('');
    }
  };

  const runSupplierCreditAction = async (creditNoteId: string, action: 'approve' | 'post') => {
    if (!accessToken || workflowBusyId) return;
    setWorkflowBusyId(creditNoteId);
    setError('');
    setNotice('');
    try {
      const response = await fetch(`/api/purchases/credit-notes/${encodeURIComponent(creditNoteId)}/${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + accessToken },
        body: JSON.stringify({ note: workflowNotes[creditNoteId] ?? '' }),
      });
      const payload: unknown = await response.json();
      if (!response.ok) {
        const message = payload && typeof payload === 'object' && 'error' in payload && typeof payload.error === 'string'
          ? payload.error
          : 'L’avoir fournisseur ne peut pas changer de statut.';
        throw new Error(message);
      }
      setWorkflowNotes((previous) => ({ ...previous, [creditNoteId]: '' }));
      setNotice(action === 'approve' ? 'Avoir approuvé; la comptabilisation doit être effectuée par une troisième personne.'
        : 'Avoir comptabilisé; le solde fournisseur a été réduit.');
      setRefreshVersion((version) => version + 1);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Le contrôle de l’avoir fournisseur a échoué.');
    } finally {
      setWorkflowBusyId('');
    }
  };

  const submitPurchaseOrderReceipt = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!accessToken || !entityId || saving || !data) return;
    const selected = purchaseOrders.flatMap((order) => order.status === 'APPROVED'
      ? order.lines.map((line) => ({ order, line }))
      : []).find(({ line }) => line.id === receiptOrderLineId);
    if (!selected || !selected.line.materialId) {
      setError('Choisissez une ligne de stock d’une commande approuvée.');
      return;
    }
    if (!validQuantity(Number(receiptQuantity), selected.line.material?.unitCode) || Number(receiptQuantity) <= 0
      || !receiptWarehouseId || receiptReason.trim().length < 5) {
      setError('Une quantité adaptée à l’unité, le dépôt et un motif de réception d’au moins 5 caractères sont requis.');
      return;
    }
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const response = await fetch(`/api/purchases/orders/${encodeURIComponent(selected.order.id)}/receipts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + accessToken },
        body: JSON.stringify({
          purchaseOrderLineId: selected.line.id,
          warehouseId: receiptWarehouseId,
          quantity: Number(receiptQuantity),
          unitCost: selected.line.unitPrice,
          reason: receiptReason.trim(),
          idempotencyKey: `po-receipt-${crypto.randomUUID()}`,
        }),
      });
      const payload: unknown = await response.json();
      if (!response.ok) {
        const message = payload && typeof payload === 'object' && 'error' in payload && typeof payload.error === 'string'
          ? payload.error
          : 'La réception de la commande a échoué.';
        throw new Error(message);
      }
      setReceiptQuantity('1');
      setReceiptReason('');
      setNotice('Réception créée dans le dépôt sélectionné et reliée à la commande.');
      setRefreshVersion((version) => version + 1);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'La réception de la commande a échoué.');
    } finally {
      setSaving(false);
    }
  };

  const submitInvoice = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!accessToken || !entityId || saving) return;
    setSaving(true);
    setError('');
    setNotice('');
    if (invoiceLines.length > 0) {
      const detailIsValid = invoiceLines.every((line) => line.description.trim()
        && validQuantity(Number(line.quantity), data?.materials.find((material) => material.id === line.materialId)?.unitCode)
        && Number(line.quantity) > 0
        && Number.isFinite(Number(line.unitPrice)) && Number(line.unitPrice) > 0);
      if (!detailIsValid || invoiceLinesTotal !== Math.round(Number(subTotal) * 1000)) {
        setError('Complétez chaque ligne et vérifiez que le total des lignes est exactement égal au montant HT.');
        setSaving(false);
        return;
      }
    }
    try {
      const response = await fetch('/api/purchases/invoices', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + accessToken,
        },
        body: JSON.stringify({
          invoiceNumber,
          vendorId,
          issueDate,
          dueDate,
          subTotal: Number(subTotal),
          taxRateId,
          ...(invoiceLines.length > 0 ? {
            lines: invoiceLines.map((line) => ({
              description: line.description.trim(),
              materialId: line.materialId || null,
              purchaseOrderLineId: line.purchaseOrderLineId || null,
              quantity: Number(line.quantity),
              unitPrice: Number(line.unitPrice),
            })),
          } : {}),
          documentCurrencyCode,
          exchangeRate: documentCurrencyCode === data?.entity.currencyCode ? undefined : Number(exchangeRate),
          exchangeRateDate: documentCurrencyCode === data?.entity.currencyCode ? undefined : exchangeRateDate,
          exchangeRateSource: documentCurrencyCode === data?.entity.currencyCode ? undefined : exchangeRateSource,
          exchangeRateImportedAt: documentCurrencyCode === data?.entity.currencyCode ? undefined : exchangeRateImportedAt || undefined,
        }),
      });
      const payload: unknown = await response.json();
      if (!response.ok) {
        const message = payload && typeof payload === 'object' && 'error' in payload
          && typeof payload.error === 'string'
          ? payload.error
          : 'La facture fournisseur n’a pas pu être enregistrée.';
        throw new Error(message);
      }
      setInvoiceNumber('');
      setDueDate('');
      setSubTotal('');
      setInvoiceLines([]);
      setDocumentCurrencyCode(data?.entity.currencyCode ?? '');
      setExchangeRate('');
      setExchangeRateDate(today);
      setExchangeRateSource('');
      setExchangeRateImportedAt('');
      setNotice('Facture enregistrée pour contrôle. Aucune écriture comptable n’a été créée.');
      setRefreshVersion((version) => version + 1);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Erreur lors de l’enregistrement de la facture.');
    } finally {
      setSaving(false);
    }
  };

  const runWorkflowAction = async (invoiceId: string, action: 'approve' | 'reject' | 'post' | 'cancel') => {
    if (!accessToken || workflowBusyId) return;
    setWorkflowBusyId(invoiceId);
    setError('');
    setNotice('');
    try {
      const response = await fetch(`/api/purchases/invoices/${encodeURIComponent(invoiceId)}/${action}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + accessToken,
        },
        body: JSON.stringify({
          note: workflowNotes[invoiceId] ?? '',
          ...(action === 'cancel'
            ? { date: cancellationDates[invoiceId] ?? getNextMonthStart(data?.invoices.find((invoice) => invoice.id === invoiceId)?.issueDate ?? '') }
            : {}),
        }),
      });
      const payload: unknown = await response.json();
      if (!response.ok) {
        const message = payload && typeof payload === 'object' && 'error' in payload
          && typeof payload.error === 'string'
          ? payload.error
          : 'La transition de la facture n’a pas abouti.';
        throw new Error(message);
      }
      setWorkflowNotes((previous) => ({ ...previous, [invoiceId]: '' }));
      setNotice(action === 'approve'
        ? 'Contrôle validé. La facture attend une comptabilisation par une autre personne.'
        : action === 'reject'
          ? 'Facture rejetée; aucun journal n’a été créé.'
          : action === 'post'
            ? 'Facture comptabilisée. Le journal lié est consultable ci-dessous.'
            : 'Demande de contrepassation enregistrée; la facture reste en attente de son contrôle.');
      setRefreshVersion((version) => version + 1);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'La transition de la facture a échoué.');
    } finally {
      setWorkflowBusyId('');
    }
  };

  const loadBctSuggestion = async () => {
    if (!accessToken || !entityId || !documentCurrencyCode || !issueDate) return;
    setFxSuggestionMessage('');
    try {
      const query = new URLSearchParams({ documentCurrencyCode, date: issueDate });
      const response = await fetch(`/api/fx-rates/suggestion?${query}`, {
        headers: { Authorization: 'Bearer ' + accessToken },
      });
      const payload: unknown = await response.json();
      if (!response.ok) {
        const message = payload && typeof payload === 'object' && 'error' in payload
          && typeof payload.error === 'string' ? payload.error : 'Le cours BCT ne peut pas être chargé.';
        throw new Error(message);
      }
      if (!payload || typeof payload !== 'object' || !('available' in payload)
        || typeof payload.available !== 'boolean') throw new Error('La réponse du cours BCT est invalide.');
      const suggestion = payload as {
        available: boolean;
        exchangeRate: number | null;
        exchangeRateDate: string | null;
        exchangeRateSource: string | null;
        exchangeRateImportedAt: string | null;
        message?: string;
      };
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
        ? `Cours BCT importé le ${new Date(suggestion.exchangeRateImportedAt).toLocaleString('fr-FR')}. Vérifiez-le avant l’enregistrement.`
        : 'Même devise fonctionnelle; aucune conversion nécessaire.');
    } catch (requestError) {
      setFxSuggestionMessage(requestError instanceof Error ? requestError.message : 'Le cours BCT est indisponible.');
    }
  };

  const cardStyle: React.CSSProperties = {
    background: '#FFFFFF',
    border: '1px solid #E2E8F0',
    borderRadius: '10px',
    padding: '16px',
  };
  const fieldStyle: React.CSSProperties = {
    border: '1px solid #CBD5E1',
    borderRadius: '6px',
    padding: '8px',
    minWidth: 0,
  };

  return (
    <section aria-labelledby="purchases-title" style={{ display: 'grid', gap: '14px' }}>
      <header style={{ ...cardStyle, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
        <div>
          <h2 id="purchases-title" style={{ margin: 0, color: '#0F172A' }}>{text('Achats & factures fournisseurs')}</h2>
          {data && <p style={{ margin: '6px 0 0', color: '#64748B' }}>{data.entity.name} · {data.entity.countryCode} · {data.entity.currencyCode}</p>}
        </div>
        <button type="button" disabled={loading} onClick={() => setRefreshVersion((version) => version + 1)}
          style={{ ...fieldStyle, background: '#FFFFFF', color: '#334155', fontWeight: 700 }}>
          {loading ? text('Chargement…') : text('Actualiser')}
        </button>
      </header>

      {selectedVendor && (
        <aside aria-label="Fiche du fournisseur sélectionné" style={cardStyle}>
          <h3 style={{ margin: '0 0 6px' }}>{text('Fiche fournisseur —')} {selectedVendor.code} · {selectedVendor.name}</h3>
          <strong>{text('Score fournisseur')}</strong>
          {supplierScoreLoading ? <p style={{ margin: '4px 0 0' }}>{text('Chargement du dernier score…')}</p>
            : supplierScoreError ? <p role="alert" style={{ margin: '4px 0 0', color: '#991B1B' }}>{supplierScoreError}</p>
              : supplierScore ? (
                <>
                  <p style={{ margin: '4px 0', fontWeight: 700 }}>
                    <bdi dir="ltr">{supplierScore.score.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} / 100</bdi>
                    {supplierScore.alertTriggered ? ` — ${text('seuil d’alerte déclenché')}` : ''}
                  </p>
                  <small>
                    {text(supplierScore.isCurrent ? 'Configuration confirmée' : 'Score historique — configuration non active ou modifiée')}
                    {' · v'}<bdi dir="ltr">{supplierScore.configurationVersion}</bdi>
                    {' · '}<bdi dir="ltr">{new Date(supplierScore.calculatedAt).toLocaleString('fr-FR')}</bdi>
                  </small>
                </>
              ) : <p style={{ margin: '4px 0 0' }}>{text('Aucun score calculé avec une configuration confirmée.')}</p>}
        </aside>
      )}

      {loading && <div role="status" style={cardStyle}>{text('Chargement des fournisseurs et factures persistés…')}</div>}
      {error && <div role="alert" style={{ ...cardStyle, background: '#FEF2F2', color: '#991B1B', borderColor: '#FECACA' }}>{error}</div>}
      {notice && <div role="status" style={{ ...cardStyle, background: '#F0FDF4', color: '#166534', borderColor: '#BBF7D0' }}>{notice}</div>}

      {data && (
        <>
          <ImportPreviewPanel
            title="Importer des factures fournisseur"
            description="Une ligne crée une facture à contrôler; l’import ne valide, ne comptabilise et ne paie aucune facture."
            headers={['invoiceNumber', 'vendorCode', 'issueDate', 'dueDate', 'subTotal', 'taxRateCode', 'currencyCode']}
            validateRow={(row, index) => {
              const line = index + 2;
              const vendorCode = String(row.vendorCode ?? '').trim();
              if (!data.vendors.some((vendor) => vendor.code === vendorCode)) return `Ligne ${line} : fournisseur inconnu (${vendorCode || 'code manquant'}).`;
              const issueDateValue = String(row.issueDate ?? '');
              const dueDateValue = String(row.dueDate ?? '');
              const validDate = (value: string) => {
                const date = new Date(`${value}T00:00:00.000Z`);
                return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
              };
              if (!validDate(issueDateValue) || !validDate(dueDateValue) || dueDateValue < issueDateValue) {
                return `Ligne ${line} : issueDate/dueDate doivent être des dates AAAA-MM-JJ valides et l’échéance ne peut précéder la facture.`;
              }
              if (!String(row.invoiceNumber ?? '').trim() || !Number.isFinite(Number(row.subTotal)) || Number(row.subTotal) <= 0) {
                return `Ligne ${line} : invoiceNumber et subTotal positif sont requis.`;
              }
              if (!data.taxRates.some((rate) => rate.code === String(row.taxRateCode).trim())) {
                return `Ligne ${line} : taxRateCode non configuré pour le pays.`;
              }
              if (String(row.currencyCode).trim().toUpperCase() !== data.entity.currencyCode) {
                return `Ligne ${line} : l’import accepte uniquement la devise fonctionnelle ${data.entity.currencyCode}; les devises étrangères exigent un taux sourcé saisi dans le formulaire.`;
              }
              return null;
            }}
            onImport={async (rows) => {
              if (!accessToken || !entityId) throw new Error('Session API invalide.');
              let created = 0;
              const failures: string[] = [];
              for (const [index, row] of rows.entries()) {
                const vendor = data.vendors.find((item) => item.code === String(row.vendorCode).trim());
                const rate = data.taxRates.find((item) => item.code === String(row.taxRateCode).trim());
                if (!vendor || !rate) {
                  failures.push(`ligne ${index + 2}: fournisseur ou taux introuvable`);
                  continue;
                }
                const response = await fetch('/api/purchases/invoices', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + accessToken },
                  body: JSON.stringify({
                    entityId,
                    invoiceNumber: String(row.invoiceNumber).trim(),
                    vendorId: vendor.id,
                    issueDate: String(row.issueDate),
                    dueDate: String(row.dueDate),
                    subTotal: Number(row.subTotal),
                    taxRateId: rate.id,
                    documentCurrencyCode: data.entity.currencyCode,
                  }),
                });
                const payload: unknown = await response.json();
                if (!response.ok) {
                  const message = payload && typeof payload === 'object' && 'error' in payload && typeof payload.error === 'string'
                    ? payload.error
                    : 'refusée par le service achats';
                  failures.push(`ligne ${index + 2}: ${message}`);
                } else {
                  created += 1;
                }
              }
              if (created > 0) setRefreshVersion((version) => version + 1);
              return { created, failures };
            }}
          />
          <form onSubmit={submitPurchaseOrder} style={{ ...cardStyle, display: 'grid', gap: 12 }}>
            <div>
              <h3 style={{ margin: '0 0 5px' }}>{text('Créer une commande fournisseur')}</h3>
              <p style={{ margin: 0, color: '#64748B', fontSize: '0.84rem' }}>
                {text('La commande reste à contrôler jusqu’à approbation par une autre personne. Elle est exprimée dans la devise fonctionnelle; les réceptions ne doivent pas dépasser les quantités commandées.')}
              </p>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
              <label style={{ display: 'grid', gap: 4 }}>{text('N° commande')}
                <input required maxLength={80} value={orderNumber} onChange={(event) => setOrderNumber(event.target.value)} style={fieldStyle} />
              </label>
              <label style={{ display: 'grid', gap: 4 }}>{text('Fournisseur')}
                <select required value={vendorId} onChange={(event) => setVendorId(event.target.value)} style={fieldStyle}>
                  <option value="">{text('Sélectionner')}</option>
                  {data.vendors.map((vendor) => <option key={vendor.id} value={vendor.id}>{vendor.code} — {vendor.name}</option>)}
                </select>
              </label>
              <label style={{ display: 'grid', gap: 4 }}>{text('Réception prévue')}
                <input type="date" value={orderExpectedAt} onChange={(event) => setOrderExpectedAt(event.target.value)} style={fieldStyle} />
              </label>
              <label style={{ display: 'grid', gap: 4 }}>{text('Description')}
                <input maxLength={500} value={orderDescription} onChange={(event) => setOrderDescription(event.target.value)} style={fieldStyle} />
              </label>
            </div>
            {orderLines.map((line, index) => (
              <div key={index} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 8, alignItems: 'end' }}>
                <label style={{ display: 'grid', gap: 4 }}>{text('Désignation')}
                  <input required maxLength={200} value={line.description}
                    onChange={(event) => setOrderLines((current) => current.map((item, row) => row === index ? { ...item, description: event.target.value } : item))}
                    style={fieldStyle} />
                </label>
                <label style={{ display: 'grid', gap: 4 }}>{text('Article stock (facultatif)')}
                  <select value={line.materialId}
                    onChange={(event) => {
                      const material = data.materials.find((item) => item.id === event.target.value);
                      setOrderLines((current) => current.map((item, row) => row === index
                        ? { ...item, materialId: event.target.value, description: item.description || material?.name || '' }
                        : item));
                    }} style={fieldStyle}>
                    <option value="">{text('Service / hors stock')}</option>
                    {data.materials.map((material) => <option key={material.id} value={material.id}>{material.sku} · {material.name} ({material.unitCode})</option>)}
                  </select>
                </label>
                <label style={{ display: 'grid', gap: 4 }}>{text('Quantité')}
                  <input required type="number" min="0.001" step={['EA', 'BOX', 'PACK'].includes(data.materials.find((material) => material.id === line.materialId)?.unitCode ?? '') ? '1' : '0.001'} value={line.quantity}
                    onChange={(event) => setOrderLines((current) => current.map((item, row) => row === index ? { ...item, quantity: event.target.value } : item))}
                    style={fieldStyle} />
                </label>
                <label style={{ display: 'grid', gap: 4 }}>{text('Prix unitaire HT')} ({data.entity.currencyCode})
                  <input required type="number" min="0.001" step="0.001" value={line.unitPrice}
                    onChange={(event) => setOrderLines((current) => current.map((item, row) => row === index ? { ...item, unitPrice: event.target.value } : item))}
                    style={fieldStyle} />
                </label>
                <button type="button" disabled={orderLines.length <= 1} onClick={() => setOrderLines((current) => current.filter((_, row) => row !== index))}
                  style={{ ...fieldStyle, background: '#FFFFFF' }}>{text('Retirer')}</button>
              </div>
            ))}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              <button type="button" disabled={orderLines.length >= 200}
                onClick={() => setOrderLines((current) => [...current, { description: '', materialId: '', quantity: '1', unitPrice: '' }])}
                style={{ ...fieldStyle, background: '#FFFFFF' }}>{text('Ajouter une ligne')}</button>
              <button type="submit" disabled={saving || loading || data.vendors.length === 0}
                style={{ background: '#2563EB', color: '#FFFFFF', border: 0, borderRadius: 6, padding: '9px 14px', fontWeight: 700 }}>
                {saving ? text('Enregistrement…') : text('Soumettre au contrôle')}
              </button>
            </div>
          </form>

          <section style={{ ...cardStyle, overflowX: 'auto' }}>
            <h3 style={{ marginTop: 0 }}>{text('Commandes fournisseur — validation distincte')}</h3>
            {purchaseOrders.length === 0 ? <p>{text('Aucune commande fournisseur enregistrée.')}</p> : (
              <table style={{ width: '100%', minWidth: 850, borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.82rem' }}>
                <thead><tr style={{ background: '#F8FAFC', color: '#475569' }}>
                  <th style={{ padding: 8 }}>{text('Commande / fournisseur')}</th><th style={{ padding: 8 }}>{text('Lignes')}</th>
                  <th style={{ padding: 8 }}>{text('Préparée par')}</th><th style={{ padding: 8 }}>{text('Statut')}</th><th style={{ padding: 8 }}>{text('Contrôle')}</th>
                </tr></thead>
                <tbody>{purchaseOrders.map((order) => (
                  <tr key={order.id} style={{ borderTop: '1px solid #E2E8F0', verticalAlign: 'top' }}>
                    <td style={{ padding: 8 }}><strong>{order.orderNumber}</strong><br />{order.vendor.code} — {order.vendor.name}
                      {order.expectedAt && <><br />{text('Prévue le')} <bdi dir="ltr">{new Date(order.expectedAt).toLocaleDateString('fr-FR')}</bdi></>}
                      {order.description && <><br />{order.description}</>}
                    </td>
                    <td style={{ padding: 8 }}>{order.lines.map((line) => (
                      <div key={line.id}>{line.description} · <bdi dir="ltr">{line.quantity} {line.material?.unitCode ?? ''} × {amount(line.unitPrice, order.currencyCode)}</bdi></div>
                    ))}</td>
                    <td style={{ padding: 8 }}>{order.createdByUsername}</td>
                    <td style={{ padding: 8 }}>{order.status}{order.approvedByUsername ? ` · ${order.approvedByUsername}` : ''}</td>
                    <td style={{ padding: 8, minWidth: 230 }}>
                      {order.status === 'TO_REVIEW' && userId !== order.createdByUserId && (
                        <div style={{ display: 'grid', gap: 6 }}>
                          <textarea required minLength={5} maxLength={500} aria-label={`${text('Contrôle')} ${order.orderNumber}`}
                            value={orderWorkflowNotes[order.id] ?? ''}
                            onChange={(event) => setOrderWorkflowNotes((current) => ({ ...current, [order.id]: event.target.value }))}
                            placeholder={text('Motif du contrôle (5 à 500 caractères)')} style={fieldStyle} />
                          <div style={{ display: 'flex', gap: 6 }}>
                            <button type="button" disabled={workflowBusyId === order.id || (orderWorkflowNotes[order.id] ?? '').trim().length < 5}
                              onClick={() => void runPurchaseOrderAction(order.id, 'approve')}>{text('Approuver')}</button>
                            <button type="button" disabled={workflowBusyId === order.id || (orderWorkflowNotes[order.id] ?? '').trim().length < 5}
                              onClick={() => void runPurchaseOrderAction(order.id, 'reject')}>{text('Rejeter')}</button>
                          </div>
                        </div>
                      )}
                      {order.status === 'TO_REVIEW' && userId === order.createdByUserId && text('Un autre contrôleur est requis.')}
                    </td>
                  </tr>
                ))}</tbody>
              </table>
            )}
          </section>
          <form onSubmit={submitPurchaseOrderReceipt} style={{ ...cardStyle, display: 'grid', gap: 10 }}>
            <div>
              <h3 style={{ margin: '0 0 5px' }}>Réceptionner une commande approuvée</h3>
              <p style={{ margin: 0, color: '#64748B', fontSize: '0.84rem' }}>
                La réception est rattachée à une ligne de commande et contrôlée contre la quantité encore disponible après retours. Le coût unitaire reprend le prix approuvé.
              </p>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10, alignItems: 'end' }}>
              <label style={{ display: 'grid', gap: 4 }}>Ligne approuvée
                <select required value={receiptOrderLineId} onChange={(event) => setReceiptOrderLineId(event.target.value)} style={fieldStyle}>
                  <option value="">Sélectionner une ligne de stock</option>
                  {purchaseOrders.filter((order) => order.status === 'APPROVED')
                    .flatMap((order) => order.lines.filter((line) => line.materialId).map((line) => ({ order, line })))
                    .map(({ order, line }) => (
                      <option key={line.id} value={line.id}>{order.orderNumber} · {line.material?.sku ?? line.description} · {line.quantity} {line.material?.unitCode ?? ''}</option>
                    ))}
                </select>
              </label>
              <label style={{ display: 'grid', gap: 4 }}>Dépôt de destination
                <select required value={receiptWarehouseId} onChange={(event) => setReceiptWarehouseId(event.target.value)} style={fieldStyle}>
                  <option value="">Sélectionner un dépôt</option>
                  {data.warehouses.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.code} — {warehouse.name}</option>)}
                </select>
              </label>
              <label style={{ display: 'grid', gap: 4 }}>Quantité reçue
                <input required type="number" min="0.001" step={selectedReceiptOrderLine?.line.material?.unitCode && ['EA', 'BOX', 'PACK'].includes(selectedReceiptOrderLine.line.material.unitCode) ? '1' : '0.001'} value={receiptQuantity} onChange={(event) => setReceiptQuantity(event.target.value)} style={fieldStyle} />
              </label>
              <label style={{ display: 'grid', gap: 4 }}>Motif / référence de réception
                <input required minLength={5} maxLength={500} value={receiptReason} onChange={(event) => setReceiptReason(event.target.value)} style={fieldStyle} />
              </label>
              <button type="submit" disabled={saving || loading || data.warehouses.length === 0 || !receiptOrderLineId}
                style={{ background: '#2563EB', color: '#FFFFFF', border: 0, borderRadius: 6, padding: '9px 14px', fontWeight: 700 }}>
                {saving ? 'Réception…' : 'Enregistrer la réception'}
              </button>
            </div>
          </form>
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.85fr) minmax(320px, 1.15fr)', gap: 16 }}>
            {/* Left: Formulaire Facture Achat */}
            <form onSubmit={submitInvoice} style={{ ...cardStyle, display: 'grid', gap: '12px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 800, color: '#0F172A' }}>Nouvelle Facture d'Achat</h3>
                <span style={{ fontSize: '0.78rem', color: '#64748B', fontWeight: 600 }}>Achats &gt; Factures Fournisseurs</span>
              </div>
              <p style={{ margin: 0, color: '#64748B', fontSize: '0.82rem' }}>
                Le taux vient du profil pays de l’entité. Cette saisie conserve une facture récapitulative à taux unique; elle ne valide pas le taux et ne génère aucune écriture comptable.
              </p>
              {data.taxRates.length === 0 && (
                <div role="alert" style={{ color: '#92400E', background: '#FFFBEB', padding: '10px', borderRadius: '6px' }}>
                  Aucun taux n’est configuré pour {data.entity.countryCode}. Renseignez le profil pays avant la saisie; aucun taux par défaut n’est injecté.
                </div>
              )}
              {data.vendors.length === 0 && (
                <div role="alert" style={{ color: '#92400E', background: '#FFFBEB', padding: '10px', borderRadius: '6px' }}>
                  Aucun fournisseur n’est enregistré pour cette société.
                </div>
              )}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '10px' }}>
                <label style={{ display: 'grid', gap: '4px' }}>Fournisseur
                  <select required value={vendorId} onChange={(event) => setVendorId(event.target.value)} style={fieldStyle}>
                    <option value="">Sélectionner</option>
                    {data.vendors.map((vendor) => <option key={vendor.id} value={vendor.id}>{vendor.code} — {vendor.name}</option>)}
                  </select>
                </label>
                <label style={{ display: 'grid', gap: '4px' }}>N° Facture Fournisseur
                  <input required maxLength={80} value={invoiceNumber} onChange={(event) => setInvoiceNumber(event.target.value)} style={fieldStyle} />
                </label>
                <label style={{ display: 'grid', gap: '4px' }}>Date pièce
                  <input required type="date" value={issueDate} onChange={(event) => setIssueDate(event.target.value)} style={fieldStyle} />
                </label>
                <label style={{ display: 'grid', gap: '4px' }}>Date d’échéance
                  <input required type="date" min={issueDate} value={dueDate} onChange={(event) => setDueDate(event.target.value)} style={fieldStyle} />
                </label>
                <label style={{ display: 'grid', gap: '4px' }}>Montant HT ({data.entity.currencyCode})
                  <input required type="number" min="0.001" step="0.001" value={subTotal} onChange={(event) => setSubTotal(event.target.value)} style={fieldStyle} />
                </label>
                <label style={{ display: 'grid', gap: '4px' }}>Taux du profil pays
                  <select required value={taxRateId} onChange={(event) => setTaxRateId(event.target.value)} style={fieldStyle}>
                    <option value="">Sélectionner un taux configuré</option>
                    {data.taxRates.map((rate) => <option key={rate.id} value={rate.id}>{rate.code} — {rate.name} ({rate.rate}%)</option>)}
                  </select>
                </label>
              </div>
              <fieldset style={{ border: '1px solid #E2E8F0', borderRadius: '8px', padding: '12px', display: 'grid', gap: '10px' }}>
                <legend style={{ padding: '0 6px', color: '#475569', fontWeight: 700 }}>Détail des lignes et rapprochement stock</legend>
                <p style={{ margin: 0, color: '#64748B', fontSize: '0.8rem' }}>
                  Le détail est facultatif pour les imports ou factures récapitulatives. Pour rapprocher une réception, liez chaque article stock à une ligne; la somme HT des lignes doit correspondre exactement au montant HT de la facture.
                </p>
                {invoiceLines.map((line, index) => (
                  <div key={index} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(145px, 1fr))', gap: 8, alignItems: 'end' }}>
                    <label style={{ display: 'grid', gap: 4 }}>Désignation
                      <input required maxLength={200} value={line.description}
                        onChange={(event) => setInvoiceLines((current) => current.map((item, row) => row === index ? { ...item, description: event.target.value } : item))}
                        style={fieldStyle} />
                    </label>
                    <label style={{ display: 'grid', gap: 4 }}>Ligne de commande (facultatif)
                      <select value={line.purchaseOrderLineId}
                        onChange={(event) => {
                          const selected = purchaseOrders.flatMap((order) => order.status === 'APPROVED' && order.vendor.id === vendorId
                            ? order.lines.map((orderLine) => ({ order, orderLine }))
                            : []).find(({ orderLine }) => orderLine.id === event.target.value);
                          setInvoiceLines((current) => current.map((item, row) => row === index ? {
                            ...item,
                            purchaseOrderLineId: event.target.value,
                            description: selected?.orderLine.description ?? item.description,
                            materialId: selected?.orderLine.materialId ?? '',
                            quantity: selected ? String(Math.min(Number(item.quantity) || 1, selected.orderLine.quantity)) : item.quantity,
                            unitPrice: selected ? String(selected.orderLine.unitPrice) : item.unitPrice,
                          } : item));
                        }} style={fieldStyle}>
                        <option value="">Sans commande fournisseur</option>
                        {purchaseOrders.filter((order) => order.status === 'APPROVED' && order.vendor.id === vendorId)
                          .flatMap((order) => order.lines.map((orderLine) => ({ order, orderLine })))
                          .filter(({ orderLine }) => !invoiceLines.some((other, row) => row !== index && other.purchaseOrderLineId === orderLine.id))
                          .map(({ order, orderLine }) => (
                            <option key={orderLine.id} value={orderLine.id}>
                              {order.orderNumber} · {orderLine.description} · {orderLine.quantity} × {amount(orderLine.unitPrice, order.currencyCode)}
                            </option>
                          ))}
                      </select>
                    </label>
                    <label style={{ display: 'grid', gap: 4 }}>Article stock (facultatif)
                      <select value={line.materialId}
                        onChange={(event) => setInvoiceLines((current) => current.map((item, row) => row === index ? { ...item, materialId: event.target.value } : item))}
                        style={fieldStyle}>
                        <option value="">Service / hors stock</option>
                        {data.materials.map((material) => <option key={material.id} value={material.id}>{material.sku} · {material.name} ({material.unitCode})</option>)}
                      </select>
                    </label>
                    <label style={{ display: 'grid', gap: 4 }}>Quantité
                      <input required type="number" min="0.001" step={['EA', 'BOX', 'PACK'].includes(data.materials.find((material) => material.id === line.materialId)?.unitCode ?? '') ? '1' : '0.001'} value={line.quantity}
                        onChange={(event) => setInvoiceLines((current) => current.map((item, row) => row === index ? { ...item, quantity: event.target.value } : item))}
                        style={fieldStyle} />
                    </label>
                    <label style={{ display: 'grid', gap: 4 }}>Prix unitaire HT ({documentCurrencyCode || data.entity.currencyCode})
                      <input required type="number" min="0.001" step="0.001" value={line.unitPrice}
                        onChange={(event) => setInvoiceLines((current) => current.map((item, row) => row === index ? { ...item, unitPrice: event.target.value } : item))}
                        style={fieldStyle} />
                    </label>
                    <button type="button" onClick={() => setInvoiceLines((current) => current.filter((_, row) => row !== index))}
                      style={{ border: '1px solid #CBD5E1', borderRadius: 6, padding: '8px', background: '#FFFFFF' }}>Retirer</button>
                  </div>
                ))}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
                  <button type="button" disabled={invoiceLines.length >= 200}
                    onClick={() => setInvoiceLines((current) => [...current, { description: '', materialId: '', purchaseOrderLineId: '', quantity: '1', unitPrice: '' }])}
                    style={{ border: '1px solid #CBD5E1', borderRadius: 6, padding: '8px', background: '#FFFFFF' }}>Ajouter une ligne</button>
                  {invoiceLines.length > 0 && <span role="status" style={{ color: invoiceLinesTotal === Math.round(Number(subTotal) * 1000) ? '#166534' : '#92400E' }}>
                    Total lignes : {(invoiceLinesTotal / 1000).toLocaleString('fr-FR', { minimumFractionDigits: 3, maximumFractionDigits: 3 })} {documentCurrencyCode || data.entity.currencyCode}
                    {invoiceLinesTotal === Math.round(Number(subTotal) * 1000) ? ' · total cohérent' : ' · doit égaler le HT facture'}
                  </span>}
                </div>
              </fieldset>
              <fieldset style={{ border: '1px solid #E2E8F0', borderRadius: '8px', padding: '12px', display: 'grid', gap: '10px' }}>
                <legend style={{ padding: '0 6px', color: '#475569', fontWeight: 700 }}>Devise de facture et conversion</legend>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '10px' }}>
                  <label style={{ display: 'grid', gap: '4px' }}>Devise de facture
                    <input required maxLength={3} pattern="[A-Za-z]{3}" value={documentCurrencyCode}
                      onChange={(event) => {
                        const value = event.target.value.toUpperCase();
                        setDocumentCurrencyCode(value);
                        setExchangeRate(value === data.entity.currencyCode ? '1' : '');
                        setExchangeRateDate(issueDate);
                        setExchangeRateSource(value === data.entity.currencyCode ? 'Même devise fonctionnelle; aucune conversion.' : '');
                        setExchangeRateImportedAt('');
                        setFxSuggestionMessage('');
                      }} style={fieldStyle} />
                  </label>
                  <label style={{ display: 'grid', gap: '4px' }}>Taux vers {data.entity.currencyCode} (1 unité facture)
                    <input required={documentCurrencyCode !== data.entity.currencyCode} disabled={documentCurrencyCode === data.entity.currencyCode}
                      type="number" min="0.0000000001" step="any"
                      value={documentCurrencyCode === data.entity.currencyCode ? '1' : exchangeRate}
                      onChange={(event) => { setExchangeRate(event.target.value); setExchangeRateImportedAt(''); }}
                      style={fieldStyle} />
                  </label>
                  <label style={{ display: 'grid', gap: '4px' }}>Date effective du taux
                    <input required={documentCurrencyCode !== data.entity.currencyCode} disabled={documentCurrencyCode === data.entity.currencyCode}
                      type="date" max={issueDate} value={exchangeRateDate}
                      onChange={(event) => { setExchangeRateDate(event.target.value); setExchangeRateImportedAt(''); }}
                      style={fieldStyle} />
                  </label>
                </div>
                {documentCurrencyCode !== data.entity.currencyCode && (
                  <>
                    <label style={{ display: 'grid', gap: '4px' }}>Source vérifiable du taux
                      <input required maxLength={500} value={exchangeRateSource}
                        onChange={(event) => { setExchangeRateSource(event.target.value); setExchangeRateImportedAt(''); }}
                        style={fieldStyle} />
                    </label>
                    <button type="button" onClick={() => void loadBctSuggestion()} disabled={loading || saving}
                      style={{ justifySelf: 'start', ...fieldStyle, background: '#FFFFFF', color: '#334155', fontWeight: 700 }}>
                      Utiliser le cours BCT importé à cette date
                    </button>
                  </>
                )}
                {fxSuggestionMessage && <p role="status" style={{ margin: 0, color: '#475569' }}>{fxSuggestionMessage}</p>}
                <p style={{ margin: 0, color: '#64748B', fontSize: '0.78rem' }}>
                  Le taux, sa date et sa source seront figés. Les règlements et la réévaluation de clôture sont gérés par le module FX, sous réserve de comptes configurés.
                </p>
              </fieldset>
              {selectedRate && <p style={{ margin: 0, color: '#475569' }}>
                TVA calculée à {selectedRate.rate}% : {preview ? amount(preview.tax, documentCurrencyCode || data.entity.currencyCode) : 'montant invalide'} · Total document : {preview ? amount(preview.total, documentCurrencyCode || data.entity.currencyCode) : 'indisponible'} · Total fonctionnel : {preview && (documentCurrencyCode === data.entity.currencyCode || functionalPreview !== null) ? amount(functionalPreview ?? preview.total, data.entity.currencyCode) : 'taux requis'}.
              </p>}
              <div>
                <button type="submit" disabled={saving || loading || data.vendors.length === 0 || data.taxRates.length === 0}
                  style={{ background: '#2563EB', color: '#FFFFFF', border: 0, borderRadius: '6px', padding: '9px 18px', fontWeight: 700 }}>
                  {saving ? 'Enregistrement…' : 'Valider & Comptabiliser'}
                </button>
              </div>
            </form>

            {/* Right: Widgets Écriture d'achat + Contrôle Budget + Impact Trésorerie */}
            <div style={{ display: 'grid', gap: 14 }}>
              {/* ÉCRITURE D'ACHAT GÉNÉRÉE (journal AC) */}
              <div style={{ background: '#FFFFFF', borderRadius: 12, border: '1px solid #E2E8F0', padding: 16, boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                  <h4 style={{ margin: 0, fontSize: '0.85rem', fontWeight: 800, color: '#0F172A', textTransform: 'uppercase' }}>
                    ÉCRITURE D'ACHAT GÉNÉRÉE
                  </h4>
                  <span style={{ fontSize: '0.74rem', color: '#64748B', fontWeight: 700 }}>Journal : AC (Achats)</span>
                </div>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
                  <thead>
                    <tr style={{ background: '#F8FAFC', color: '#475569', borderBottom: '1px solid #E2E8F0' }}>
                      <th style={{ padding: '6px 8px', textAlign: 'left' }}>Poste</th>
                      <th style={{ padding: '6px 8px', textAlign: 'left' }}>Compte</th>
                      <th style={{ padding: '6px 8px', textAlign: 'right' }}>Montant</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr style={{ borderBottom: '1px solid #F1F5F9' }}>
                      <td style={{ padding: '6px 8px', fontWeight: 700, color: '#2563EB' }}>Débit</td>
                      <td style={{ padding: '6px 8px' }}>601000 (Matières premières)</td>
                      <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 700 }}>
                        {subTotal ? Number(subTotal).toFixed(3) : '8 500.000'}
                      </td>
                    </tr>
                    <tr style={{ borderBottom: '1px solid #F1F5F9' }}>
                      <td style={{ padding: '6px 8px', fontWeight: 700, color: '#2563EB' }}>Débit</td>
                      <td style={{ padding: '6px 8px' }}>436610 (TVA Déductible)</td>
                      <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 700 }}>
                        {preview ? preview.tax.toFixed(3) : '1 615.000'}
                      </td>
                    </tr>
                    <tr style={{ borderBottom: '1px solid #F1F5F9' }}>
                      <td style={{ padding: '6px 8px', fontWeight: 700, color: '#16A34A' }}>Crédit</td>
                      <td style={{ padding: '6px 8px' }}>401100 (Fournisseurs)</td>
                      <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 700 }}>
                        {preview ? preview.total.toFixed(3) : '10 115.000'}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* CONTRÔLE BUDGET ENGAGÉ */}
              <div style={{ background: '#FFFFFF', borderRadius: 12, border: '1px solid #E2E8F0', padding: 16, boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
                <h4 style={{ margin: '0 0 8px', fontSize: '0.85rem', fontWeight: 800, color: '#0F172A', textTransform: 'uppercase' }}>
                  CONTRÔLE BUDGET ENGAGÉ
                </h4>
                <div style={{ fontSize: '0.78rem', color: '#475569', display: 'grid', gap: 4 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>Budget consommé :</span>
                    <strong>380 000 TND</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: '#16A34A', fontWeight: 700 }}>
                    <span>Taux d'engagement :</span>
                    <span>59.20%</span>
                  </div>
                  <div style={{ height: 6, background: '#E2E8F0', borderRadius: 99, overflow: 'hidden', marginTop: 4 }}>
                    <div style={{ width: '59.2%', height: '100%', background: '#16A34A', borderRadius: 99 }} />
                  </div>
                </div>
              </div>

              {/* IMPACT TRÉSORERIE */}
              <div style={{ background: '#FFFFFF', borderRadius: 12, border: '1px solid #E2E8F0', padding: 16, boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
                <h4 style={{ margin: '0 0 8px', fontSize: '0.85rem', fontWeight: 800, color: '#0F172A', textTransform: 'uppercase' }}>
                  IMPACT TRÉSORERIE PRÉVISIONNEL
                </h4>
                <div style={{ fontSize: '0.78rem', color: '#475569', display: 'grid', gap: 4 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>Échéance prévue :</span>
                    <strong>{dueDate || '19/12/2026'}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: '#DC2626', fontWeight: 700 }}>
                    <span>Décaissement prévu :</span>
                    <span>-{preview ? preview.total.toFixed(3) : '10 115.000'} TND</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <AiInvoiceAnalysisPanel accessToken={accessToken} />

          <div style={{ ...cardStyle, overflowX: 'auto' }}>
            <h3 style={{ marginTop: 0 }}>Factures persistées — contrôle et comptabilisation</h3>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
              <button type="button" disabled={!purchaseExportMeta} onClick={() => purchaseExportMeta && exportToExcel('Factures_fournisseurs', purchaseExportColumns, purchaseExportRows, purchaseExportMeta)}>Excel .xlsx</button>
              <button type="button" disabled={!purchaseExportMeta} onClick={() => purchaseExportMeta && exportToCSV('Factures_fournisseurs', purchaseExportColumns, purchaseExportRows, purchaseExportMeta)}>CSV</button>
              <button type="button" disabled={!purchaseExportMeta} onClick={() => purchaseExportMeta && exportToPDF('Factures fournisseurs', purchaseExportColumns, purchaseExportRows, purchaseExportMeta)}>PDF / imprimer</button>
              <button type="button" disabled={!purchaseExportMeta} onClick={() => purchaseExportMeta && exportToPowerPoint('Factures_fournisseurs', purchaseExportColumns, purchaseExportRows, purchaseExportMeta)}>PowerPoint</button>
            </div>
            {data.invoices.length === 0 ? <p>Aucune facture fournisseur enregistrée pour cette société.</p> : (
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.82rem' }}>
                <thead><tr style={{ background: '#F8FAFC', color: '#475569' }}>
                  <th style={{ padding: '8px' }}>N° facture</th>
                  <th style={{ padding: '8px' }}>Fournisseur</th>
                  <th style={{ padding: '8px' }}>Date</th>
                  <th style={{ padding: '8px' }}>Échéance</th>
                  <th style={{ padding: '8px', textAlign: 'right' }}>HT document / fonctionnel</th>
                  <th style={{ padding: '8px' }}>Lignes facture</th>
                  <th style={{ padding: '8px' }}>Taux configuré</th>
                  <th style={{ padding: '8px' }}>Conversion</th>
                  <th style={{ padding: '8px', textAlign: 'right' }}>TVA document / fonctionnel</th>
                  <th style={{ padding: '8px', textAlign: 'right' }}>TTC document / fonctionnel</th>
                  <th style={{ padding: '8px' }}>Statut</th>
                  <th style={{ padding: '8px' }}>Traçabilité / actions</th>
                </tr></thead>
                <tbody>{data.invoices.map((invoice) => (
                  <tr key={invoice.id} style={{ borderTop: '1px solid #E2E8F0' }}>
                    <td style={{ padding: '8px', fontWeight: 700 }}>{invoice.invoiceNumber}</td>
                    <td style={{ padding: '8px' }}>{invoice.vendor.code} — {invoice.vendor.name}</td>
                    <td style={{ padding: '8px' }}>{invoice.issueDate.slice(0, 10)}</td>
                    <td style={{ padding: '8px' }}>{invoice.dueDate.slice(0, 10)}</td>
                    <td style={{ padding: '8px', textAlign: 'right' }}>
                      {amount(invoice.documentSubTotal ?? invoice.subTotal, invoice.documentCurrencyCode ?? invoice.currencyCode)}
                      <small style={{ display: 'block', color: '#64748B' }}>{amount(invoice.subTotal, invoice.functionalCurrencyCode ?? invoice.currencyCode)}</small>
                    </td>
                    <td style={{ padding: '8px', minWidth: 180 }}>
                      {invoice.lines.length === 0 ? 'Détail non fourni' : (
                        <details>
                          <summary>{invoice.lines.length} ligne{invoice.lines.length > 1 ? 's' : ''}</summary>
                          {invoice.lines.map((line) => {
                            const material = line.materialId ? data.materials.find((item) => item.id === line.materialId) : null;
                            return <small key={line.id} style={{ display: 'block', marginTop: 4 }}>
                              {line.description} · {line.quantity} × {amount(line.unitPrice, invoice.documentCurrencyCode ?? invoice.currencyCode)}
                              {material ? ` · ${material.sku}` : ' · hors stock'}
                            </small>;
                          })}
                        </details>
                      )}
                    </td>
                    <td style={{ padding: '8px' }}>{invoice.taxRateCode} ({invoice.taxRate}%)</td>
                    <td style={{ padding: '8px', maxWidth: '260px' }}>
                      {invoice.exchangeRate !== null && invoice.exchangeRate !== 1 ? (
                        <details>
                          <summary>1 {invoice.documentCurrencyCode} = {invoice.exchangeRate} {invoice.functionalCurrencyCode} · {invoice.exchangeRateDate?.slice(0, 10)}</summary>
                          <span>{invoice.exchangeRateSource}</span>
                          {invoice.exchangeRateImportedAt && <small style={{ display: 'block' }}>Importé le {new Date(invoice.exchangeRateImportedAt).toLocaleString('fr-FR')}</small>}
                        </details>
                      ) : 'Même devise'}
                    </td>
                    <td style={{ padding: '8px', textAlign: 'right' }}>
                      {amount(invoice.documentTaxAmount ?? invoice.taxAmount, invoice.documentCurrencyCode ?? invoice.currencyCode)}
                      <small style={{ display: 'block', color: '#64748B' }}>{amount(invoice.taxAmount, invoice.functionalCurrencyCode ?? invoice.currencyCode)}</small>
                    </td>
                    <td style={{ padding: '8px', textAlign: 'right', fontWeight: 700 }}>
                      {amount(invoice.documentTotalAmount ?? invoice.totalAmount, invoice.documentCurrencyCode ?? invoice.currencyCode)}
                      <small style={{ display: 'block', color: '#64748B' }}>{amount(invoice.totalAmount, invoice.functionalCurrencyCode ?? invoice.currencyCode)}</small>
                    </td>
                    <td style={{ padding: '8px' }}>
                      {invoice.status === 'TO_REVIEW' ? 'À contrôler' : invoice.status === 'APPROVED' ? 'Validée — à comptabiliser' : invoice.status === 'REJECTED' ? 'Rejetée' : invoice.status === 'POSTED' ? 'Comptabilisée' : invoice.status === 'CANCELLATION_PENDING' ? 'Contrepassation en attente' : invoice.status === 'CANCELLED' ? 'Annulée par contrepassation' : invoice.status}
                    </td>
                    <td style={{ padding: '8px', minWidth: '260px' }}>
                      <small style={{ display: 'block', color: '#475569' }}>Créée par {invoice.createdByUsername ?? 'auteur non enregistré'}</small>
                      {invoice.workflowEvents.map((event, index) => (
                        <details key={`${event.action}-${index}`} style={{ marginTop: '4px' }}>
                          <summary>{event.action} par {event.actorUsername} · {new Date(event.createdAt).toLocaleString('fr-FR')}</summary>
                          <span>{event.note}</span>
                        </details>
                      ))}
                      {invoice.postingJournalEntry && (
                        <small style={{ display: 'block', marginTop: '4px' }}>
                          Journal {invoice.postingJournalEntry.entryNumber} · {invoice.postingJournalEntry.date.slice(0, 10)} · {invoice.postedByUsername}
                        </small>
                      )}
                      {invoice.status === 'TO_REVIEW' && (
                        <>
                          <textarea
                            aria-label={`Note de contrôle ${invoice.invoiceNumber}`}
                            value={workflowNotes[invoice.id] ?? ''}
                            onChange={(event) => setWorkflowNotes((previous) => ({ ...previous, [invoice.id]: event.target.value }))}
                            placeholder="Note obligatoire (5–500 caractères)"
                            rows={2}
                            style={{ ...fieldStyle, width: '100%', marginTop: '6px' }}
                          />
                          <div style={{ display: 'flex', gap: '6px', marginTop: '4px' }}>
                            <button type="button" disabled={Boolean(workflowBusyId) || (workflowNotes[invoice.id] ?? '').trim().length < 5}
                              onClick={() => void runWorkflowAction(invoice.id, 'approve')} style={fieldStyle}>
                              {workflowBusyId === invoice.id ? 'Traitement…' : 'Valider'}
                            </button>
                            <button type="button" disabled={Boolean(workflowBusyId) || (workflowNotes[invoice.id] ?? '').trim().length < 5}
                              onClick={() => void runWorkflowAction(invoice.id, 'reject')} style={fieldStyle}>
                              Rejeter
                            </button>
                          </div>
                        </>
                      )}
                      {invoice.status === 'APPROVED' && (
                        <>
                          <small style={{ display: 'block', marginTop: '4px' }}>
                            Validée par {invoice.approvedByUsername ?? 'inconnu'} · {invoice.approvedAt?.slice(0, 10)}
                          </small>
                          <textarea
                            aria-label={`Note de comptabilisation ${invoice.invoiceNumber}`}
                            value={workflowNotes[invoice.id] ?? ''}
                            onChange={(event) => setWorkflowNotes((previous) => ({ ...previous, [invoice.id]: event.target.value }))}
                            placeholder="Note obligatoire (5–500 caractères)"
                            rows={2}
                            style={{ ...fieldStyle, width: '100%', marginTop: '6px' }}
                          />
                          <button type="button" disabled={Boolean(workflowBusyId) || (workflowNotes[invoice.id] ?? '').trim().length < 5}
                            onClick={() => void runWorkflowAction(invoice.id, 'post')} style={{ ...fieldStyle, marginTop: '4px' }}>
                            {workflowBusyId === invoice.id ? 'Traitement…' : 'Comptabiliser'}
                          </button>
                        </>
                      )}
                      {invoice.status === 'POSTED' && (
                        <>
                          <label style={{ display: 'block', marginTop: '6px' }}>
                            Date de contrepassation (mois civil suivant)
                            <input
                              type="date"
                              aria-label={`Date de contrepassation ${invoice.invoiceNumber}`}
                              value={cancellationDates[invoice.id] ?? getNextMonthStart(invoice.issueDate)}
                              onChange={(event) => setCancellationDates((previous) => ({ ...previous, [invoice.id]: event.target.value }))}
                              style={{ ...fieldStyle, width: '100%', marginTop: '4px' }}
                            />
                          </label>
                          <textarea
                            aria-label={`Note d’annulation ${invoice.invoiceNumber}`}
                            value={workflowNotes[invoice.id] ?? ''}
                            onChange={(event) => setWorkflowNotes((previous) => ({ ...previous, [invoice.id]: event.target.value }))}
                            placeholder="Note obligatoire (5–500 caractères)"
                            rows={2}
                            style={{ ...fieldStyle, width: '100%', marginTop: '6px' }}
                          />
                          <button type="button" disabled={Boolean(workflowBusyId) || (workflowNotes[invoice.id] ?? '').trim().length < 5}
                            onClick={() => void runWorkflowAction(invoice.id, 'cancel')} style={{ ...fieldStyle, marginTop: '4px' }}>
                            {workflowBusyId === invoice.id ? 'Traitement…' : 'Demander l’annulation par contrepassation'}
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}</tbody>
              </table>
            )}
          </div>
          <section style={{ ...cardStyle, overflowX: 'auto' }}>
            <h3 style={{ marginTop: 0 }}>Avoirs fournisseurs issus des retours</h3>
            <p style={{ color: '#64748B', fontSize: '0.84rem' }}>
              Un brouillon est généré seulement si le retour est lié à une ligne de facture. Les montants ne sont affectés qu’après saisie du document réel, contrôle indépendant et comptabilisation; tout excédent reste un crédit fournisseur non affecté, sans remboursement bancaire automatique.
            </p>
            {supplierCreditNotes.length === 0 ? <p>Aucun retour lié à une facture ne nécessite d’avoir.</p> : (
              <table style={{ width: '100%', minWidth: 1050, borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.82rem' }}>
                <thead><tr style={{ background: '#F8FAFC', color: '#475569' }}>
                  <th style={{ padding: 8 }}>Fournisseur / document</th>
                  <th style={{ padding: 8 }}>Retour / facture source</th>
                  <th style={{ padding: 8 }}>Montants attendus</th>
                  <th style={{ padding: 8 }}>Statut</th>
                  <th style={{ padding: 8 }}>Traçabilité / actions</th>
                </tr></thead>
                <tbody>{supplierCreditNotes.map((creditNote) => {
                  const form = getCreditDocumentForm(creditNote);
                  return (
                    <tr key={creditNote.id} style={{ borderTop: '1px solid #E2E8F0', verticalAlign: 'top' }}>
                      <td style={{ padding: 8 }}>
                        <strong>{creditNote.vendor.code} — {creditNote.vendor.name}</strong>
                        <br />Avoir fournisseur : {creditNote.supplierDocumentNumber ?? 'référence à saisir'}
                        {creditNote.creditDate && <><br />Date : {creditNote.creditDate.slice(0, 10)}</>}
                      </td>
                      <td style={{ padding: 8 }}>
                        {creditNote.sourceInvoice.invoiceNumber} · {creditNote.sourceInvoice.status}
                        <br />{creditNote.sourceInvoiceLine.description}
                        <br />Retour de {creditNote.sourceReturn.quantity} / {creditNote.sourceInvoiceLine.quantity}
                        <br />{creditNote.sourceReturn.reason}
                      </td>
                      <td style={{ padding: 8, textAlign: 'right' }}>
                        HT {amount(creditNote.documentSubTotal, creditNote.currencyCode)}
                        <br />TVA {amount(creditNote.documentTaxAmount, creditNote.currencyCode)}
                        <br /><strong>TTC {amount(creditNote.documentTotalAmount, creditNote.currencyCode)}</strong>
                        <small style={{ display: 'block', color: '#64748B' }}>
                          Fonctionnel : {amount(creditNote.totalAmount, creditNote.functionalCurrencyCode)}
                        </small>
                        {creditNote.status === 'POSTED' && (
                          <small style={{ display: 'block', color: '#0369A1' }}>
                            Solde non affecté : {amount(creditNote.unappliedDocumentAmount, creditNote.currencyCode)}
                          </small>
                        )}
                      </td>
                      <td style={{ padding: 8 }}>
                        {creditNote.status === 'AWAITING_SUPPLIER_DOCUMENT' ? 'Document fournisseur à saisir'
                          : creditNote.status === 'TO_REVIEW' ? 'À contrôler'
                            : creditNote.status === 'APPROVED' ? 'Approuvé — à comptabiliser'
                              : creditNote.status === 'POSTED' ? 'Comptabilisé' : creditNote.status}
                        {creditNote.approvedByUsername && <><br />Approuvé par {creditNote.approvedByUsername}</>}
                        {creditNote.postedByUsername && <><br />Comptabilisé par {creditNote.postedByUsername}</>}
                      </td>
                      <td style={{ padding: 8, minWidth: 310 }}>
                        {creditNote.applications.map((application) => (
                          <details key={application.id} style={{ marginBottom: 6 }}>
                            <summary>Affecté à {application.targetPurchaseInvoice.invoiceNumber} · {amount(application.documentAmount, creditNote.currencyCode)}</summary>
                            <div>{application.note}<br />Par {application.createdByUsername} · {new Date(application.createdAt).toLocaleString('fr-FR')}</div>
                          </details>
                        ))}
                        {creditNote.status === 'POSTED' && creditNote.unappliedDocumentAmount > 0 && (
                          creditApplicationTargets(creditNote).length > 0 ? (() => {
                            const applicationForm = getCreditApplicationForm(creditNote);
                            return (
                              <div style={{ display: 'grid', gap: 6, marginBottom: 10 }}>
                                <label>Facture du même fournisseur à solder
                                  <select required value={applicationForm.targetPurchaseInvoiceId}
                                    onChange={(event) => setCreditApplicationForms((current) => ({
                                      ...current,
                                      [creditNote.id]: { ...applicationForm, targetPurchaseInvoiceId: event.target.value },
                                    }))} style={{ ...fieldStyle, width: '100%' }}>
                                    <option value="">Sélectionner une facture compatible</option>
                                    {creditApplicationTargets(creditNote).map((invoice) => (
                                      <option key={invoice.id} value={invoice.id}>
                                        {invoice.invoiceNumber} · {amount(invoice.documentTotalAmount ?? invoice.totalAmount, invoice.documentCurrencyCode ?? invoice.currencyCode)}
                                      </option>
                                    ))}
                                  </select>
                                </label>
                                <label>Montant à affecter
                                  <input required type="number" min="0.001" max={creditNote.unappliedDocumentAmount} step="0.001"
                                    value={applicationForm.documentAmount}
                                    onChange={(event) => setCreditApplicationForms((current) => ({
                                      ...current,
                                      [creditNote.id]: { ...applicationForm, documentAmount: event.target.value },
                                    }))} style={{ ...fieldStyle, width: '100%' }} />
                                </label>
                                <textarea required minLength={5} maxLength={500} value={applicationForm.note}
                                  onChange={(event) => setCreditApplicationForms((current) => ({
                                    ...current,
                                    [creditNote.id]: { ...applicationForm, note: event.target.value },
                                  }))}
                                  placeholder="Motif de l’affectation (5 à 500 caractères)" style={fieldStyle} />
                                <button type="button" disabled={workflowBusyId === creditNote.id || applicationForm.note.trim().length < 5}
                                  onClick={() => void applySupplierCredit(creditNote)}>
                                  {workflowBusyId === creditNote.id ? 'Affectation…' : 'Affecter le solde'}
                                </button>
                              </div>
                            );
                          })() : <p>Aucune facture ouverte compatible (même fournisseur, devise et taux figé).</p>
                        )}
                        {creditNote.status === 'AWAITING_SUPPLIER_DOCUMENT' && (
                          <div style={{ display: 'grid', gap: 6 }}>
                            <label>Référence réelle de l’avoir fournisseur
                              <input required maxLength={100} value={form.supplierDocumentNumber}
                                onChange={(event) => setCreditDocumentForms((current) => ({
                                  ...current,
                                  [creditNote.id]: { ...form, supplierDocumentNumber: event.target.value },
                                }))} style={{ ...fieldStyle, width: '100%' }} />
                            </label>
                            <label>Date du document fournisseur
                              <input required type="date" value={form.creditDate}
                                onChange={(event) => setCreditDocumentForms((current) => ({
                                  ...current,
                                  [creditNote.id]: { ...form, creditDate: event.target.value },
                                }))} style={{ ...fieldStyle, width: '100%' }} />
                            </label>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 4 }}>
                              {([
                                ['documentSubTotal', 'HT'],
                                ['documentTaxAmount', 'TVA'],
                                ['documentTotalAmount', 'TTC'],
                              ] as const).map(([field, label]) => (
                                <label key={field}>{label}
                                  <input required type="number" min="0" step="0.001" value={form[field]}
                                    onChange={(event) => setCreditDocumentForms((current) => ({
                                      ...current,
                                      [creditNote.id]: { ...form, [field]: event.target.value },
                                    }))} style={{ ...fieldStyle, width: '100%' }} />
                                </label>
                              ))}
                            </div>
                            <textarea required minLength={5} maxLength={500} value={form.note}
                              onChange={(event) => setCreditDocumentForms((current) => ({
                                ...current,
                                [creditNote.id]: { ...form, note: event.target.value },
                              }))}
                              placeholder="Vérification du document fournisseur" style={fieldStyle} />
                            <button type="button" disabled={workflowBusyId === creditNote.id || form.note.trim().length < 5}
                              onClick={() => void submitSupplierCreditDocument(creditNote)}>
                              {workflowBusyId === creditNote.id ? 'Enregistrement…' : 'Enregistrer et soumettre au contrôle'}
                            </button>
                          </div>
                        )}
                        {creditNote.status === 'TO_REVIEW' && (
                          userId === creditNote.createdByUserId ? 'Un autre contrôleur est requis.' : (
                            <div style={{ display: 'grid', gap: 6 }}>
                              <textarea required minLength={5} maxLength={500} value={workflowNotes[creditNote.id] ?? ''}
                                onChange={(event) => setWorkflowNotes((current) => ({ ...current, [creditNote.id]: event.target.value }))}
                                placeholder="Note de contrôle (5 à 500 caractères)" style={fieldStyle} />
                              <button type="button" disabled={workflowBusyId === creditNote.id || (workflowNotes[creditNote.id] ?? '').trim().length < 5}
                                onClick={() => void runSupplierCreditAction(creditNote.id, 'approve')}>Approuver l’avoir</button>
                            </div>
                          )
                        )}
                        {creditNote.status === 'APPROVED' && (
                          creditNote.createdByUserId === userId || creditNote.approvedByUserId === userId
                            ? 'Une troisième personne doit comptabiliser cet avoir.'
                            : <div style={{ display: 'grid', gap: 6 }}>
                              <textarea required minLength={5} maxLength={500} value={workflowNotes[creditNote.id] ?? ''}
                                onChange={(event) => setWorkflowNotes((current) => ({ ...current, [creditNote.id]: event.target.value }))}
                                placeholder="Note de comptabilisation (5 à 500 caractères)" style={fieldStyle} />
                              <button type="button" disabled={workflowBusyId === creditNote.id || (workflowNotes[creditNote.id] ?? '').trim().length < 5}
                                onClick={() => void runSupplierCreditAction(creditNote.id, 'post')}>Comptabiliser</button>
                            </div>
                        )}
                        {creditNote.workflowEvents.map((event, index) => (
                          <details key={`${event.action}-${index}`} style={{ marginTop: 5 }}>
                            <summary>{event.action} par {event.actorUsername} · {new Date(event.createdAt).toLocaleString('fr-FR')}</summary>
                            {event.note}
                          </details>
                        ))}
                      </td>
                    </tr>
                  );
                })}</tbody>
              </table>
            )}
          </section>
        </>
      )}
    </section>
  );
}
