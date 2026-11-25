import React, { useEffect, useState } from 'react';
import { getSalesOrderFulfillmentDisplay } from './sales-order-fulfillment';
import { translateBusinessText, useInterfaceLanguage } from './localization';

interface SalesCustomer {
  id: string;
  name: string;
}

interface SalesMaterial {
  id: string;
  sku: string;
  name: string;
  unitCode: string;
  unitPrice: number;
}

interface SalesWarehouse {
  id: string;
  code: string;
  name: string;
}

interface SalesTaxRate {
  code: string;
  name: string;
  rate: number;
}

interface SalesOrderLine {
  id: string;
  materialId: string;
  quantity: number;
  unitPrice: number;
  totalAmount: number;
  material: { id: string; sku: string; name: string; unitCode: string };
}

interface SalesOrder {
  id: string;
  orderNumber: string;
  currencyCode: string;
  status: string;
  totalAmount: number;
  customer: { id: string; name: string };
  lines: SalesOrderLine[];
  stockPickLink: null | {
    stockPick: {
      id: string;
      reference: string;
      status: string;
      dispatch: null | { id: string; confirmedAt: string; confirmedByUsername: string };
    };
  };
  invoiceLink: null | {
    invoice: { id: string; invoiceNumber: string; status: string };
  };
}

interface OrderDraftLine {
  key: string;
  materialId: string;
  quantity: string;
  unitPrice: string;
}

