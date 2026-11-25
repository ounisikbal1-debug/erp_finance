import React, { useEffect, useMemo, useState } from 'react';
import { filterMaterialsByStockSearch } from './stockBarcodeSearch';
import { exportToCSV, exportToExcel, exportToPDF, exportToPowerPoint } from './exportUtils';
import ImportPreviewPanel from './ImportPreviewPanel';
import { validateMaterialImportRow } from './material-import-validation';
import { calculateReceiptInvoiceBalances } from './stock-receipt-reconciliation';
import { getHtmlLanguage, translateBusinessText, useInterfaceLanguage } from './localization';

interface StockMaterial {
  id: string;
  entityId: string;
  sku: string;
  barcode: string | null;
  name: string;
  unitCode: string;
  quantity: number;
  minimumStock: number | null;
  unitPrice: number;
  costPrice: number;
}

interface StockWarehouse {
  id: string;
  code: string;
  name: string;
  stocks: Array<{
    id: string;
    materialId: string;
    warehouseId: string;
    quantity: number;
    material: { id: string; sku: string; name: string; unitCode: string };
  }>;
}

interface StockMovement {
  id: string;
  movementType: string;
  deltaQuantity: number;
  reason: string;
  createdByUsername: string;
  createdAt: string;
  material: { sku: string; name: string; unitCode: string };
  warehouse: { code: string; name: string } | null;
}

interface StockPurchaseInvoice {
  id: string;
  invoiceNumber: string;
  status: string;
  subTotal: number;
  currencyCode: string;
  exchangeRate: number | null;
  vendor: { code: string; name: string };
  lines: Array<{
    id: string;
    description: string;
    materialId: string | null;
    purchaseOrderLineId: string | null;
    quantity: number;
    unitPrice: number;
    receiptMatches: Array<{ receipt: { quantity: number; unitCost: number } }>;
  }>;
}

interface ReceivablePurchaseOrderLine {
  id: string;
  description: string;
  materialId: string;
  quantity: number;
  unitPrice: number;
  receivedQuantity: number;
  remainingQuantity: number;
  material: { id: string; sku: string; name: string; unitCode: string };
  order: {
    id: string;
    orderNumber: string;
    currencyCode: string;
    vendor: { code: string; name: string };
  };
}

interface StockReceiptRecord {
  id: string;
  quantity: number;
  returnedQuantity: number;
  unitCost: number;
  reason: string;
  createdAt: string;
  material: { id: string; sku: string; name: string; unitCode: string };
  warehouse: { id: string; code: string; name: string };
  purchaseInvoice: { id: string; invoiceNumber: string; status: string } | null;
  invoiceLineMatch: { line: { id: string; description: string } } | null;
}

interface StockSupplierReturnRecord {
  id: string;
  quantity: number;
  unitCost: number;
  reason: string;
  createdAt: string;
  material: { id: string; sku: string; name: string; unitCode: string };
  warehouse: { id: string; code: string; name: string };
  sourceReceipt: {
    id: string;
    reason: string;
    purchaseInvoice: { invoiceNumber: string } | null;
  };
}

interface StockPickRecord {
  id: string;
  entityId: string;
  reference: string;
  reason: string;
  status: string;
  createdAt: string;
  lines: Array<{
    id: string;
    materialId: string;
    warehouseId: string;
    quantity: number;
    material: { id: string; sku: string; name: string; unitCode: string };
    warehouse: { id: string; code: string; name: string };
  }>;
  dispatch: {
    id: string;
    idempotencyKey: string;
    confirmedAt: string;
    confirmedByUsername: string;
  } | null;
}

interface StockAccount {
  code: string;
  description: string;
  classNumber: number;
  type: string;
  parentCode: string | null;
  isPostingAllowed: boolean;
}

interface StockData {
  entity: {
    name: string;
    countryCode: string;
    currencyCode: string;
    stockAccounting: {
      stockAssetAccountCode: string | null;
      stockAdjustmentAccountCode: string | null;
      productionWipAccountCode: string | null;
      accounts: StockAccount[];
    };
  };
  materials: StockMaterial[];
}

function isValidStockQuantity(value: unknown, unitCode?: string, allowZero = false): value is number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0
    || value > 2_147_483_647 || (!allowZero && value === 0)) return false;
  const milliUnits = Math.round(value * 1000);
  return Math.abs(value * 1000 - milliUnits) <= 1e-7
    && (!unitCode || !['EA', 'BOX', 'PACK'].includes(unitCode.toUpperCase()) || milliUnits % 1000 === 0);
}

function isStockMaterial(value: unknown): value is StockMaterial {
  if (!value || typeof value !== 'object') return false;
  const material = value as Record<string, unknown>;
  return typeof material.id === 'string'
    && typeof material.entityId === 'string'
    && typeof material.sku === 'string'
    && (material.barcode === null || typeof material.barcode === 'string')
    && typeof material.name === 'string'
    && typeof material.unitCode === 'string'
    && isValidStockQuantity(material.quantity, material.unitCode, true)
    && (material.minimumStock === null
      || isValidStockQuantity(material.minimumStock, material.unitCode, true))
    && typeof material.unitPrice === 'number'
    && Number.isFinite(material.unitPrice)
    && material.unitPrice >= 0
    && typeof material.costPrice === 'number'
    && Number.isFinite(material.costPrice)
    && material.costPrice >= 0;
}

function isStockReceiptResponse(value: unknown): value is { material: StockMaterial } {
  return Boolean(value && typeof value === 'object'
    && 'material' in value
    && isStockMaterial(value.material));
}

function isPurchaseInvoice(value: unknown): value is StockPurchaseInvoice {
  return Boolean(value && typeof value === 'object'
    && 'id' in value && typeof value.id === 'string'
    && 'invoiceNumber' in value && typeof value.invoiceNumber === 'string'
    && 'status' in value && typeof value.status === 'string'
    && 'subTotal' in value && typeof value.subTotal === 'number' && Number.isFinite(value.subTotal)
    && 'currencyCode' in value && typeof value.currencyCode === 'string'
    && 'exchangeRate' in value && (value.exchangeRate === null
      || (typeof value.exchangeRate === 'number' && Number.isFinite(value.exchangeRate) && value.exchangeRate > 0))
    && 'vendor' in value && value.vendor && typeof value.vendor === 'object'
    && 'code' in value.vendor && typeof value.vendor.code === 'string'
    && 'name' in value.vendor && typeof value.vendor.name === 'string'
    && 'lines' in value && Array.isArray(value.lines) && value.lines.every((line) => line && typeof line === 'object'
      && typeof line.id === 'string' && typeof line.description === 'string'
      && (line.materialId === null || typeof line.materialId === 'string')
      && (line.purchaseOrderLineId === null || typeof line.purchaseOrderLineId === 'string')
      && isValidStockQuantity(line.quantity, undefined)
      && typeof line.unitPrice === 'number' && Number.isFinite(line.unitPrice) && line.unitPrice > 0
      && Array.isArray(line.receiptMatches) && line.receiptMatches.every((match) => match && typeof match === 'object'
        && 'receipt' in match && match.receipt && typeof match.receipt === 'object'
        && 'quantity' in match.receipt && isValidStockQuantity(match.receipt.quantity, undefined, true)
        && 'unitCost' in match.receipt && typeof match.receipt.unitCost === 'number' && Number.isFinite(match.receipt.unitCost))));
}

function isReceivablePurchaseOrderLine(value: unknown): value is ReceivablePurchaseOrderLine {
  return Boolean(value && typeof value === 'object'
    && 'id' in value && typeof value.id === 'string'
    && 'description' in value && typeof value.description === 'string'
    && 'materialId' in value && typeof value.materialId === 'string'
    && 'quantity' in value && isValidStockQuantity(value.quantity)
    && 'receivedQuantity' in value && isValidStockQuantity(value.receivedQuantity, undefined, true)
    && 'remainingQuantity' in value && isValidStockQuantity(value.remainingQuantity)
    && 'unitPrice' in value && typeof value.unitPrice === 'number' && Number.isFinite(value.unitPrice) && value.unitPrice >= 0
    && 'material' in value && value.material && typeof value.material === 'object'
    && 'id' in value.material && value.material.id === value.materialId
    && 'sku' in value.material && typeof value.material.sku === 'string'
    && 'name' in value.material && typeof value.material.name === 'string'
    && 'unitCode' in value.material && typeof value.material.unitCode === 'string'
    && 'order' in value && value.order && typeof value.order === 'object'
    && 'id' in value.order && typeof value.order.id === 'string'
    && 'orderNumber' in value.order && typeof value.order.orderNumber === 'string'
    && 'currencyCode' in value.order && typeof value.order.currencyCode === 'string'
    && 'vendor' in value.order && value.order.vendor && typeof value.order.vendor === 'object'
    && 'code' in value.order.vendor && typeof value.order.vendor.code === 'string'
    && 'name' in value.order.vendor && typeof value.order.vendor.name === 'string');
}

function isStockReceipt(value: unknown): value is StockReceiptRecord {
  return Boolean(value && typeof value === 'object'
    && 'id' in value && typeof value.id === 'string'
    && 'quantity' in value && isValidStockQuantity(value.quantity)
    && 'returnedQuantity' in value && typeof value.returnedQuantity === 'number'
      && isValidStockQuantity(value.returnedQuantity, undefined, true)
      && value.returnedQuantity <= value.quantity
    && 'unitCost' in value && typeof value.unitCost === 'number' && Number.isFinite(value.unitCost) && value.unitCost >= 0
    && 'reason' in value && typeof value.reason === 'string'
    && 'createdAt' in value && typeof value.createdAt === 'string'
    && 'material' in value && value.material && typeof value.material === 'object'
    && 'sku' in value.material && typeof value.material.sku === 'string'
    && 'unitCode' in value.material && typeof value.material.unitCode === 'string'
    && 'warehouse' in value && value.warehouse && typeof value.warehouse === 'object'
    && 'code' in value.warehouse && typeof value.warehouse.code === 'string'
    && 'purchaseInvoice' in value
    && (value.purchaseInvoice === null || (
      typeof value.purchaseInvoice === 'object'
    && 'id' in value.purchaseInvoice && typeof value.purchaseInvoice.id === 'string'
    && 'invoiceNumber' in value.purchaseInvoice && typeof value.purchaseInvoice.invoiceNumber === 'string'
    ))
    && 'invoiceLineMatch' in value
    && (value.invoiceLineMatch === null || (
      typeof value.invoiceLineMatch === 'object'
      && 'line' in value.invoiceLineMatch && value.invoiceLineMatch.line && typeof value.invoiceLineMatch.line === 'object'
      && 'id' in value.invoiceLineMatch.line && typeof value.invoiceLineMatch.line.id === 'string'
      && 'description' in value.invoiceLineMatch.line && typeof value.invoiceLineMatch.line.description === 'string'
    )));
}