interface SalesOrdersPanelProps {
  accessToken: string | null;
  entityId: string | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isSalesOrderLine(value: unknown): value is SalesOrderLine {
  return isRecord(value)
    && typeof value.id === 'string'
    && typeof value.materialId === 'string'
    && typeof value.quantity === 'number'
    && typeof value.unitPrice === 'number'
    && typeof value.totalAmount === 'number'
    && isRecord(value.material)
    && typeof value.material.id === 'string'
    && typeof value.material.sku === 'string'
    && typeof value.material.name === 'string'
    && typeof value.material.unitCode === 'string';
}

function isStockPickLink(value: unknown): value is SalesOrder['stockPickLink'] {
  return value === null || (isRecord(value)
    && isRecord(value.stockPick)
    && typeof value.stockPick.id === 'string'
    && typeof value.stockPick.reference === 'string'
    && typeof value.stockPick.status === 'string'
    && (value.stockPick.dispatch === null || (isRecord(value.stockPick.dispatch)
      && typeof value.stockPick.dispatch.id === 'string'
      && typeof value.stockPick.dispatch.confirmedAt === 'string'
      && typeof value.stockPick.dispatch.confirmedByUsername === 'string')));
}

function isInvoiceLink(value: unknown): value is SalesOrder['invoiceLink'] {
  return value === null || (isRecord(value)
    && isRecord(value.invoice)
    && typeof value.invoice.id === 'string'
    && typeof value.invoice.invoiceNumber === 'string'
    && typeof value.invoice.status === 'string');
}

function isSalesTaxRateList(value: unknown): value is { rates: SalesTaxRate[] } {
  return isRecord(value) && Array.isArray(value.rates) && value.rates.every((rate) => isRecord(rate)
    && typeof rate.code === 'string'
    && typeof rate.name === 'string'
    && typeof rate.rate === 'number'
    && Number.isFinite(rate.rate));
}

function isSalesOrderList(value: unknown): value is SalesOrder[] {
  return Array.isArray(value) && value.every((order) => isRecord(order)
    && typeof order.id === 'string'
    && typeof order.orderNumber === 'string'
    && typeof order.currencyCode === 'string'
    && typeof order.status === 'string'
    && typeof order.totalAmount === 'number'
    && isRecord(order.customer)
    && typeof order.customer.id === 'string'
    && typeof order.customer.name === 'string'
    && Array.isArray(order.lines) && order.lines.every(isSalesOrderLine)
    && isStockPickLink(order.stockPickLink)
    && isInvoiceLink(order.invoiceLink));
}

async function getPayload(response: Response, fallback: string): Promise<unknown> {
  const payload: unknown = await response.json();
  if (!response.ok) {
    throw new Error(isRecord(payload) && typeof payload.error === 'string' ? payload.error : fallback);
  }
  return payload;
}

export default function SalesOrdersPanel({ accessToken, entityId }: SalesOrdersPanelProps) {
  const language = useInterfaceLanguage();
  const text = (value: string) => translateBusinessText(language, value);
  const [customers, setCustomers] = useState<SalesCustomer[]>([]);
  const [materials, setMaterials] = useState<SalesMaterial[]>([]);
  const [warehouses, setWarehouses] = useState<SalesWarehouse[]>([]);
  const [taxRates, setTaxRates] = useState<SalesTaxRate[]>([]);
  const [orders, setOrders] = useState<SalesOrder[]>([]);
  const [customerId, setCustomerId] = useState('');
  const [draftLines, setDraftLines] = useState<OrderDraftLine[]>([
    { key: crypto.randomUUID(), materialId: '', quantity: '1', unitPrice: '' },
  ]);
  const [warehouseByLine, setWarehouseByLine] = useState<Record<string, string>>({});
  const [taxRateByLine, setTaxRateByLine] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [refreshVersion, setRefreshVersion] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    if (!accessToken || !entityId) {
      setCustomers([]);
      setMaterials([]);
      setWarehouses([]);
      setTaxRates([]);
      setOrders([]);
      setError(!accessToken ? 'Session API invalide.' : 'Aucune société liée au compte.');
      return () => controller.abort();
    }

    const load = async () => {
      setLoading(true);
      setError('');
      try {
        const headers = { Authorization: `Bearer ${accessToken}` };
        const responses = await Promise.all([
          fetch('/api/sales/orders', { headers, signal: controller.signal }),
          fetch('/api/sales/customers', { headers, signal: controller.signal }),
          fetch('/api/materials/materials', { headers, signal: controller.signal }),
          fetch('/api/materials/warehouses', { headers, signal: controller.signal }),
          fetch('/api/sales/tax-rates', { headers, signal: controller.signal }),
        ]);
        const [orderPayload, customerPayload, materialPayload, warehousePayload, taxRatePayload] = await Promise.all([
          getPayload(responses[0], 'Impossible de charger les commandes client.'),
          getPayload(responses[1], 'Impossible de charger les clients.'),
          getPayload(responses[2], 'Impossible de charger les articles.'),
          getPayload(responses[3], 'Impossible de charger les dépôts.'),
          getPayload(responses[4], 'Impossible de charger les taux configurés.'),
        ]);
        if (!isSalesOrderList(orderPayload)
          || !Array.isArray(customerPayload)
          || !Array.isArray(materialPayload)
          || !Array.isArray(warehousePayload)
          || !isSalesTaxRateList(taxRatePayload)) {
          throw new Error('Une réponse de données de vente ou de stock est invalide.');
        }
        setOrders(orderPayload);
        setTaxRates(taxRatePayload.rates.filter((rate) => rate.rate >= 0 && rate.rate <= 100));
        setCustomers(customerPayload.filter((row): row is SalesCustomer => isRecord(row)
          && typeof row.id === 'string' && typeof row.name === 'string'));
        setMaterials(materialPayload.filter((row): row is SalesMaterial => isRecord(row)
          && typeof row.id === 'string' && typeof row.sku === 'string' && typeof row.name === 'string'
          && typeof row.unitCode === 'string' && typeof row.unitPrice === 'number'));
        setWarehouses(warehousePayload.filter((row): row is SalesWarehouse => isRecord(row)
          && typeof row.id === 'string' && typeof row.code === 'string' && typeof row.name === 'string'));
      } catch (requestError) {
        if (!controller.signal.aborted) {
          setError(requestError instanceof Error ? requestError.message : 'Impossible de charger les commandes client.');
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };
    void load();
    return () => controller.abort();
  }, [accessToken, entityId, refreshVersion]);

  const send = async (url: string, method: 'POST', body: unknown) => {
    if (!accessToken) throw new Error('Session API invalide.');
    const response = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify(body),
    });
    return getPayload(response, 'La demande de commande ou d’expédition a échoué.');
  };

  const updateLine = (key: string, updates: Partial<OrderDraftLine>) => {
    setDraftLines((lines) => lines.map((line) => line.key === key ? { ...line, ...updates } : line));
  };

  const createOrder = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!entityId || !customerId || draftLines.some((line) => !line.materialId
      || !Number.isFinite(Number(line.quantity)) || Number(line.quantity) <= 0
      || !Number.isFinite(Number(line.unitPrice)) || Number(line.unitPrice) < 0)) {
      setError(text('Choisissez un client et vérifiez chaque article, quantité et prix.'));
      return;
    }
    setBusy(true);
    setError('');
    try {
      await send('/api/sales/orders', 'POST', {
        entityId,
        customerId,
        lines: draftLines.map((line) => ({
          materialId: line.materialId,
          quantity: Number(line.quantity),
          unitPrice: Number(line.unitPrice),
        })),
      });
      setDraftLines([{ key: crypto.randomUUID(), materialId: '', quantity: '1', unitPrice: '' }]);
      setRefreshVersion((version) => version + 1);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'La commande client n’a pas pu être créée.');
    } finally {
      setBusy(false);
    }
  };

  const createPick = async (order: SalesOrder) => {
    setBusy(true);
    setError('');
    try {
      await send(`/api/sales/orders/${encodeURIComponent(order.id)}/stock-pick`, 'POST', {
        entityId,
        lines: order.lines.map((line) => ({
          salesOrderLineId: line.id,
          warehouseId: warehouseByLine[`${order.id}:${line.id}`] ?? warehouses[0]?.id ?? '',
        })),
      });
      setRefreshVersion((version) => version + 1);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'La préparation de la commande a échoué.');
    } finally {
      setBusy(false);
    }
  };

  const dispatchOrder = async (order: SalesOrder) => {
    setBusy(true);
    setError('');
    try {
      await send(`/api/sales/orders/${encodeURIComponent(order.id)}/dispatch`, 'POST', { entityId });
      setRefreshVersion((version) => version + 1);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'L’expédition de la commande a échoué.');
    } finally {
      setBusy(false);
    }
  };

  const invoiceOrder = async (order: SalesOrder) => {
    const lines = order.lines.map((line) => ({
      salesOrderLineId: line.id,
      taxRate: Number(taxRateByLine[`${order.id}:${line.id}`]),
    }));
    if (lines.some((line) => !Number.isFinite(line.taxRate)
      || !taxRates.some((rate) => rate.rate === line.taxRate))) {
      setError(text('Choisissez un taux de TVA configuré pour chaque ligne avant de créer la facture.'));
      return;
    }
    setBusy(true);
    setError('');
    try {
      await send(`/api/sales/orders/${encodeURIComponent(order.id)}/invoice`, 'POST', { entityId, lines });
      setRefreshVersion((version) => version + 1);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'La facture de la commande n’a pas pu être créée.');
    } finally {
      setBusy(false);
    }
  };

  const cancelOrder = async (order: SalesOrder) => {
    setBusy(true);
    setError('');
    try {
      await send(`/api/sales/orders/${encodeURIComponent(order.id)}/cancel`, 'POST', { entityId });
      setRefreshVersion((version) => version + 1);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'L’annulation de la commande a échoué.');
    } finally {
      setBusy(false);
    }
  };

  const cardStyle: React.CSSProperties = {
    background: '#FFFFFF',
    border: '1px solid #E2E8F0',
    borderRadius: '10px',
    padding: '16px',
  };

  return (
    <section aria-labelledby="sales-orders-title" style={{ display: 'grid', gap: '14px' }}>
      <header style={cardStyle}>
        <h2 id="sales-orders-title" style={{ margin: 0, color: '#0F172A', fontSize: '1.2rem' }}>
          {text('Commandes client et livraison stock')}
        </h2>
        <p style={{ margin: '6px 0 0', color: '#64748B', fontSize: '0.85rem' }}>
          {text('Chaque ligne référence un article. Après confirmation de l’expédition, une facture brouillon peut reprendre la commande avec un taux configuré choisi pour chaque ligne.')}
        </p>
      </header>

      <form onSubmit={createOrder} style={{ ...cardStyle, display: 'grid', gap: '12px' }}>
        <h3 style={{ margin: 0 }}>{text('Nouvelle commande client')}</h3>
        <label>
          {text('Client')}
          <select value={customerId} onChange={(event) => setCustomerId(event.target.value)} required>
            <option value="">{text('Choisir un client')}</option>
            {customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}</option>)}
          </select>
        </label>
        {draftLines.map((line, index) => (
          <div key={line.key} style={{ display: 'grid', gridTemplateColumns: 'minmax(180px, 2fr) 100px 140px auto', gap: '8px', alignItems: 'end' }}>
            <label>
              {text('Article')}
              <select value={line.materialId} onChange={(event) => {
                const material = materials.find(({ id }) => id === event.target.value);
                updateLine(line.key, {
                  materialId: event.target.value,
                  unitPrice: material ? String(material.unitPrice) : '',
                });
              }} required>
                <option value="">{text('Choisir un article')}</option>
                {materials.map((material) => (
                  <option key={material.id} value={material.id}>{material.sku} — {material.name} ({material.unitCode})</option>
                ))}
              </select>
            </label>
            <label>
              {text('Quantité')}
              <input type="number" min="0.001" step="0.001" value={line.quantity}
                onChange={(event) => updateLine(line.key, { quantity: event.target.value })} required />
            </label>
            <label>
              {text('Prix unitaire')}
              <input type="number" min="0" step="0.001" value={line.unitPrice}
                onChange={(event) => updateLine(line.key, { unitPrice: event.target.value })} required />
            </label>
            {draftLines.length > 1 && (
              <button type="button" onClick={() => setDraftLines((lines) => lines.filter(({ key }) => key !== line.key))}
                aria-label={language === 'AR' ? `إزالة السطر ${index + 1}` : `Supprimer la ligne ${index + 1}`}>{text('Retirer')}</button>
            )}
          </div>
        ))}
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button type="button" onClick={() => setDraftLines((lines) => [
            ...lines,
            { key: crypto.randomUUID(), materialId: '', quantity: '1', unitPrice: '' },
          ])}>{text('Ajouter une ligne')}</button>
          <button type="submit" disabled={busy || customers.length === 0 || materials.length === 0}>
            {busy ? text('Enregistrement…') : text('Créer la commande')}
          </button>
        </div>
      </form>

      {error && <div role="alert" style={{ ...cardStyle, borderColor: '#FECACA', color: '#991B1B', background: '#FEF2F2' }}>{error}</div>}
      {loading && <div role="status" style={cardStyle}>{text('Chargement des commandes…')}</div>}
      {!loading && materials.length === 0 && (
        <div role="status" style={{ ...cardStyle, borderColor: '#FED7AA', background: '#FFFBEB', color: '#9A3412' }}>
          {text('Aucun article n’est configuré pour cette société.')}
        </div>
      )}
      {!loading && materials.length > 0 && warehouses.length === 0 && (
        <div role="status" style={{ ...cardStyle, borderColor: '#FED7AA', background: '#FFFBEB', color: '#9A3412' }}>
          {text('Configurez un dépôt avec des soldes de stock avant de préparer une commande.')}
        </div>
      )}
      {!loading && orders.map((order) => {
        const dispatch = order.stockPickLink?.stockPick.dispatch ?? null;
        const fulfillment = getSalesOrderFulfillmentDisplay(order.status, dispatch);
        return (
            <article key={order.id} style={{ ...cardStyle, display: 'grid', gap: '10px' }}>
              <header style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
                <strong>{order.orderNumber} — {order.customer.name}</strong>
                <span>{text(fulfillment.label)} · <bdi dir="ltr">{order.totalAmount.toLocaleString('fr-FR', { minimumFractionDigits: 3 })} {order.currencyCode}</bdi></span>
              </header>
              {fulfillment.warning && <div role="alert" style={{ color: '#92400E' }}>{text(fulfillment.warning)}</div>}
              <div style={{ display: 'grid', gap: '6px' }}>
                {order.lines.map((line) => (
                  <div key={line.id} style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
                    <span>{line.material.sku} — {line.material.name}: <bdi dir="ltr">{line.quantity} {line.material.unitCode} × {line.unitPrice}</bdi></span>
                    {order.status === 'OPEN' && (
                      <label>
                        {text('Dépôt')}
                        <select
                          value={warehouseByLine[`${order.id}:${line.id}`] ?? warehouses[0]?.id ?? ''}
                          onChange={(event) => setWarehouseByLine((previous) => ({
                            ...previous,
                            [`${order.id}:${line.id}`]: event.target.value,
                          }))}
                        >
                          {warehouses.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.code} — {warehouse.name}</option>)}
                        </select>
                      </label>
                    )}
                    {order.status === 'DISPATCHED' && !order.invoiceLink && (
                      <label>
                        {text('Taux TVA')} — {line.material.sku}
                        <select
                          aria-label={language === 'AR'
                            ? `نسبة ضريبة القيمة المضاÙة للمادة ${line.material.sku} من الطلب ${order.orderNumber}`
                            : `Taux TVA pour ${line.material.sku} de la commande ${order.orderNumber}`}
                          value={taxRateByLine[`${order.id}:${line.id}`] ?? ''}
                          onChange={(event) => setTaxRateByLine((previous) => ({
                            ...previous,
                            [`${order.id}:${line.id}`]: event.target.value,
                          }))}
                        >
                          <option value="">{text('Choisir un taux configuré')}</option>
                          {taxRates.map((rate) => (
                            <option key={rate.code} value={rate.rate}>{rate.name} — {rate.rate}%</option>
                          ))}
                        </select>
                      </label>
                    )}
                  </div>
                ))}
              </div>
              {order.status === 'OPEN' && warehouses.length > 0 && (
                <button type="button" disabled={busy} onClick={() => void createPick(order)}>
                  {text('Préparer depuis les stocks')}
                </button>
              )}
              {fulfillment.canDispatch && order.stockPickLink && (
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                  <span>{text('Bon')} <bdi dir="ltr">{order.stockPickLink.stockPick.reference}</bdi> {text('prêt à expédier.')}</span>
                  <button type="button" disabled={busy} onClick={() => void dispatchOrder(order)}>
                    {text('Confirmer l’expédition et décrémenter le stock')}
                  </button>
                </div>
              )}
              {fulfillment.canReconcile && (
                <button type="button" disabled={busy} onClick={() => void dispatchOrder(order)}>
                  {text('Synchroniser le statut de la commande')}
                </button>
              )}
              {order.status === 'DISPATCHED' && !order.invoiceLink && (
                <button
                  type="button"
                  disabled={busy || taxRates.length === 0 || order.lines.some((line) => (
                    !taxRates.some((rate) => rate.rate === Number(taxRateByLine[`${order.id}:${line.id}`]))
                  ))}
                  onClick={() => void invoiceOrder(order)}
                >
                  {text('Créer la facture brouillon à contrôler')}
                </button>
              )}
              {order.invoiceLink && (
                <div role="status">
                  {text('Facture')} <strong>{order.invoiceLink.invoice.invoiceNumber}</strong>
                  {' '}· {order.invoiceLink.invoice.status}
                </div>
              )}
              {order.status === 'DISPATCHED' && !order.invoiceLink && taxRates.length === 0 && (
                <div role="alert" style={{ color: '#92400E' }}>
                  {text('Aucun taux de TVA configuré n’est disponible; vérifiez le paramétrage avant la facturation.')}
                </div>
              )}
              {(order.status === 'OPEN' || order.status === 'PICKED') && (
                <button type="button" disabled={busy} onClick={() => void cancelOrder(order)}>
                  {text('Annuler la commande et libérer la réservation')}
                </button>
              )}
              {dispatch && (
                <small>
                  {text('Expédiée le')} <bdi dir="ltr">{new Date(dispatch.confirmedAt).toLocaleString(language === 'AR' ? 'ar-TN-u-nu-latn' : 'fr-FR')}</bdi>
                  {' '}par {dispatch.confirmedByUsername}.
                </small>
              )}
            </article>
        );
      })}
    </section>
  );
}