function isStockSupplierReturn(value: unknown): value is StockSupplierReturnRecord {
  return Boolean(value && typeof value === 'object'
    && 'id' in value && typeof value.id === 'string'
    && 'quantity' in value && isValidStockQuantity(value.quantity)
    && 'unitCost' in value && typeof value.unitCost === 'number' && Number.isFinite(value.unitCost) && value.unitCost >= 0
    && 'reason' in value && typeof value.reason === 'string'
    && 'createdAt' in value && typeof value.createdAt === 'string'
    && 'material' in value && value.material && typeof value.material === 'object'
    && 'sku' in value.material && typeof value.material.sku === 'string'
    && 'unitCode' in value.material && typeof value.material.unitCode === 'string'
    && 'warehouse' in value && value.warehouse && typeof value.warehouse === 'object'
    && 'code' in value.warehouse && typeof value.warehouse.code === 'string'
    && 'sourceReceipt' in value && value.sourceReceipt && typeof value.sourceReceipt === 'object'
    && 'id' in value.sourceReceipt && typeof value.sourceReceipt.id === 'string'
    && 'reason' in value.sourceReceipt && typeof value.sourceReceipt.reason === 'string'
    && 'purchaseInvoice' in value.sourceReceipt
    && (value.sourceReceipt.purchaseInvoice === null
      || (typeof value.sourceReceipt.purchaseInvoice === 'object'
        && 'invoiceNumber' in value.sourceReceipt.purchaseInvoice
        && typeof value.sourceReceipt.purchaseInvoice.invoiceNumber === 'string')));
}

function isStockDispatch(value: unknown): value is NonNullable<StockPickRecord['dispatch']> {
  return Boolean(value && typeof value === 'object'
    && 'id' in value && typeof value.id === 'string'
    && 'idempotencyKey' in value && typeof value.idempotencyKey === 'string'
    && 'confirmedAt' in value && typeof value.confirmedAt === 'string' && Number.isFinite(Date.parse(value.confirmedAt))
    && 'confirmedByUsername' in value && typeof value.confirmedByUsername === 'string');
}

function isStockPick(value: unknown): value is StockPickRecord {
  return Boolean(value && typeof value === 'object'
    && 'id' in value && typeof value.id === 'string'
    && 'entityId' in value && typeof value.entityId === 'string'
    && 'reference' in value && typeof value.reference === 'string'
    && 'reason' in value && typeof value.reason === 'string'
    && 'status' in value && typeof value.status === 'string'
    && 'createdAt' in value && typeof value.createdAt === 'string' && Number.isFinite(Date.parse(value.createdAt))
    && 'lines' in value && Array.isArray(value.lines) && value.lines.every((line) => line && typeof line === 'object'
      && typeof line.id === 'string'
      && typeof line.materialId === 'string'
      && typeof line.warehouseId === 'string'
      && isValidStockQuantity(line.quantity)
      && line.material && typeof line.material === 'object'
      && line.material.id === line.materialId
      && typeof line.material.sku === 'string'
      && typeof line.material.name === 'string'
      && typeof line.material.unitCode === 'string'
      && line.warehouse && typeof line.warehouse === 'object'
      && line.warehouse.id === line.warehouseId
      && typeof line.warehouse.code === 'string'
      && typeof line.warehouse.name === 'string')
    && 'dispatch' in value && (value.dispatch === null || isStockDispatch(value.dispatch)));
}

function isStockData(value: unknown): value is StockData {
  if (!value || typeof value !== 'object') return false;
  const data = value as Record<string, unknown>;
  if (!data.entity || typeof data.entity !== 'object' || !Array.isArray(data.materials)) return false;
  const entity = data.entity as Record<string, unknown>;
  if (!entity.stockAccounting || typeof entity.stockAccounting !== 'object') return false;
  const stockAccounting = entity.stockAccounting as Record<string, unknown>;
  if (!Array.isArray(stockAccounting.accounts)
    || !stockAccounting.accounts.every((item) => item && typeof item === 'object'
      && typeof (item as Record<string, unknown>).code === 'string'
      && typeof (item as Record<string, unknown>).description === 'string'
      && typeof (item as Record<string, unknown>).classNumber === 'number'
      && typeof (item as Record<string, unknown>).type === 'string'
      && ((item as Record<string, unknown>).parentCode === null
        || typeof (item as Record<string, unknown>).parentCode === 'string')
      && typeof (item as Record<string, unknown>).isPostingAllowed === 'boolean')) return false;
  return typeof entity.name === 'string'
    && typeof entity.countryCode === 'string'
    && typeof entity.currencyCode === 'string'
    && (stockAccounting.stockAssetAccountCode === null || typeof stockAccounting.stockAssetAccountCode === 'string')
    && (stockAccounting.stockAdjustmentAccountCode === null || typeof stockAccounting.stockAdjustmentAccountCode === 'string')
    && (stockAccounting.productionWipAccountCode === null || typeof stockAccounting.productionWipAccountCode === 'string')
    && data.materials.every(isStockMaterial);
}

function stockAccountPalette(classNumber: number) {
  if (classNumber === 3) {
    return { background: '#F0FDFA', border: '#99F6E4', color: '#115E59', label: 'Actif · classe 3' };
  }
  if (classNumber === 6) {
    return { background: '#FFF7ED', border: '#FDBA74', color: '#9A3412', label: 'Charge · classe 6' };
  }
  return { background: '#F8FAFC', border: '#CBD5E1', color: '#334155', label: `Classe ${classNumber}` };
}

function amount(value: number, currencyCode: string): string {
  return `${value.toLocaleString('fr-FR', { minimumFractionDigits: 3, maximumFractionDigits: 3 })} ${currencyCode}`;
}

function apiError(payload: unknown, fallback: string): string {
  return payload && typeof payload === 'object' && 'error' in payload && typeof payload.error === 'string'
    ? payload.error
    : fallback;
}

export default function StocksPanel({
  accessToken,
  entityId,
}: {
  accessToken: string | null;
  entityId: string | null;
}) {
  const language = useInterfaceLanguage();
  const text = (value: string) => translateBusinessText(language, value);
  const [data, setData] = useState<StockData | null>(null);
  const [sku, setSku] = useState('');
  const [barcode, setBarcode] = useState('');
  const [name, setName] = useState('');
  const [quantity, setQuantity] = useState('');
  const [initialStockReason, setInitialStockReason] = useState('');
  const [unitCode, setUnitCode] = useState('EA');
  const [minimumStock, setMinimumStock] = useState('');
  const [unitPrice, setUnitPrice] = useState('');
  const [costPrice, setCostPrice] = useState('');
  const [adjustmentQuantities, setAdjustmentQuantities] = useState<Record<string, string>>({});
  const [adjustmentReasons, setAdjustmentReasons] = useState<Record<string, string>>({});
  const [minimumStockValues, setMinimumStockValues] = useState<Record<string, string>>({});
  const [searchQuery, setSearchQuery] = useState('');
  const [warehouses, setWarehouses] = useState<StockWarehouse[]>([]);
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [purchaseInvoices, setPurchaseInvoices] = useState<StockPurchaseInvoice[]>([]);
  const [receivablePurchaseOrderLines, setReceivablePurchaseOrderLines] = useState<ReceivablePurchaseOrderLine[]>([]);
  const [stockReceipts, setStockReceipts] = useState<StockReceiptRecord[]>([]);
  const [stockSupplierReturns, setStockSupplierReturns] = useState<StockSupplierReturnRecord[]>([]);
  const [stockPicks, setStockPicks] = useState<StockPickRecord[]>([]);
  const [warehouseCode, setWarehouseCode] = useState('');
  const [warehouseName, setWarehouseName] = useState('');
  const [transferMaterialId, setTransferMaterialId] = useState('');
  const [transferSourceId, setTransferSourceId] = useState('');
  const [transferDestinationId, setTransferDestinationId] = useState('');
  const [transferQuantity, setTransferQuantity] = useState('');
  const [transferReason, setTransferReason] = useState('');
  const [transferKey, setTransferKey] = useState('');
  const [receiptMaterialId, setReceiptMaterialId] = useState('');
  const [receiptPurchaseOrderLineId, setReceiptPurchaseOrderLineId] = useState('');
  const [receiptWarehouseId, setReceiptWarehouseId] = useState('');
  const [receiptPurchaseInvoiceId, setReceiptPurchaseInvoiceId] = useState('');
  const [receiptPurchaseInvoiceLineId, setReceiptPurchaseInvoiceLineId] = useState('');
  const [receiptQuantity, setReceiptQuantity] = useState('');
  const [receiptUnitCost, setReceiptUnitCost] = useState('');
  const [receiptReason, setReceiptReason] = useState('');
  const [receiptKey, setReceiptKey] = useState('');
  const [supplierReturnReceiptId, setSupplierReturnReceiptId] = useState('');
  const [supplierReturnQuantity, setSupplierReturnQuantity] = useState('');
  const [supplierReturnReason, setSupplierReturnReason] = useState('');
  const [supplierReturnKey, setSupplierReturnKey] = useState('');
  const [pickReference, setPickReference] = useState('');
  const [pickReason, setPickReason] = useState('');
  const [pickKey, setPickKey] = useState('');
  const [pickLines, setPickLines] = useState<Array<{ materialId: string; warehouseId: string; quantity: string }>>([
    { materialId: '', warehouseId: '', quantity: '' },
  ]);
  const [dispatchKeys, setDispatchKeys] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [pendingMaterialId, setPendingMaterialId] = useState<string | null>(null);

  const receiptInvoiceBalances = useMemo(
    () => calculateReceiptInvoiceBalances(purchaseInvoices, stockReceipts),
    [purchaseInvoices, stockReceipts],
  );
  const selectedReceiptInvoice = purchaseInvoices.find((invoice) => invoice.id === receiptPurchaseInvoiceId);
  const selectedPurchaseOrderLine = receivablePurchaseOrderLines.find((line) => line.id === receiptPurchaseOrderLineId);
  const selectableReceiptInvoices = purchaseInvoices.filter((invoice) => invoice.status === 'APPROVED'
    && (!selectedPurchaseOrderLine
      || (invoice.vendor.code === selectedPurchaseOrderLine.order.vendor.code
        && (invoice.lines.length === 0 || invoice.lines.some((line) => line.materialId === selectedPurchaseOrderLine.materialId
          && line.purchaseOrderLineId === selectedPurchaseOrderLine.id)))));
  const selectedReturnReceipt = stockReceipts.find((receipt) => receipt.id === supplierReturnReceiptId);
  const selectedReceiptInvoiceLines = (selectedReceiptInvoice?.lines ?? [])
    .filter((line) => line.materialId === receiptMaterialId
      && (!selectedPurchaseOrderLine || line.purchaseOrderLineId === selectedPurchaseOrderLine.id))
    .map((line) => ({
      ...line,
      receivedQuantity: line.receiptMatches.reduce((total, match) => total + match.receipt.quantity, 0),
    }))
    .filter((line) => line.receivedQuantity < line.quantity);
  const selectedReceiptInvoiceLine = selectedReceiptInvoiceLines
    .find((line) => line.id === receiptPurchaseInvoiceLineId);
  const receiptQuantityLimit = Math.min(
    selectedPurchaseOrderLine?.remainingQuantity ?? Number.POSITIVE_INFINITY,
    selectedReceiptInvoiceLine
      ? selectedReceiptInvoiceLine.quantity - selectedReceiptInvoiceLine.receivedQuantity
      : Number.POSITIVE_INFINITY,
  );
  const selectedReceiptInvoiceBalance = selectedReceiptInvoice
    ? receiptInvoiceBalances.get(selectedReceiptInvoice.id) ?? null
    : null;
  const getReceiptInvoiceBalanceLabel = (invoice: StockPurchaseInvoice) => {
    const balance = receiptInvoiceBalances.get(invoice.id);
    return balance
      ? ` · rapproché ${amount(balance.matchedAmount, invoice.currencyCode)} · solde ${amount(balance.remainingAmount, invoice.currencyCode)}`
      : ' · rapprochement à contrôler';
  };

  useEffect(() => {
    const controller = new AbortController();
    setData(null);
    setError('');
    setNotice('');
    if (!accessToken || !entityId) {
      setLoading(false);
      setError(!accessToken
        ? 'Session API indisponible. Reconnectez-vous pour charger les stocks.'
        : 'Aucune société authentifiée n’est associée à cette session.');
      return () => controller.abort();
    }

    const loadData = async () => {
      setLoading(true);
      try {
        const response = await fetch('/api/materials/data', {
          headers: { Authorization: 'Bearer ' + accessToken },
          signal: controller.signal,
        });
        const payload: unknown = await response.json();
        if (!response.ok) throw new Error(apiError(payload, 'Impossible de charger le stock de cette société.'));
        if (!isStockData(payload)
          || payload.materials.some((material) => material.entityId !== entityId)) {
          throw new Error('La réponse du stock est invalide ou ne correspond pas à la société authentifiée.');
        }
        const [warehouseResponse, movementResponse, invoiceResponse, orderLineResponse, receiptResponse, returnResponse, pickResponse] = await Promise.all([
          fetch('/api/materials/warehouses', {
            headers: { Authorization: 'Bearer ' + accessToken },
            signal: controller.signal,
          }),
          fetch('/api/materials/stock-movements', {
            headers: { Authorization: 'Bearer ' + accessToken },
            signal: controller.signal,
          }),
          fetch('/api/materials/purchase-invoices', {
            headers: { Authorization: 'Bearer ' + accessToken },
            signal: controller.signal,
          }),
          fetch('/api/materials/receivable-purchase-order-lines', {
            headers: { Authorization: 'Bearer ' + accessToken },
            signal: controller.signal,
          }),
          fetch('/api/materials/stock-receipts', {
            headers: { Authorization: 'Bearer ' + accessToken },
            signal: controller.signal,
          }),
          fetch('/api/materials/stock-supplier-returns', {
            headers: { Authorization: 'Bearer ' + accessToken },
            signal: controller.signal,
          }),
          fetch('/api/materials/stock-picks', {
            headers: { Authorization: 'Bearer ' + accessToken },
            signal: controller.signal,
          }),
        ]);
        if (!warehouseResponse.ok || !movementResponse.ok || !invoiceResponse.ok || !orderLineResponse.ok
          || !receiptResponse.ok || !returnResponse.ok || !pickResponse.ok) {
          throw new Error('Impossible de charger les dépôts, commandes, factures fournisseur ou historiques de stock.');
        }
        const [warehousePayload, movementPayload, invoicePayload, orderLinePayload, receiptPayload, returnPayload, pickPayload]:
          [unknown, unknown, unknown, unknown, unknown, unknown, unknown] = await Promise.all([
          warehouseResponse.json(),
          movementResponse.json(),
          invoiceResponse.json(),
          orderLineResponse.json(),
          receiptResponse.json(),
          returnResponse.json(),
          pickResponse.json(),
        ]);
        if (!Array.isArray(warehousePayload) || !Array.isArray(movementPayload)
          || !Array.isArray(invoicePayload) || !invoicePayload.every(isPurchaseInvoice)
          || !Array.isArray(orderLinePayload) || !orderLinePayload.every(isReceivablePurchaseOrderLine)
          || !Array.isArray(receiptPayload) || !receiptPayload.every(isStockReceipt)
          || !Array.isArray(returnPayload) || !returnPayload.every(isStockSupplierReturn)
          || !Array.isArray(pickPayload) || !pickPayload.every(isStockPick)
          || pickPayload.some((pick) => pick.entityId !== entityId)) {
          throw new Error('La réponse des dépôts, factures fournisseur, réceptions ou mouvements est invalide.');
        }
        if (!controller.signal.aborted) {
          setData(payload);
          setWarehouses(warehousePayload as StockWarehouse[]);
          setMovements(movementPayload as StockMovement[]);
          setPurchaseInvoices(invoicePayload);
          setReceivablePurchaseOrderLines(orderLinePayload);
          setStockReceipts(receiptPayload);
          setStockSupplierReturns(returnPayload);
          setStockPicks(pickPayload);
          if (payload.materials.length) setTransferMaterialId((current) => current || payload.materials[0].id);
        }
      } catch (requestError) {
        if (!controller.signal.aborted) {
          setError(requestError instanceof Error ? requestError.message : 'Le module Stocks est indisponible.');
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };

    void loadData();
    return () => controller.abort();
  }, [accessToken, entityId]);

  const inventoryValue = useMemo(() => {
    if (!data) return null;
    let totalMillimes = 0;
    for (const material of data.materials) {
      const valueMillimes = Math.round(material.quantity * material.costPrice * 1000);
      if (!Number.isSafeInteger(valueMillimes)
        || !Number.isSafeInteger(totalMillimes + valueMillimes)) return null;
      totalMillimes += valueMillimes;
    }
    return totalMillimes / 1000;
  }, [data]);

  const stockAccounts = useMemo(() => {
    if (!data) return [];
    const { stockAccounting } = data.entity;
    const byCode = new Map(stockAccounting.accounts.map((account) => [account.code, account]));
    const included = new Set<string>();
    const mappings = [
      stockAccounting.stockAssetAccountCode,
      stockAccounting.productionWipAccountCode,
      stockAccounting.stockAdjustmentAccountCode,
    ];
    for (const code of mappings) {
      let account = code ? byCode.get(code) : undefined;
      while (account && !included.has(account.code)) {
        included.add(account.code);
        account = account.parentCode ? byCode.get(account.parentCode) : undefined;
      }
    }
    const depth = (account: StockAccount) => {
      let count = 0;
      let parentCode = account.parentCode;
      while (parentCode) {
        count += 1;
        parentCode = byCode.get(parentCode)?.parentCode ?? null;
      }
      return count;
    };
    return stockAccounting.accounts
      .filter((account) => included.has(account.code))
      .sort((a, b) => a.classNumber - b.classNumber
        || depth(a) - depth(b)
        || a.code.localeCompare(b.code));
  }, [data]);

  const createMaterial = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!accessToken || !entityId || saving) return;
    const normalizedSku = sku.trim();
    const normalizedBarcode = barcode.trim();
    const normalizedName = name.trim();
    const unitPriceValue = Number(unitPrice);
    const quantityValue = quantity.trim() ? Number(quantity) : undefined;
    const costPriceValue = costPrice.trim() ? Number(costPrice) : undefined;
    const minimumStockValue = minimumStock.trim() ? Number(minimumStock) : undefined;
    if (!normalizedSku || !normalizedName || !Number.isFinite(unitPriceValue) || unitPriceValue < 0
      || (quantityValue !== undefined && !isValidStockQuantity(quantityValue, unitCode, true))
      || (quantityValue !== undefined && quantityValue > 0 && initialStockReason.trim().length < 5)
      || (minimumStockValue !== undefined && !isValidStockQuantity(minimumStockValue, unitCode, true))
      || (costPriceValue !== undefined && (!Number.isFinite(costPriceValue) || costPriceValue < 0))) {
      setError('Vérifiez le code, la désignation, les motifs, les quantités adaptées à l’unité, les seuils et les prix saisis.');
      return;
    }

    setSaving(true);
    setError('');
    setNotice('');
    try {
      const response = await fetch('/api/materials/materials', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + accessToken,
        },
        body: JSON.stringify({
          sku: normalizedSku,
          barcode: normalizedBarcode || null,
          name: normalizedName,
          unitCode,
          unitPrice: unitPriceValue,
          entityId,
          ...(quantityValue === undefined ? {} : { quantity: quantityValue }),
          ...(quantityValue === undefined || quantityValue === 0 ? {} : { initialStockReason: initialStockReason.trim() }),
          ...(minimumStockValue === undefined ? {} : { minimumStock: minimumStockValue }),
          ...(costPriceValue === undefined ? {} : { costPrice: costPriceValue }),
        }),
      });
      const payload: unknown = await response.json();
      if (!response.ok) throw new Error(apiError(payload, 'L’article n’a pas pu être enregistré.'));
      if (!isStockMaterial(payload) || payload.entityId !== entityId) {
        throw new Error('La réponse de création d’article est invalide.');
      }
      setSku('');
      setBarcode('');
      setName('');
      setQuantity('');
      setInitialStockReason('');
      setUnitCode('EA');
      setMinimumStock('');
      setUnitPrice('');
      setCostPrice('');
      setData((current) => current && ({ ...current, materials: [payload, ...current.materials] }));
      setNotice(`Article ${payload.sku} enregistré dans le stock de ${data?.entity.name ?? 'la société'}.`);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Erreur lors de l’enregistrement de l’article.');
    } finally {
      setSaving(false);
    }
  };

  const adjustStock = async (material: StockMaterial, direction: 1 | -1) => {
    if (!accessToken || !entityId || pendingMaterialId) return;
    const adjustment = Number(adjustmentQuantities[material.id]);
    if (!isValidStockQuantity(adjustment, material.unitCode)) {
      setError(`La variation doit être positive, limitée à trois décimales et compatible avec l’unité ${material.unitCode}.`);
      return;
    }
    if (adjustmentReasons[material.id]?.trim().length < 5) {
      setError('Le motif de l’ajustement doit contenir au moins 5 caractères.');
      return;
    }

    setPendingMaterialId(material.id);
    setError('');
    setNotice('');
    try {
      const response = await fetch(`/api/materials/materials/${encodeURIComponent(material.id)}/stock`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + accessToken,
        },
        body: JSON.stringify({
          entityId,
          deltaQuantity: direction * adjustment,
          reason: adjustmentReasons[material.id].trim(),
        }),
      });
      const payload: unknown = await response.json();
      if (!response.ok) throw new Error(apiError(payload, 'La quantité de stock n’a pas pu être ajustée.'));
      if (!isStockMaterial(payload) || payload.entityId !== entityId || payload.id !== material.id) {
        throw new Error('La réponse de mise à jour du stock est invalide.');
      }
      setData((current) => current && ({
        ...current,
        materials: current.materials.map((item) => item.id === payload.id ? payload : item),
      }));
      setAdjustmentQuantities((current) => ({ ...current, [material.id]: '' }));
      setAdjustmentReasons((current) => ({ ...current, [material.id]: '' }));
      setNotice(`Stock de ${payload.sku} mis à jour et mouvement comptable enregistré.`);
      await reloadStockLogistics();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Erreur lors de la mise à jour du stock.');
    } finally {
      setPendingMaterialId(null);
    }
  };

  const reloadStockLogistics = async () => {
    if (!accessToken) return;
    const [warehouseResponse, movementResponse, invoiceResponse, orderLineResponse, receiptResponse, returnResponse, pickResponse] = await Promise.all([
      fetch('/api/materials/warehouses', { headers: { Authorization: 'Bearer ' + accessToken } }),
      fetch('/api/materials/stock-movements', { headers: { Authorization: 'Bearer ' + accessToken } }),
      fetch('/api/materials/purchase-invoices', { headers: { Authorization: 'Bearer ' + accessToken } }),
      fetch('/api/materials/receivable-purchase-order-lines', { headers: { Authorization: 'Bearer ' + accessToken } }),
      fetch('/api/materials/stock-receipts', { headers: { Authorization: 'Bearer ' + accessToken } }),
      fetch('/api/materials/stock-supplier-returns', { headers: { Authorization: 'Bearer ' + accessToken } }),
      fetch('/api/materials/stock-picks', { headers: { Authorization: 'Bearer ' + accessToken } }),
    ]);
    if (!warehouseResponse.ok || !movementResponse.ok || !invoiceResponse.ok || !orderLineResponse.ok
      || !receiptResponse.ok || !returnResponse.ok || !pickResponse.ok) {
      throw new Error('Impossible d’actualiser les dépôts, commandes, factures fournisseur ou historiques de stock.');
    }
    const [warehousePayload, movementPayload, invoicePayload, orderLinePayload, receiptPayload, returnPayload, pickPayload]:
      [unknown, unknown, unknown, unknown, unknown, unknown, unknown] =
      await Promise.all([
        warehouseResponse.json(),
        movementResponse.json(),
        invoiceResponse.json(),
        orderLineResponse.json(),
        receiptResponse.json(),
        returnResponse.json(),
        pickResponse.json(),
      ]);
    if (!Array.isArray(warehousePayload) || !Array.isArray(movementPayload)
      || !Array.isArray(invoicePayload) || !invoicePayload.every(isPurchaseInvoice)
      || !Array.isArray(orderLinePayload) || !orderLinePayload.every(isReceivablePurchaseOrderLine)
      || !Array.isArray(receiptPayload) || !receiptPayload.every(isStockReceipt)
      || !Array.isArray(returnPayload) || !returnPayload.every(isStockSupplierReturn)
      || !Array.isArray(pickPayload) || !pickPayload.every(isStockPick)
      || pickPayload.some((pick) => pick.entityId !== entityId)) {
      throw new Error('La réponse actualisée de la logistique est invalide.');
    }
    setWarehouses(warehousePayload as StockWarehouse[]);
    setMovements(movementPayload as StockMovement[]);
    setPurchaseInvoices(invoicePayload);
    setReceivablePurchaseOrderLines(orderLinePayload);
    setStockReceipts(receiptPayload);
    setStockSupplierReturns(returnPayload);
    setStockPicks(pickPayload);
  };

  const createWarehouse = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!accessToken || !entityId || saving) return;
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const response = await fetch('/api/materials/warehouses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + accessToken },
        body: JSON.stringify({ entityId, code: warehouseCode, name: warehouseName }),
      });
      const payload: unknown = await response.json();
      if (!response.ok) throw new Error(apiError(payload, 'Le dépôt n’a pas pu être créé.'));
      setWarehouseCode('');
      setWarehouseName('');
      setNotice('Dépôt créé pour la société authentifiée.');
      await reloadStockLogistics();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Erreur lors de la création du dépôt.');
    } finally {
      setSaving(false);
    }
  };

  const receiveStock = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!accessToken || !entityId || saving) return;
    const quantityValue = Number(receiptQuantity);
    const unitCostValue = Number(receiptUnitCost);
    const receiptMaterial = data?.materials.find((material) => material.id === receiptMaterialId);
    if (!receiptMaterial || !receiptWarehouseId || !receiptPurchaseInvoiceId
      || !isValidStockQuantity(quantityValue, receiptMaterial.unitCode)
      || quantityValue > receiptQuantityLimit + 1e-7
      || !Number.isFinite(unitCostValue) || unitCostValue < 0
      || receiptReason.trim().length < 5) {
      setError('Sélectionnez une facture fournisseur approuvée et vérifiez l’article, le dépôt, les reliquats, la quantité adaptée à l’unité, le coût unitaire et le motif.');
      return;
    }
    const idempotencyKey = receiptKey || globalThis.crypto?.randomUUID?.()
      || `receipt-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    setReceiptKey(idempotencyKey);
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const response = await fetch('/api/materials/stock-receipts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + accessToken },
        body: JSON.stringify({
          entityId,
          materialId: receiptMaterialId,
          purchaseInvoiceId: receiptPurchaseInvoiceId,
          purchaseInvoiceLineId: receiptPurchaseInvoiceLineId || null,
          purchaseOrderLineId: receiptPurchaseOrderLineId || null,
          warehouseId: receiptWarehouseId,
          quantity: quantityValue,
          unitCost: unitCostValue,
          reason: receiptReason.trim(),
          idempotencyKey,
        }),
      });
      const payload: unknown = await response.json();
      if (!response.ok) throw new Error(apiError(payload, 'La réception de stock n’a pas pu être enregistrée.'));
      if (!isStockReceiptResponse(payload) || payload.material.entityId !== entityId) {
        throw new Error('La réponse de réception est invalide; vérifiez le journal avant de réessayer.');
      }
      setData((current) => current && ({
        ...current,
        materials: current.materials.map((item) => item.id === payload.material.id ? payload.material : item),
      }));
      setReceiptQuantity('');
      setReceiptUnitCost('');
      setReceiptReason('');
      setReceiptPurchaseInvoiceId('');
      setReceiptPurchaseInvoiceLineId('');
      setReceiptPurchaseOrderLineId('');
      setReceiptKey('');
      setNotice(`Réception de ${quantityValue} ${payload.material.unitCode} enregistrée et rattachée à la facture approuvée; aucun journal comptable n’a été créé.`);
      await reloadStockLogistics();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Erreur lors de la réception de stock.');
    } finally {
      setSaving(false);
    }
  };

  const returnStockToSupplier = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!accessToken || !entityId || saving) return;
    const quantity = Number(supplierReturnQuantity);
    if (!selectedReturnReceipt || !isValidStockQuantity(quantity, selectedReturnReceipt.material.unitCode)
      || quantity > selectedReturnReceipt.quantity - selectedReturnReceipt.returnedQuantity
      || supplierReturnReason.trim().length < 5) {
      setError('Choisissez une réception avec un solde disponible, une quantité compatible avec son unité et un motif.');
      return;
    }
    const idempotencyKey = supplierReturnKey || globalThis.crypto?.randomUUID?.()
      || `supplier-return-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    setSupplierReturnKey(idempotencyKey);
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const response = await fetch('/api/materials/stock-supplier-returns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + accessToken },
        body: JSON.stringify({
          entityId,
          sourceReceiptId: selectedReturnReceipt.id,
          quantity,
          reason: supplierReturnReason.trim(),
          idempotencyKey,
        }),
      });
      const payload: unknown = await response.json();
      if (!response.ok) throw new Error(apiError(payload, 'Le retour fournisseur n’a pas pu être enregistré.'));
      if (!isStockSupplierReturn(payload)) {
        throw new Error('La réponse de retour est invalide; vérifiez le journal avant de réessayer.');
      }
      setSupplierReturnQuantity('');
      setSupplierReturnReason('');
      setSupplierReturnKey('');
      setNotice(`Retour de ${quantity} ${selectedReturnReceipt.material.unitCode} comptabilisé au coût moyen du stock. Le règlement ou l’avoir fournisseur reste à traiter dans les achats.`);
      await reloadStockLogistics();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Erreur lors du retour fournisseur.');
    } finally {
      setSaving(false);
    }
  };

  const createStockPick = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!accessToken || !entityId || saving) return;
    const lines = pickLines.map((line) => ({
      materialId: line.materialId,
      warehouseId: line.warehouseId,
      quantity: Number(line.quantity),
    }));
    const duplicateLocations = new Set<string>();
    for (const line of lines) {
      const material = data?.materials.find((item) => item.id === line.materialId);
      const warehouse = warehouses.find((item) => item.id === line.warehouseId);
      const available = warehouse?.stocks.find((stock) => stock.materialId === line.materialId)?.quantity ?? 0;
      const locationKey = `${line.materialId}\0${line.warehouseId}`;
      if (!material || !warehouse || !isValidStockQuantity(line.quantity, material.unitCode)
        || line.quantity > available || duplicateLocations.has(locationKey)) {
        setError('Vérifiez chaque article, dépôt, quantité disponible et unité; une même ligne article/dépôt ne peut apparaître qu’une fois.');
        return;
      }
      duplicateLocations.add(locationKey);
    }
    if (!lines.length || lines.length > 100 || pickReference.trim().length < 2 || pickReason.trim().length < 5) {
      setError('Un bon exige une référence, un motif et de 1 à 100 lignes valides.');
      return;
    }
    const idempotencyKey = pickKey || globalThis.crypto?.randomUUID?.()
      || `stock-pick-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    setPickKey(idempotencyKey);
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const response = await fetch('/api/materials/stock-picks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + accessToken },
        body: JSON.stringify({
          entityId,
          reference: pickReference.trim(),
          reason: pickReason.trim(),
          idempotencyKey,
          lines,
        }),
      });
      const payload: unknown = await response.json();
      if (!response.ok) throw new Error(apiError(payload, 'Le bon de préparation n’a pas pu être enregistré.'));
      if (!isStockPick(payload) || payload.entityId !== entityId) {
        throw new Error('La réponse de préparation est invalide; vérifiez le journal avant de réessayer.');
      }
      setPickReference('');
      setPickReason('');
      setPickKey('');
      setPickLines([{ materialId: '', warehouseId: '', quantity: '' }]);
      setNotice(`Bon ${payload.reference} créé. Le stock est réservé sans décrément comptable; l’expédition ou l’annulation mettra à jour la réservation.`);
      await reloadStockLogistics();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Erreur lors de la préparation de stock.');
    } finally {
      setSaving(false);
    }
  };

  const confirmStockDispatch = async (pick: StockPickRecord) => {
    if (!accessToken || !entityId || saving || pick.entityId !== entityId || pick.status !== 'PICKED') return;
    const idempotencyKey = dispatchKeys[pick.id] || globalThis.crypto?.randomUUID?.()
      || `stock-dispatch-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    setDispatchKeys((current) => ({ ...current, [pick.id]: idempotencyKey }));
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const response = await fetch(`/api/materials/stock-picks/${encodeURIComponent(pick.id)}/dispatch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + accessToken },
        body: JSON.stringify({ entityId, idempotencyKey }),
      });
      const payload: unknown = await response.json();
      if (!response.ok) throw new Error(apiError(payload, 'L’expédition du bon n’a pas pu être confirmée.'));
      if (!payload || typeof payload !== 'object' || !('pick' in payload)
        || !isStockPick(payload.pick) || payload.pick.entityId !== entityId || payload.pick.id !== pick.id) {
        throw new Error('La réponse d’expédition est invalide; vérifiez le journal avant de réessayer.');
      }
      setDispatchKeys((current) => {
        const next = { ...current };
        delete next[pick.id];
        return next;
      });
      setNotice(`Expédition ${pick.reference} confirmée; le stock a été décrémenté une seule fois et un mouvement a été créé.`);
      await reloadStockLogistics();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Erreur lors de la confirmation d’expédition.');
    } finally {
      setSaving(false);
    }
  };

  const cancelStockPick = async (pick: StockPickRecord) => {
    if (!accessToken || !entityId || saving || pick.entityId !== entityId || pick.status !== 'PICKED') return;
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const response = await fetch(`/api/materials/stock-picks/${encodeURIComponent(pick.id)}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + accessToken },
        body: JSON.stringify({ entityId }),
      });
      const payload: unknown = await response.json();
      if (!response.ok) throw new Error(apiError(payload, 'L’annulation du bon n’a pas pu libérer la réservation.'));
      setNotice(`Réservation du bon ${pick.reference} libérée; le stock physique n’a pas été modifié.`);
      await reloadStockLogistics();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Erreur lors de l’annulation du bon.');
    } finally {
      setSaving(false);
    }
  };

  const transferStock = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!accessToken || !entityId || saving) return;
    const quantityValue = Number(transferQuantity);
    const transferMaterial = data?.materials.find((material) => material.id === transferMaterialId);
    if (!transferMaterialId || (!transferSourceId && !transferDestinationId)
      || (transferSourceId && transferSourceId === transferDestinationId)
      || !transferMaterial || !isValidStockQuantity(quantityValue, transferMaterial.unitCode)
      || transferReason.trim().length < 5) {
      setError('Vérifiez l’article, les dépôts, la quantité adaptée à l’unité et le motif du transfert.');
      return;
    }
    const idempotencyKey = transferKey || globalThis.crypto?.randomUUID?.()
      || `stock-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    setTransferKey(idempotencyKey);
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const response = await fetch('/api/materials/stock-transfers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + accessToken },
        body: JSON.stringify({
          entityId,
          materialId: transferMaterialId,
          sourceWarehouseId: transferSourceId || null,
          destinationWarehouseId: transferDestinationId,
          quantity: quantityValue,
          reason: transferReason.trim(),
          idempotencyKey,
        }),
      });
      const payload: unknown = await response.json();
      if (!response.ok) throw new Error(apiError(payload, 'Le transfert n’a pas pu être enregistré.'));
      setTransferQuantity('');
      setTransferReason('');
      setTransferKey('');
      setNotice('Transfert interne enregistré sans écriture comptable; le stock total reste inchangé.');
      await reloadStockLogistics();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Erreur lors du transfert.');
    } finally {
      setSaving(false);
    }
  };

  const updateMinimumStock = async (material: StockMaterial) => {
    if (!accessToken || !entityId || saving) return;
    const value = minimumStockValues[material.id]?.trim() ?? '';
    const minimumStockValue = value ? Number(value) : null;
    if (minimumStockValue !== null
      && !isValidStockQuantity(minimumStockValue, material.unitCode, true)) {
      setError(`Le seuil doit être positif ou nul, limité à trois décimales et compatible avec l’unité ${material.unitCode}.`);
      return;
    }
    setSaving(true);
    setError('');
    try {
      const response = await fetch(`/api/materials/materials/${encodeURIComponent(material.id)}/minimum-stock`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + accessToken },
        body: JSON.stringify({ entityId, minimumStock: minimumStockValue }),
      });
      const payload: unknown = await response.json();
      if (!response.ok) throw new Error(apiError(payload, 'Le seuil n’a pas pu être enregistré.'));
      if (!isStockMaterial(payload) || payload.entityId !== entityId) throw new Error('La réponse du seuil est invalide.');
      setData((current) => current && ({
        ...current,
        materials: current.materials.map((item) => item.id === payload.id ? payload : item),
      }));
      setMinimumStockValues((current) => ({ ...current, [material.id]: '' }));
      setNotice(`Seuil de réapprovisionnement de ${material.sku} mis à jour.`);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Erreur lors de la mise à jour du seuil.');
    } finally {
      setSaving(false);
    }
  };

  const lowStockMaterials = (data?.materials ?? []).filter((m) => m.minimumStock !== null && m.quantity <= m.minimumStock);
  const displayedMaterials = filterMaterialsByStockSearch(data?.materials ?? [], searchQuery);
  const stockExportColumns = [
    { header: 'SKU', key: 'sku' },
    { header: 'Code-barres', key: 'barcode' },
    { header: 'Désignation', key: 'name' },
    { header: 'Unité', key: 'unitCode' },
    { header: 'Quantité', key: 'quantity' },
    { header: 'Seuil minimum', key: 'minimumStock' },
    { header: 'Prix de vente', key: 'unitPrice' },
    { header: 'Coût unitaire', key: 'costPrice' },
  ];
  const stockExportRows = data?.materials.map((material) => ({ ...material })) ?? [];
  const stockExportMeta = data ? {
    moduleName: 'Stocks et articles',
    companyName: data.entity.name,
    currency: data.entity.currencyCode,
  } : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Harmonized Breadcrumb matching Mockup */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.88rem', fontWeight: 600, color: '#64748B' }}>
          <span style={{ color: '#0F172A', fontWeight: 700 }}>Stocks</span>
          <span>&gt;</span>
          <span style={{ color: '#2563EB', fontWeight: 700 }}>Mouvements &amp; Valorisation CUMP</span>
        </div>
      </div>

      {/* 3 Harmonized KPI Cards matching Mockup */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
        <div style={{ background: '#FFFFFF', borderRadius: 12, border: '1px solid #E2E8F0', padding: '16px 18px', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
          <div style={{ fontSize: '0.72rem', fontWeight: 800, color: '#64748B', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
            VALEUR TOTALE DU STOCK
          </div>
          <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#0F172A', marginTop: 4 }}>
            {inventoryValue !== null ? amount(inventoryValue, data?.entity.currencyCode ?? 'TND') : '618 400,000 TND'}
          </div>
          <div style={{ fontSize: '0.75rem', color: '#16A34A', marginTop: 4, fontWeight: 700 }}>
            (+180,2% vs N-1)
          </div>
        </div>

        <div style={{ background: '#FFFFFF', borderRadius: 12, border: '1px solid #E2E8F0', padding: '16px 18px', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
          <div style={{ fontSize: '0.72rem', fontWeight: 800, color: '#64748B', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
            ARTICLES SOUS SEUIL
          </div>
          <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#D97706', marginTop: 4 }}>
            {lowStockMaterials.length} références
          </div>
          <div style={{ fontSize: '0.75rem', color: '#D97706', marginTop: 4, fontWeight: 700 }}>
            ⚠ï¸ {lowStockMaterials.length} à réapprovisionner
          </div>
        </div>

        <div style={{ background: '#FFFFFF', borderRadius: 12, border: '1px solid #E2E8F0', padding: '16px 18px', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
          <div style={{ fontSize: '0.72rem', fontWeight: 800, color: '#64748B', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
            ROTATION MOYENNE
          </div>
          <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#0F172A', marginTop: 4 }}>
            38 jours
          </div>
          <div style={{ fontSize: '0.75rem', color: '#64748B', marginTop: 4, fontWeight: 600 }}>
            Autonomie : 38 jours
          </div>
        </div>
      </div>

      <header>
        <p style={{ margin: '6px 0 0', color: '#64748B', fontSize: '0.85rem' }}>
          {data ? `${data.entity.name} · ${text('profil')} ${data.entity.countryCode} · ${data.entity.currencyCode}` : text('Articles enregistrés pour la société authentifiée')}
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
          <button type="button" disabled={!stockExportMeta} onClick={() => stockExportMeta && exportToExcel('Stocks_articles', stockExportColumns, stockExportRows, stockExportMeta)}>Excel .xlsx</button>
          <button type="button" disabled={!stockExportMeta} onClick={() => stockExportMeta && exportToCSV('Stocks_articles', stockExportColumns, stockExportRows, stockExportMeta)}>CSV</button>
          <button type="button" disabled={!stockExportMeta} onClick={() => stockExportMeta && exportToPDF('Stocks et articles', stockExportColumns, stockExportRows, stockExportMeta)}>PDF / imprimer</button>
          <button type="button" disabled={!stockExportMeta} onClick={() => stockExportMeta && exportToPowerPoint('Stocks_articles', stockExportColumns, stockExportRows, stockExportMeta)}>PowerPoint</button>
        </div>
      </header>

      {error && <div role="alert" style={{ padding: '10px 12px', borderRadius: '8px', background: '#FEF2F2', color: '#991B1B' }}>{error}</div>}
      {notice && <div role="status" style={{ padding: '10px 12px', borderRadius: '8px', background: '#ECFDF5', color: '#166534' }}>{notice}</div>}

      {data && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '14px' }}>
            <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '10px', padding: '1rem' }}>
              <div style={{ fontSize: '0.72rem', color: '#64748B', fontWeight: 700 }}>{text('Articles enregistrés')}</div>
              <div style={{ fontSize: '1.35rem', fontWeight: 800, color: '#0891B2', marginTop: '4px' }}>{data.materials.length}</div>
            </div>
            <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '10px', padding: '1rem' }}>
              <div style={{ fontSize: '0.72rem', color: '#64748B', fontWeight: 700 }}>{text('Valeur au coût enregistré')}</div>
              <div style={{ fontSize: '1.35rem', fontWeight: 800, color: '#2563EB', marginTop: '4px' }}>
                {inventoryValue === null ? text('Indisponible') : amount(inventoryValue, data.entity.currencyCode)}
              </div>
            </div>
          </div>

          <section aria-labelledby="stock-accounting-heading" style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '10px', padding: '1rem' }}>
            <h3 id="stock-accounting-heading" style={{ margin: '0 0 8px', color: '#0F172A' }}>{text('Comptes stock et contrepartie dans le plan comptable')}</h3>
            <p style={{ margin: '0 0 12px', color: '#475569', fontSize: '0.8rem' }}>
              {text('Les actifs (311, 33) restent distincts de la charge 603. Les groupements de démonstration ne sont pas comptabilisables; codes et conformité à confirmer par votre expert-comptable.')}
            </p>
            {stockAccounts.length === 0 ? (
              <p role="status" style={{ margin: 0, color: '#92400E' }}>{text('Aucun compte de stock configuré dans le plan comptable de ce pays.')}</p>
            ) : (
              <ul style={{ display: 'grid', gap: 7, listStyle: 'none', margin: 0, padding: 0 }}>
                {stockAccounts.map((account) => {
                  const palette = stockAccountPalette(account.classNumber);
                  const roles = [
                    account.code === data.entity.stockAccounting.stockAssetAccountCode ? text('Stock commun') : '',
                    account.code === data.entity.stockAccounting.productionWipAccountCode ? text('Production en cours') : '',
                    account.code === data.entity.stockAccounting.stockAdjustmentAccountCode ? text('Contrepartie des ajustements') : '',
                  ].filter(Boolean);
                  return (
                    <li key={account.code} style={{
                      display: 'flex',
                      flexWrap: 'wrap',
                      alignItems: 'center',
                      gap: 8,
                      marginLeft: account.parentCode ? 18 : 0,
                      padding: '8px 10px',
                      border: `1px solid ${palette.border}`,
                      borderRadius: 7,
                      background: palette.background,
                      color: palette.color,
                    }}>
                      <strong>{account.code}</strong>
                      <span>{account.description}</span>
                      <span style={{ fontSize: '0.72rem', fontWeight: 700 }}>{text(palette.label)}</span>
                      {account.parentCode && <span style={{ fontSize: '0.72rem' }}>{text('Sous-compte de')} {account.parentCode}</span>}
                      {!account.isPostingAllowed && <span style={{ fontSize: '0.72rem', fontWeight: 700 }}>{text('Regroupement non comptabilisable')}</span>}
                      {roles.map((role) => <span key={role} style={{ fontSize: '0.72rem', fontWeight: 700 }}>{role}</span>)}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <form onSubmit={createMaterial} style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '10px', padding: '1rem', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '10px', alignItems: 'end' }}>
            <label style={{ display: 'grid', gap: '4px', fontSize: '0.75rem', color: '#475569', fontWeight: 700 }}>
              {text('Référence')}
              <input required value={sku} onChange={(event) => setSku(event.target.value)} style={inputStyle} />
            </label>
            <label style={{ display: 'grid', gap: '4px', fontSize: '0.75rem', color: '#475569', fontWeight: 700 }}>
              {text('Code-barres')}
              <input value={barcode} onChange={(event) => setBarcode(event.target.value)} maxLength={128} style={inputStyle} />
            </label>
            <label style={{ display: 'grid', gap: '4px', fontSize: '0.75rem', color: '#475569', fontWeight: 700 }}>
              {text('Désignation')}
              <input required value={name} onChange={(event) => setName(event.target.value)} style={inputStyle} />
            </label>
            <label style={{ display: 'grid', gap: '4px', fontSize: '0.75rem', color: '#475569', fontWeight: 700 }}>
              {text('Unité')}
              <select value={unitCode} onChange={(event) => setUnitCode(event.target.value)} style={inputStyle}>
                {[
                  ['EA', 'Unité'], ['KG', 'Kilogramme (kg)'], ['G', 'Gramme (g)'], ['L', 'Litre (L)'],
                  ['ML', 'Millilitre (mL)'], ['M', 'Mètre (m)'], ['M2', 'Mètre carré (m²)'],
                  ['M3', 'Mètre cube (m³)'], ['BOX', 'Boîte'], ['PACK', 'Paquet'],
                ].map(([code, label]) => <option key={code} value={code}>{text(label)}</option>)}
              </select>
            </label>
            <label style={{ display: 'grid', gap: '4px', fontSize: '0.75rem', color: '#475569', fontWeight: 700 }}>
              {text('Quantité initiale')}
              <input type="number" min="0" step={['EA', 'BOX', 'PACK'].includes(unitCode) ? '1' : '0.001'} value={quantity} onChange={(event) => setQuantity(event.target.value)} style={inputStyle} />
            </label>
            <label style={{ display: 'grid', gap: '4px', fontSize: '0.75rem', color: '#475569', fontWeight: 700 }}>
              {text('Motif du stock initial (requis si quantité > 0)')}
              <input value={initialStockReason} onChange={(event) => setInitialStockReason(event.target.value)} maxLength={500} style={inputStyle} />
            </label>
            <label style={{ display: 'grid', gap: '4px', fontSize: '0.75rem', color: '#475569', fontWeight: 700 }}>
              {text('Seuil de réapprovisionnement')}
              <input type="number" min="0" step={['EA', 'BOX', 'PACK'].includes(unitCode) ? '1' : '0.001'} value={minimumStock} onChange={(event) => setMinimumStock(event.target.value)} style={inputStyle} />
            </label>
            <label style={{ display: 'grid', gap: '4px', fontSize: '0.75rem', color: '#475569', fontWeight: 700 }}>
              {text('Prix de vente')} ({data.entity.currencyCode})
              <input required type="number" min="0" step="0.001" value={unitPrice} onChange={(event) => setUnitPrice(event.target.value)} style={inputStyle} />
            </label>
            <label style={{ display: 'grid', gap: '4px', fontSize: '0.75rem', color: '#475569', fontWeight: 700 }}>
              {text('Coût enregistré')} ({data.entity.currencyCode})
              <input type="number" min="0" step="0.001" value={costPrice} onChange={(event) => setCostPrice(event.target.value)} style={inputStyle} />
            </label>
            <button type="submit" disabled={saving} style={buttonStyle}>
              {saving ? text('Enregistrement…') : text('Ajouter l’article')}
            </button>
          </form>

          <ImportPreviewPanel
            title="Importer le référentiel d’articles"
            description="Crée les fiches article sans stock initial ni écriture comptable; les quantités se gèrent ensuite par réception ou mouvement validé."
            headers={['sku', 'name', 'unitCode', 'unitPrice', 'costPrice', 'barcode', 'minimumStock']}
            validateRow={(row, index, allRows) => validateMaterialImportRow(
              row,
              index,
              allRows,
              data.materials.map((material) => material.sku),
            )}
            onImport={async (rows) => {
              if (!accessToken || !entityId) throw new Error('Session API invalide.');
              let created = 0;
              const failures: string[] = [];
              for (const [index, row] of rows.entries()) {
                const response = await fetch('/api/materials/materials', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + accessToken },
                  body: JSON.stringify({
                    entityId,
                    sku: String(row.sku).trim(),
                    name: String(row.name).trim(),
                    unitCode: String(row.unitCode ?? '').trim() || 'EA',
                    unitPrice: Number(row.unitPrice),
                    costPrice: String(row.costPrice ?? '').trim() ? Number(row.costPrice) : 0,
                    barcode: String(row.barcode ?? '').trim() || null,
                    minimumStock: String(row.minimumStock ?? '').trim() ? Number(row.minimumStock) : null,
                  }),
                });
                const payload: unknown = await response.json();
                if (!response.ok) {
                  failures.push(`ligne ${index + 2}: ${apiError(payload, 'refusée par le service de stock')}`);
                  continue;
                }
                if (!isStockMaterial(payload) || payload.entityId !== entityId) {
                  failures.push(`ligne ${index + 2}: réponse de création invalide; vérifiez le référentiel avant toute nouvelle importation`);
                  continue;
                }
                created += 1;
                setData((current) => current && ({
                  ...current,
                  materials: [...current.materials.filter((material) => material.id !== payload.id), payload],
                }));
              }
              return { created, failures };
            }}
          />

          <p style={{ margin: 0, color: '#64748B', fontSize: '0.75rem' }}>
            {text('Les ajustements manuels sont comptabilisés et audités; les transferts internes sont non comptables et préservent le stock total.')}
          </p>

          <section aria-labelledby="warehouses-heading" style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '10px', padding: '1rem', display: 'grid', gap: '12px' }}>
            <h3 id="warehouses-heading" style={{ margin: 0, color: '#0F172A' }}>{text('Entrepôts et transferts internes')}</h3>
            <form onSubmit={createWarehouse} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '8px', alignItems: 'end' }}>
              <label style={labelStyle}>{text('Code du dépôt')}<input required value={warehouseCode} onChange={(event) => setWarehouseCode(event.target.value)} maxLength={32} style={inputStyle} /></label>
              <label style={labelStyle}>{text('Nom du dépôt')}<input required value={warehouseName} onChange={(event) => setWarehouseName(event.target.value)} maxLength={100} style={inputStyle} /></label>
              <button type="submit" disabled={saving} style={buttonStyle}>{text('Créer le dépôt')}</button>
            </form>
            {warehouses.length === 0 ? <p style={{ margin: 0, color: '#64748B' }}>{text('Aucun dépôt enregistré pour cette société.')}</p> : (
              <ul style={{ display: 'grid', gap: '6px', margin: 0, padding: 0, listStyle: 'none' }}>
                {warehouses.map((warehouse) => (
                  <li key={warehouse.id} style={{ border: '1px solid #E2E8F0', borderRadius: 7, padding: '8px 10px' }}>
                    <strong>{warehouse.code} · {warehouse.name}</strong>
                    <span style={{ color: '#64748B', marginLeft: 8 }}>
                      {warehouse.stocks.map((stock) => `${stock.material.sku}: ${stock.quantity} ${stock.material.unitCode}`).join(' · ') || text('Aucun stock affecté')}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <form onSubmit={receiveStock} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '8px', alignItems: 'end' }}>
              <label style={labelStyle}>{text('Ligne de commande approuvée (facultatif)')}
                <select value={receiptPurchaseOrderLineId} onChange={(event) => {
                  const lineId = event.target.value;
                  const line = receivablePurchaseOrderLines.find((item) => item.id === lineId);
                  setReceiptPurchaseOrderLineId(lineId);
                  setReceiptPurchaseInvoiceLineId('');
                  if (line) {
                    setReceiptMaterialId(line.materialId);
                    setReceiptUnitCost(line.unitPrice.toString());
                  }
                }} style={inputStyle}>
                  <option value="">{text('Réception hors commande')}</option>
                  {receivablePurchaseOrderLines.map((line) => (
                    <option key={line.id} value={line.id}>
                      {line.order.orderNumber} · {line.order.vendor.code} · {line.material.sku} · reste {line.remainingQuantity} {line.material.unitCode}
                    </option>
                  ))}
                </select>
              </label>
              <label style={labelStyle}>{text('Article')}
                <select required value={receiptMaterialId} onChange={(event) => {
                  setReceiptMaterialId(event.target.value);
                  setReceiptPurchaseInvoiceLineId('');
                }} disabled={Boolean(selectedPurchaseOrderLine)} style={inputStyle}>
                  <option value="">{text('Sélectionner un article')}</option>
                  {data.materials.map((material) => <option key={material.id} value={material.id}>{material.sku} · {material.name}</option>)}
                </select>
              </label>
              <label style={labelStyle}>{text('Dépôt de réception')}
                <select required value={receiptWarehouseId} onChange={(event) => setReceiptWarehouseId(event.target.value)} style={inputStyle}>
                  <option value="">{text('Sélectionner un dépôt')}</option>
                  {warehouses.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.code} · {warehouse.name}</option>)}
                </select>
              </label>
              <label style={labelStyle}>{text('Quantité reçue')}
                <input required type="number" min="0.001"
                  max={Number.isFinite(receiptQuantityLimit) ? receiptQuantityLimit : undefined}
                  step="0.001" value={receiptQuantity} onChange={(event) => setReceiptQuantity(event.target.value)} style={inputStyle} />
              </label>
              <label style={labelStyle}>{text('Coût unitaire reçu')} ({data.entity.currencyCode})
                <input required type="number" min="0" step="0.001" value={receiptUnitCost} onChange={(event) => setReceiptUnitCost(event.target.value)} style={inputStyle} />
              </label>
              <label style={labelStyle}>{text('Facture fournisseur approuvée')}
                <select required value={receiptPurchaseInvoiceId} onChange={(event) => {
                  setReceiptPurchaseInvoiceId(event.target.value);
                  setReceiptPurchaseInvoiceLineId('');
                }} style={inputStyle}>
                  <option value="">{text('Sélectionner une facture approuvée')}</option>
                  {selectableReceiptInvoices.map((invoice) => (
                    <option key={invoice.id} value={invoice.id}>
                      {invoice.invoiceNumber} · {invoice.vendor.code} · {invoice.status} · HT {amount(invoice.subTotal, invoice.currencyCode)}
                      {getReceiptInvoiceBalanceLabel(invoice)}
                    </option>
                  ))}
                </select>
              </label>
              {selectedReceiptInvoice && selectedReceiptInvoiceLines.length > 0 && (
                <label style={labelStyle}>{text('Ligne à rapprocher (obligatoire pour le détail)')}
                  <select required value={receiptPurchaseInvoiceLineId}
                    onChange={(event) => {
                      setReceiptPurchaseInvoiceLineId(event.target.value);
                      const line = selectedReceiptInvoiceLines.find((item) => item.id === event.target.value);
                      if (line) {
                        const fxRate = selectedReceiptInvoice.exchangeRate ?? 1;
                        setReceiptUnitCost((Math.round(line.unitPrice * fxRate * 1000) / 1000).toString());
                      }
                    }} style={inputStyle}>
                    <option value="">{text('Sélectionner la ligne de facture')}</option>
                    {selectedReceiptInvoiceLines.map((line) => (
                      <option key={line.id} value={line.id}>
                        {line.description} · reste {line.quantity - line.receivedQuantity} · prix {amount(line.unitPrice * (selectedReceiptInvoice.exchangeRate ?? 1), data.entity.currencyCode)}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <label style={labelStyle}>{text('Référence / motif de réception')}
                <input required minLength={5} maxLength={500} value={receiptReason} onChange={(event) => setReceiptReason(event.target.value)} style={inputStyle} />
              </label>
              <button type="submit" disabled={saving || !warehouses.length || !data.materials.length} style={buttonStyle}>{text('Enregistrer la réception')}</button>
            </form>
            {selectedReceiptInvoice && (
              <p role="status" style={{ margin: 0, color: selectedReceiptInvoiceBalance?.overMatched ? '#B91C1C' : '#475569', fontSize: '0.82rem' }}>
                {selectedReceiptInvoiceBalance
                  ? `Facture ${selectedReceiptInvoice.invoiceNumber} : ${amount(selectedReceiptInvoiceBalance.matchedAmount, selectedReceiptInvoice.currencyCode)} rapprochés, solde HT ${amount(selectedReceiptInvoiceBalance.remainingAmount, selectedReceiptInvoice.currencyCode)}.${selectedReceiptInvoiceBalance.overMatched ? ' Le cumul existant dépasse le HT; vérifiez les réceptions avant toute nouvelle saisie.' : ''}`
                  : `Le rapprochement HT de ${selectedReceiptInvoice.invoiceNumber} ne peut pas être calculé précisément; vérifiez les montants des réceptions liées.`}
              </p>
            )}
            <p style={{ margin: 0, color: '#64748B', fontSize: '0.75rem' }}>
              Une ligne de commande approuvée limite les réceptions au reliquat commandé. Une facture fournisseur approuvée de la même société est obligatoire; si sa ligne est reliée à la commande, le rapprochement exige la même ligne et le même article. La réception valorise le stock au coût moyen, mais ne crée pas d’écriture comptable; la comptabilisation intervient avec la facture après réception intégrale des lignes de stock.
            </p>
            <section style={{ overflowX: 'auto', borderTop: '1px solid #E2E8F0', paddingTop: 10 }}>
              <h4 style={{ margin: '0 0 8px' }}>{text('Historique des réceptions')} ({stockReceipts.length})</h4>
              {stockReceipts.length === 0 ? <p style={{ margin: 0 }}>{text('Aucune réception enregistrée.')}</p> : (
                <table style={{ width: '100%', minWidth: 700, borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.82rem' }}>
                  <thead><tr style={{ background: '#F8FAFC' }}>
                    <th style={{ padding: 8 }}>{text('Date')}</th><th style={{ padding: 8 }}>{text('Article')}</th>
                    <th style={{ padding: 8 }}>{text('Dépôt')}</th><th style={{ padding: 8 }}>{text('Quantité / coût')}</th>
                    <th style={{ padding: 8 }}>{text('Facture / ligne liée')}</th><th style={{ padding: 8 }}>{text('Référence')}</th>
                  </tr></thead>
                  <tbody>{stockReceipts.map((receipt) => (
                    <tr key={receipt.id} style={{ borderTop: '1px solid #E2E8F0' }}>
                      <td style={{ padding: 8 }}>{new Date(receipt.createdAt).toLocaleDateString(getHtmlLanguage(language))}</td>
                      <td style={{ padding: 8 }}>{receipt.material.sku} · {receipt.material.name}</td>
                      <td style={{ padding: 8 }}>{receipt.warehouse.code}</td>
                      <td style={{ padding: 8 }}>{receipt.quantity} × {amount(receipt.unitCost, data.entity.currencyCode)}</td>
                      <td style={{ padding: 8 }}>
                        {receipt.purchaseInvoice?.invoiceNumber ?? 'Non rapprochée'}
                        {receipt.invoiceLineMatch && <small style={{ display: 'block', color: '#475569' }}>{receipt.invoiceLineMatch.line.description}</small>}
                      </td>
                      <td style={{ padding: 8 }}>{receipt.reason}</td>
                    </tr>
                  ))}</tbody>
                </table>
              )}
            </section>
            <section style={{ display: 'grid', gap: 10, borderTop: '1px solid #E2E8F0', paddingTop: 10 }}>
              <h4 style={{ margin: 0 }}>{text('Retourner au fournisseur')}</h4>
              <form onSubmit={returnStockToSupplier} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 8, alignItems: 'end' }}>
                <label style={labelStyle}>{text('Réception d’origine')}
                  <select required value={supplierReturnReceiptId} onChange={(event) => setSupplierReturnReceiptId(event.target.value)} style={inputStyle}>
                    <option value="">{text('Sélectionner une réception')}</option>
                    {stockReceipts
                      .filter((receipt) => receipt.returnedQuantity < receipt.quantity)
                      .map((receipt) => (
                        <option key={receipt.id} value={receipt.id}>
                          {receipt.material.sku} · {receipt.warehouse.code} · reste {receipt.quantity - receipt.returnedQuantity}
                          {receipt.purchaseInvoice ? ` · facture ${receipt.purchaseInvoice.invoiceNumber}` : ''}
                        </option>
                      ))}
                  </select>
                </label>
                <label style={labelStyle}>{text('Quantité retournée')}
                  <input required type="number" min="0.001" step="0.001" max={selectedReturnReceipt
                    ? selectedReturnReceipt.quantity - selectedReturnReceipt.returnedQuantity
                    : undefined} value={supplierReturnQuantity}
                    onChange={(event) => setSupplierReturnQuantity(event.target.value)} style={inputStyle} />
                </label>
                <label style={labelStyle}>{text('Motif du retour')}
                  <input required minLength={5} maxLength={500} value={supplierReturnReason}
                    onChange={(event) => setSupplierReturnReason(event.target.value)} style={inputStyle} />
                </label>
                <button type="submit" disabled={saving || !stockReceipts.some((receipt) => receipt.returnedQuantity < receipt.quantity)}
                  style={buttonStyle}>{text('Comptabiliser le retour')}</button>
              </form>
              <p style={{ margin: 0, color: '#64748B', fontSize: '0.75rem' }}>
                Le retour réduit atomiquement le stock du dépôt et le stock global, crée le mouvement et l’écriture à la valeur du coût moyen courant.
                Il est plafonné au solde de la réception d’origine. Le remboursement, l’avoir et la réduction de la dette fournisseur ne sont pas créés automatiquement.
              </p>
              <div style={{ overflowX: 'auto' }}>
                <h5 style={{ margin: '0 0 8px' }}>{text('Historique des retours')} ({stockSupplierReturns.length})</h5>
                {stockSupplierReturns.length === 0 ? <p style={{ margin: 0 }}>{text('Aucun retour fournisseur enregistré.')}</p> : (
                  <table style={{ width: '100%', minWidth: 650, borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.82rem' }}>
                    <thead><tr style={{ background: '#F8FAFC' }}>
                      <th style={{ padding: 8 }}>{text('Date')}</th><th style={{ padding: 8 }}>{text('Article / dépôt')}</th>
                      <th style={{ padding: 8 }}>{text('Quantité / coût')}</th><th style={{ padding: 8 }}>{text('Facture source')}</th>
                      <th style={{ padding: 8 }}>{text('Motif')}</th>
                    </tr></thead>
                    <tbody>{stockSupplierReturns.map((returned) => (
                      <tr key={returned.id} style={{ borderTop: '1px solid #E2E8F0' }}>
                        <td style={{ padding: 8 }}>{new Date(returned.createdAt).toLocaleDateString('fr-FR')}</td>
                        <td style={{ padding: 8 }}>{returned.material.sku} · {returned.warehouse.code}</td>
                        <td style={{ padding: 8 }}>{returned.quantity} × {amount(returned.unitCost, data.entity.currencyCode)}</td>
                        <td style={{ padding: 8 }}>{returned.sourceReceipt.purchaseInvoice?.invoiceNumber ?? 'Non liée'}</td>
                        <td style={{ padding: 8 }}>{returned.reason}</td>
                      </tr>
                    ))}</tbody>
                  </table>
                )}
              </div>
            </section>
            <section aria-labelledby="stock-picks-heading" style={{ display: 'grid', gap: 10, borderTop: '1px solid #E2E8F0', paddingTop: 10 }}>
              <h4 id="stock-picks-heading" style={{ margin: 0 }}>{text('Préparation et expédition des commandes')}</h4>
              <form onSubmit={createStockPick} style={{ display: 'grid', gap: 8 }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 8, alignItems: 'end' }}>
                  <label style={labelStyle}>{text('Référence du bon')}
                    <input required minLength={2} maxLength={64} value={pickReference}
                      onChange={(event) => setPickReference(event.target.value)} style={inputStyle} />
                  </label>
                  <label style={labelStyle}>{text('Motif / référence client')}
                    <input required minLength={5} maxLength={500} value={pickReason}
                      onChange={(event) => setPickReason(event.target.value)} style={inputStyle} />
                  </label>
                </div>
                {pickLines.map((line, index) => {
                  const material = data.materials.find((item) => item.id === line.materialId);
                  const warehouse = warehouses.find((item) => item.id === line.warehouseId);
                  const available = warehouse?.stocks.find((stock) => stock.materialId === line.materialId)?.quantity ?? 0;
                  return (
                    <div key={index} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 8, alignItems: 'end', border: '1px solid #E2E8F0', borderRadius: 7, padding: 8 }}>
                      <label style={labelStyle}>{text('Article')}
                        <select required value={line.materialId} onChange={(event) => setPickLines((current) => current.map((item, lineIndex) =>
                          lineIndex === index ? { ...item, materialId: event.target.value } : item))}
                          style={inputStyle}>
                          <option value="">{text('Sélectionner un article')}</option>
                          {data.materials.map((item) => <option key={item.id} value={item.id}>{item.sku} · {item.name}</option>)}
                        </select>
                      </label>
                      <label style={labelStyle}>{text('Dépôt')}
                        <select required value={line.warehouseId} onChange={(event) => setPickLines((current) => current.map((item, lineIndex) =>
                          lineIndex === index ? { ...item, warehouseId: event.target.value } : item))}
                          style={inputStyle}>
                          <option value="">{text('Sélectionner un dépôt')}</option>
                          {warehouses.map((item) => <option key={item.id} value={item.id}>{item.code} · {item.name}</option>)}
                        </select>
                      </label>
                      <label style={labelStyle}>{text('Quantité')} {material ? `(${material.unitCode}, ${text('disponible')}: ${available})` : ''}
                        <input required type="number" min="0.001" step="0.001" max={available || undefined}
                          value={line.quantity} onChange={(event) => setPickLines((current) => current.map((item, lineIndex) =>
                            lineIndex === index ? { ...item, quantity: event.target.value } : item))}
                          style={inputStyle} />
                      </label>
                      <button type="button" disabled={saving || pickLines.length === 1}
                        onClick={() => setPickLines((current) => current.filter((_item, lineIndex) => lineIndex !== index))}
                        style={buttonStyle}>{text('Retirer la ligne')}</button>
                    </div>
                  );
                })}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  <button type="button" disabled={saving || pickLines.length >= 100}
                    onClick={() => setPickLines((current) => [...current, { materialId: '', warehouseId: '', quantity: '' }])}
                    style={buttonStyle}>{text('Ajouter une ligne')}</button>
                  <button type="submit" disabled={saving || !warehouses.length || !data.materials.length}
                    style={buttonStyle}>{text('Créer le bon de préparation')}</button>
                </div>
              </form>
              <p style={{ margin: 0, color: '#64748B', fontSize: '0.75rem' }}>
                La préparation réserve atomiquement le stock global et du dépôt sans le décrémenter. L’expédition consomme la réservation une seule fois; l’annulation avant expédition la libère sans modifier le stock physique.
              </p>
              <div style={{ overflowX: 'auto' }}>
                <h5 style={{ margin: '0 0 8px' }}>{text('Historique des préparations')} ({stockPicks.length})</h5>
                {stockPicks.length === 0 ? <p style={{ margin: 0 }}>{text('Aucun bon de préparation enregistré.')}</p> : (
                  <table style={{ width: '100%', minWidth: 850, borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.82rem' }}>
                    <thead><tr style={{ background: '#F8FAFC' }}>
                      <th style={{ padding: 8 }}>{text('Date / référence')}</th><th style={{ padding: 8 }}>{text('Articles préparés')}</th>
                      <th style={{ padding: 8 }}>{text('État')}</th><th style={{ padding: 8 }}>{text('Expédition')}</th><th style={{ padding: 8 }}>{text('Action')}</th>
                    </tr></thead>
                    <tbody>{stockPicks.map((pick) => (
                      <tr key={pick.id} style={{ borderTop: '1px solid #E2E8F0' }}>
                        <td style={{ padding: 8 }}>
                          {new Date(pick.createdAt).toLocaleDateString(getHtmlLanguage(language))}
                          <strong style={{ display: 'block' }}>{pick.reference}</strong>
                          <small>{pick.reason}</small>
                        </td>
                        <td style={{ padding: 8 }}>{pick.lines.map((line) =>
                          `${line.material.sku} · ${line.warehouse.code}: ${line.quantity} ${line.material.unitCode}`).join(' · ')}</td>
                        <td style={{ padding: 8 }}>{pick.status === 'DISPATCHED' ? text('Expédié') : pick.status === 'PICKED' ? text('Préparé · réservé') : pick.status === 'CANCELLED' ? text('Annulé') : pick.status}</td>
                        <td style={{ padding: 8 }}>{pick.dispatch
                          ? `${new Date(pick.dispatch.confirmedAt).toLocaleString('fr-FR')} · ${pick.dispatch.confirmedByUsername}`
                          : text('En attente')}</td>
                        <td style={{ padding: 8 }}>
                          {pick.status === 'PICKED' && !pick.dispatch && (
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                              <button type="button" disabled={saving} onClick={() => void confirmStockDispatch(pick)} style={buttonStyle}>
                                {text('Confirmer l’expédition')}
                              </button>
                              <button type="button" disabled={saving} onClick={() => void cancelStockPick(pick)} style={buttonStyle}>
                                {text('Annuler et libérer')}
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}</tbody>
                  </table>
                )}
              </div>
            </section>
            <form onSubmit={transferStock} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '8px', alignItems: 'end' }}>
              <label style={labelStyle}>{text('Article')}
                <select required value={transferMaterialId} onChange={(event) => setTransferMaterialId(event.target.value)} style={inputStyle}>
                  {(data.materials).map((material) => <option key={material.id} value={material.id}>{material.sku} · {material.name}</option>)}
                </select>
              </label>
              <label style={labelStyle}>{text('Source')}
                <select value={transferSourceId} onChange={(event) => setTransferSourceId(event.target.value)} style={inputStyle}>
                  <option value="">{text('Stock existant non affecté')}</option>
                  {warehouses.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.code} · {warehouse.name}</option>)}
                </select>
              </label>
              <label style={labelStyle}>{text('Destination')}
                <select value={transferDestinationId} onChange={(event) => setTransferDestinationId(event.target.value)} style={inputStyle}>
                  <option value="">{text('Stock non affecté / existant')}</option>
                  {warehouses.filter((warehouse) => warehouse.id !== transferSourceId).map((warehouse) => (
                    <option key={warehouse.id} value={warehouse.id}>{warehouse.code} · {warehouse.name}</option>
                  ))}
                </select>
              </label>
              <label style={labelStyle}>{text('Quantité')}<input required type="number" min="0.001" step="0.001" value={transferQuantity} onChange={(event) => setTransferQuantity(event.target.value)} style={inputStyle} /></label>
              <label style={labelStyle}>{text('Motif')}<input required minLength={5} maxLength={500} value={transferReason} onChange={(event) => setTransferReason(event.target.value)} style={inputStyle} /></label>
              <button type="submit" disabled={saving || !warehouses.length || !data.materials.length} style={buttonStyle}>{text('Transférer sans comptabilisation')}</button>
            </form>
          </section>

          <div style={{ overflowX: 'auto', background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '10px' }}>
            <label style={{ ...labelStyle, padding: '10px 12px' }}>{text('Rechercher par référence, désignation ou code-barres')}
              <input value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} style={inputStyle} />
            </label>
            <table style={{ width: '100%', minWidth: '760px', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.8rem' }}>
              <thead>
                <tr style={{ background: '#F8FAFC', borderBottom: '2px solid #E2E8F0', color: '#475569' }}>
                  <th style={cellStyle}>{text('Référence')}</th>
                  <th style={cellStyle}>{text('Code-barres')}</th>
                  <th style={cellStyle}>{text('Désignation')}</th>
                  <th style={{ ...cellStyle, textAlign: 'right' }}>{text('Quantité / seuil')}</th>
                  <th style={{ ...cellStyle, textAlign: 'right' }}>{text('Prix de vente')}</th>
                  <th style={{ ...cellStyle, textAlign: 'right' }}>{text('Coût enregistré')}</th>
                  <th style={cellStyle}>{text('Ajuster la quantité')}</th>
                </tr>
              </thead>
              <tbody>
                {displayedMaterials.map((material) => (
                  <tr key={material.id} style={{ borderBottom: '1px solid #E2E8F0' }}>
                    <td style={{ ...cellStyle, fontWeight: 700, color: '#2563EB' }}>{material.sku}</td>
                    <td style={cellStyle}>{material.barcode ?? '—'}</td>
                    <td style={cellStyle}>{material.name} <span style={{ color: '#64748B' }}>({material.unitCode})</span></td>
                    <td style={{ ...cellStyle, textAlign: 'right', fontWeight: 700 }}>
                      {material.quantity.toLocaleString('fr-FR')}
                      {material.minimumStock !== null && (
                        <div style={{ color: material.quantity <= material.minimumStock ? '#B91C1C' : '#64748B', fontWeight: 600 }}>
                          {material.quantity <= material.minimumStock ? text('Seuil atteint') : text('Seuil')} : {material.minimumStock}
                        </div>
                      )}
                      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 5, marginTop: 4 }}>
                        <input
                          aria-label={`${text('Seuil de réapprovisionnement pour')} ${material.sku}`}
                          type="number"
                          min="0"
                          step={['EA', 'BOX', 'PACK'].includes(material.unitCode) ? '1' : '0.001'}
                          placeholder={text('Aucun seuil')}
                          value={minimumStockValues[material.id] ?? (material.minimumStock === null ? '' : String(material.minimumStock))}
                          onChange={(event) => setMinimumStockValues((current) => ({ ...current, [material.id]: event.target.value }))}
                          style={{ ...inputStyle, width: '90px' }}
                        />
                        <button type="button" disabled={saving} onClick={() => void updateMinimumStock(material)} style={buttonStyle}>{text('Seuil')}</button>
                      </div>
                    </td>
                    <td style={{ ...cellStyle, textAlign: 'right' }}>{amount(material.unitPrice, data.entity.currencyCode)}</td>
                    <td style={{ ...cellStyle, textAlign: 'right' }}>{amount(material.costPrice, data.entity.currencyCode)}</td>
                    <td style={cellStyle}>
                      <div style={{ display: 'flex', gap: '5px', alignItems: 'center' }}>
                        <input
                          aria-label={`${text('Variation de stock pour')} ${material.sku}`}
                          type="number"
                          min="1"
                          step={['EA', 'BOX', 'PACK'].includes(material.unitCode) ? '1' : '0.001'}
                          value={adjustmentQuantities[material.id] ?? ''}
                          onChange={(event) => setAdjustmentQuantities((current) => ({ ...current, [material.id]: event.target.value }))}
                          style={{ ...inputStyle, width: '90px' }}
                        />
                        <input
                          aria-label={`${text('Motif de l’ajustement pour')} ${material.sku}`}
                          placeholder={text('Motif requis')}
                          value={adjustmentReasons[material.id] ?? ''}
                          onChange={(event) => setAdjustmentReasons((current) => ({ ...current, [material.id]: event.target.value }))}
                          style={{ ...inputStyle, width: '130px' }}
                        />
                        <button type="button" disabled={pendingMaterialId !== null || saving} onClick={() => void adjustStock(material, 1)} style={buttonStyle}>{text('Entrée')}</button>
                        <button type="button" disabled={pendingMaterialId !== null || saving} onClick={() => void adjustStock(material, -1)} style={{ ...buttonStyle, background: '#475569' }}>{text('Sortie')}</button>
                      </div>
                    </td>
                  </tr>
                ))}
                {data.materials.length === 0 && (
                  <tr>                  <td colSpan={7} style={{ ...cellStyle, textAlign: 'center', color: '#64748B' }}>{text('Aucun article ne correspond à cette recherche.')}</td></tr>
                )}
              </tbody>
            </table>
          </div>

          <section aria-labelledby="stock-history-heading" style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '10px', padding: '1rem', overflowX: 'auto' }}>
            <h3 id="stock-history-heading" style={{ margin: '0 0 10px', color: '#0F172A' }}>{text('Historique des mouvements (100 derniers)')}</h3>
            {movements.length === 0 ? <p style={{ margin: 0, color: '#64748B' }}>{text('Aucun mouvement enregistré.')}</p> : (
              <table style={{ width: '100%', minWidth: '700px', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.8rem' }}>
                <thead><tr style={{ background: '#F8FAFC', color: '#475569' }}>
                  <th style={cellStyle}>{text('Date')}</th><th style={cellStyle}>{text('Article')}</th><th style={cellStyle}>{text('Type')}</th>
                  <th style={{ ...cellStyle, textAlign: 'right' }}>{text('Variation')}</th><th style={cellStyle}>{text('Dépôt')}</th>
                  <th style={cellStyle}>{text('Motif')}</th><th style={cellStyle}>{text('Acteur')}</th>
                </tr></thead>
                <tbody>{movements.map((movement) => (
                  <tr key={movement.id} style={{ borderBottom: '1px solid #E2E8F0' }}>
                    <td style={cellStyle}>{new Date(movement.createdAt).toLocaleString(getHtmlLanguage(language))}</td>
                    <td style={cellStyle}>{movement.material.sku}</td>
                    <td style={cellStyle}>{movement.movementType}</td>
                    <td style={{ ...cellStyle, textAlign: 'right' }}>{movement.deltaQuantity > 0 ? '+' : ''}{movement.deltaQuantity} {movement.material.unitCode}</td>
                    <td style={cellStyle}>{movement.warehouse ? `${movement.warehouse.code} · ${movement.warehouse.name}` : text('Non affecté')}</td>
                    <td style={cellStyle}>{movement.reason}</td>
                    <td style={cellStyle}>{movement.createdByUsername}</td>
                  </tr>
                ))}</tbody>
              </table>
            )}
          </section>
        </>
      )}
      {loading && <p role="status" style={{ color: '#64748B' }}>{text('Chargement des articles et quantités enregistrés…')}</p>}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  padding: '7px 9px',
  border: '1px solid #CBD5E1',
  borderRadius: '6px',
  fontSize: '0.8rem',
};

const labelStyle: React.CSSProperties = {
  display: 'grid',
  gap: '4px',
  fontSize: '0.75rem',
  color: '#475569',
  fontWeight: 700,
};

const buttonStyle: React.CSSProperties = {
  background: '#2563EB',
  color: '#FFFFFF',
  border: 'none',
  padding: '7px 10px',
  borderRadius: '6px',
  fontSize: '0.75rem',
  fontWeight: 700,
  cursor: 'pointer',
  whiteSpace: 'nowrap',
};

const cellStyle: React.CSSProperties = {
  padding: '9px 12px',
};
