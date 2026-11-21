import React, { useEffect, useState } from 'react';
import { groupSalesQuotesByPipelineStage } from './sales-quote-pipeline';
import { translateBusinessText, useInterfaceLanguage } from './localization';

interface Customer {
  id: string;
  code: string;
  name: string;
}

interface SalesMaterial {
  id: string;
  sku: string;
  name: string;
  unitCode: string;
}

interface TaxRates {
  currencyCode: string;
  rates: Array<{ code: string; name: string; rate: number }>;
}

interface QuoteItemInput {
  description: string;
  quantity: number;
  unitPrice: number;
  taxRate: number;
}

interface SalesQuote {
  id: string;
  quoteNumber: string;
  customerId: string;
  currencyCode: string;
  subTotal: number;
  taxAmount: number;
  totalAmount: number;
  status: 'DRAFT' | 'CONVERTED' | 'ORDERED';
  createdByUsername: string;
  createdAt: string;
  customer: { name: string };
  conversion: {
    acceptanceNote: string;
    invoice: { id: string; invoiceNumber: string; status: string };
  } | null;
  orderConversion: {
    acceptanceNote: string;
    salesOrder: { id: string; orderNumber: string; status: string };
  } | null;
  items: Array<QuoteItemInput & { position: number; totalAmount: number }>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function getErrorMessage(value: unknown, fallback: string): string {
  return isRecord(value) && typeof value.error === 'string' ? value.error : fallback;
}

function isCustomerList(value: unknown): value is Customer[] {
  return Array.isArray(value) && value.every((item) => isRecord(item)
    && typeof item.id === 'string'
    && typeof item.code === 'string'
    && typeof item.name === 'string');
}

function isSalesMaterialList(value: unknown): value is SalesMaterial[] {
  return Array.isArray(value) && value.every((material) => isRecord(material)
    && typeof material.id === 'string'
    && typeof material.sku === 'string'
    && typeof material.name === 'string'
    && typeof material.unitCode === 'string');
}

function isTaxRates(value: unknown): value is TaxRates {
  return isRecord(value) && typeof value.currencyCode === 'string' && Array.isArray(value.rates)
    && value.rates.every((rate) => isRecord(rate)
      && typeof rate.code === 'string'
      && typeof rate.name === 'string'
      && typeof rate.rate === 'number');
}

function isQuoteList(value: unknown): value is SalesQuote[] {
  return Array.isArray(value) && value.every((quote) => isRecord(quote)
    && typeof quote.id === 'string'
    && typeof quote.quoteNumber === 'string'
    && typeof quote.customerId === 'string'
    && typeof quote.currencyCode === 'string'
    && typeof quote.totalAmount === 'number'
    && (quote.status === 'DRAFT' || quote.status === 'CONVERTED' || quote.status === 'ORDERED')
    && isRecord(quote.customer)
    && typeof quote.customer.name === 'string'
    && (quote.conversion === null || (isRecord(quote.conversion)
      && isRecord(quote.conversion.invoice)
      && typeof quote.conversion.invoice.id === 'string'
      && typeof quote.conversion.invoice.invoiceNumber === 'string'
      && typeof quote.conversion.invoice.status === 'string'))
    && (quote.orderConversion === null || (isRecord(quote.orderConversion)
      && isRecord(quote.orderConversion.salesOrder)
      && typeof quote.orderConversion.salesOrder.id === 'string'
      && typeof quote.orderConversion.salesOrder.orderNumber === 'string'
      && typeof quote.orderConversion.salesOrder.status === 'string'))
    && Array.isArray(quote.items));
}

const emptyItem: QuoteItemInput = { description: '', quantity: 1, unitPrice: 0, taxRate: 0 };

export default function SalesQuotesPanel({
  accessToken,
  entityId,
}: {
  accessToken: string | null;
  entityId: string | null;
}) {
  const language = useInterfaceLanguage();
  const text = (value: string) => translateBusinessText(language, value);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [materials, setMaterials] = useState<SalesMaterial[]>([]);
  const [taxRates, setTaxRates] = useState<TaxRates | null>(null);
  const [quotes, setQuotes] = useState<SalesQuote[]>([]);
  const [customerId, setCustomerId] = useState('');
  const [items, setItems] = useState<QuoteItemInput[]>([{ ...emptyItem }]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [editingQuoteId, setEditingQuoteId] = useState<string | null>(null);
  const [conversionQuoteId, setConversionQuoteId] = useState<string | null>(null);
  const [conversionMode, setConversionMode] = useState<'invoice' | 'order'>('invoice');
  const [orderItemMappings, setOrderItemMappings] = useState<Record<number, string>>({});
  const [acceptanceConfirmed, setAcceptanceConfirmed] = useState(false);
  const [acceptanceNote, setAcceptanceNote] = useState('');
  const [conversionDueDate, setConversionDueDate] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [viewMode, setViewMode] = useState<'list' | 'pipeline'>('pipeline');
  const pipeline = groupSalesQuotesByPipelineStage(quotes);
  const cardStyle: React.CSSProperties = {
    background: '#FFFFFF',
    border: '1px solid #E2E8F0',
    borderRadius: 10,
    padding: 16,
  };

  useEffect(() => {
    const controller = new AbortController();
    if (!accessToken || !entityId) {
      setCustomers([]);
      setMaterials([]);
      setQuotes([]);
      setTaxRates(null);
      setError(!accessToken ? 'Session API indisponible.' : 'Aucune société authentifiée.');
      return () => controller.abort();
    }

    const load = async () => {
      setLoading(true);
      setError('');
      try {
        const headers = { Authorization: 'Bearer ' + accessToken };
        const [customerResponse, rateResponse, quoteResponse, materialResponse] = await Promise.all([
          fetch('/api/sales/customers', { headers, signal: controller.signal }),
          fetch('/api/sales/tax-rates', { headers, signal: controller.signal }),
          fetch('/api/sales/quotes', { headers, signal: controller.signal }),
          fetch('/api/materials/materials', { headers, signal: controller.signal }),
        ]);
        const [customerPayload, ratePayload, quotePayload, materialPayload]: unknown[] = await Promise.all([
          customerResponse.json(), rateResponse.json(), quoteResponse.json(), materialResponse.json(),
        ]);
        if (!customerResponse.ok) throw new Error(getErrorMessage(customerPayload, 'Impossible de charger les clients.'));
        if (!rateResponse.ok) throw new Error(getErrorMessage(ratePayload, 'Impossible de charger les taux configurés.'));
        if (!quoteResponse.ok) throw new Error(getErrorMessage(quotePayload, 'Impossible de charger les devis.'));
        if (!materialResponse.ok) throw new Error(getErrorMessage(materialPayload, 'Impossible de charger les articles.'));
        if (!isCustomerList(customerPayload) || !isTaxRates(ratePayload)
          || !isQuoteList(quotePayload) || !isSalesMaterialList(materialPayload)) {
          throw new Error('Les données de devis reçues sont invalides.');
        }
        if (!controller.signal.aborted) {
          setCustomers(customerPayload);
          setMaterials(materialPayload);
          setCustomerId((current) => customerPayload.some((customer) => customer.id === current)
            ? current
            : customerPayload[0]?.id ?? '');
          setTaxRates(ratePayload);
          setQuotes(quotePayload);
          setItems((current) => current.map((item, index) => (
            index === 0 && item.taxRate === 0 && ratePayload.rates[0]
              ? { ...item, taxRate: ratePayload.rates[0].rate }
              : item
          )));
        }
      } catch (requestError) {
        if (!controller.signal.aborted) {
          setError(requestError instanceof Error ? requestError.message : 'Impossible de charger les devis.');
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };
    void load();
    return () => controller.abort();
  }, [accessToken, entityId, refreshVersion]);

  const saveQuote = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!accessToken || !entityId || !customerId) return;
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const response = await fetch(editingQuoteId
        ? `/api/sales/quotes/${encodeURIComponent(editingQuoteId)}`
        : '/api/sales/quotes', {
        method: editingQuoteId ? 'PATCH' : 'POST',
        headers: { Authorization: 'Bearer ' + accessToken, 'Content-Type': 'application/json' },
        body: JSON.stringify({ entityId, customerId, items }),
      });
      const payload: unknown = await response.json();
      if (!response.ok) throw new Error(getErrorMessage(payload, 'Le devis brouillon n’a pas pu être enregistré.'));
      setNotice(editingQuoteId ? 'Devis brouillon modifié.' : 'Devis brouillon créé.');
      setEditingQuoteId(null);
      setCustomerId(customers[0]?.id ?? '');
      setItems([{ ...emptyItem, taxRate: taxRates?.rates[0]?.rate ?? 0 }]);
      setRefreshVersion((version) => version + 1);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Le devis brouillon n’a pas pu être enregistré.');
    } finally {
      setSaving(false);
    }
  };

  const editQuote = (quote: SalesQuote) => {
    setEditingQuoteId(quote.id);
    setCustomerId(quote.customerId);
    setItems(quote.items.map(({ description, quantity, unitPrice, taxRate }) => ({
      description,
      quantity,
      unitPrice,
      taxRate,
    })));
    setError('');
    setNotice('');
  };

  const convertQuote = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!accessToken || !entityId || !conversionQuoteId) return;
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const response = await fetch(`/api/sales/quotes/${encodeURIComponent(conversionQuoteId)}/convert`, {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + accessToken, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entityId,
          acceptanceConfirmed,
          acceptanceNote,
          dueDate: conversionDueDate || undefined,
        }),
      });
      const payload: unknown = await response.json();
      if (!response.ok) throw new Error(getErrorMessage(payload, 'Le devis n’a pas pu être converti.'));
      setNotice('Facture créée au statut « à contrôler »; elle n’est ni émise ni comptabilisée.');
      setConversionQuoteId(null);
      setAcceptanceConfirmed(false);
      setAcceptanceNote('');
      setConversionDueDate('');
      setRefreshVersion((version) => version + 1);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Le devis n’a pas pu être converti.');
    } finally {
      setSaving(false);
    }
  };

  const convertQuoteToOrder = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!accessToken || !entityId || !conversionQuoteId) return;
    const quote = quotes.find((item) => item.id === conversionQuoteId);
    if (!quote) return;
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const response = await fetch(`/api/sales/quotes/${encodeURIComponent(conversionQuoteId)}/convert-to-order`, {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + accessToken, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entityId,
          acceptanceConfirmed,
          acceptanceNote,
          itemMappings: quote.items.map(({ position }) => ({
            position,
            materialId: orderItemMappings[position] ?? '',
          })),
        }),
      });
      const payload: unknown = await response.json();
      if (!response.ok) throw new Error(getErrorMessage(payload, 'Le devis n’a pas pu être converti en commande.'));
      setNotice('Commande client créée; le devis et sa preuve d’acceptation sont liés.');
      setConversionQuoteId(null);
      setAcceptanceConfirmed(false);
      setAcceptanceNote('');
      setOrderItemMappings({});
      setRefreshVersion((version) => version + 1);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Le devis n’a pas pu être converti en commande.');
    } finally {
      setSaving(false);
    }
  };

  const updateItem = (index: number, patch: Partial<QuoteItemInput>) => {
    setItems((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item));
  };

  return (
    <section aria-labelledby="sales-quotes-title" style={{ display: 'grid', gap: 12 }}>
      <header style={cardStyle}>
        <h2 id="sales-quotes-title" style={{ margin: 0 }}>{text('Devis clients — brouillons')}</h2>
        <p style={{ margin: '6px 0 0', color: '#64748B', fontSize: 13 }}>
          {text('Après acceptation documentée par le client, un devis peut créer une commande client avec association explicite aux articles du catalogue, ou une facture à contrôler.')}
        </p>
      </header>
      {error && <div role="alert" style={{ ...cardStyle, color: '#991B1B', background: '#FEF2F2' }}>{error}</div>}
      {notice && <div role="status" style={{ ...cardStyle, color: '#166534', background: '#F0FDF4' }}>{notice}</div>}
      <form onSubmit={saveQuote} style={{ ...cardStyle, display: 'grid', gap: 12 }}>
        <label style={{ display: 'grid', gap: 4, fontWeight: 700 }}>
          {text('Client')}
          <select required value={customerId} onChange={(event) => setCustomerId(event.target.value)}
            disabled={customers.length === 0} style={{ padding: 8 }}>
            {customers.map((customer) => (
              <option key={customer.id} value={customer.id}>{customer.code} — {customer.name}</option>
            ))}
          </select>
        </label>
        {items.map((item, index) => (
          <fieldset key={index} style={{ border: '1px solid #E2E8F0', borderRadius: 8, padding: 12, display: 'grid', gap: 8 }}>
            <legend>{text('Ligne')} {index + 1}</legend>
            <label style={{ display: 'grid', gap: 4 }}>{text('Description')}
              <input required value={item.description} onChange={(event) => updateItem(index, { description: event.target.value })} />
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 8 }}>
              <label style={{ display: 'grid', gap: 4 }}>{text('Quantité')}
                <input required type="number" min="0.001" step="0.001" value={item.quantity}
                  onChange={(event) => updateItem(index, { quantity: Number(event.target.value) })} />
              </label>
              <label style={{ display: 'grid', gap: 4 }}>{text('Prix unitaire')}
                <input required type="number" min="0" step="0.001" value={item.unitPrice}
                  onChange={(event) => updateItem(index, { unitPrice: Number(event.target.value) })} />
              </label>
              <label style={{ display: 'grid', gap: 4 }}>TVA (%)
                <select value={item.taxRate} onChange={(event) => updateItem(index, { taxRate: Number(event.target.value) })}>
                  {(taxRates?.rates ?? []).map((rate) => (
                    <option key={rate.code} value={rate.rate}>{rate.name} — {rate.rate}%</option>
                  ))}
                </select>
              </label>
            </div>
            {items.length > 1 && (
              <button type="button" onClick={() => setItems((current) => current.filter((_, itemIndex) => itemIndex !== index))}>
                {text('Retirer cette ligne')}
              </button>
            )}
          </fieldset>
        ))}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          <button type="button" onClick={() => setItems((current) => [
            ...current,
            { ...emptyItem, taxRate: taxRates?.rates[0]?.rate ?? 0 },
          ])}>{text('Ajouter une ligne')}</button>
          <button type="submit" disabled={saving || loading || customers.length === 0 || !taxRates?.rates.length}>
            {saving ? text('Enregistrement…') : editingQuoteId ? text('Enregistrer les modifications') : text('Enregistrer comme devis brouillon')}
          </button>
          {editingQuoteId && <button type="button" disabled={saving} onClick={() => {
            setEditingQuoteId(null);
            setCustomerId(customers[0]?.id ?? '');
            setItems([{ ...emptyItem, taxRate: taxRates?.rates[0]?.rate ?? 0 }]);
          }}>{text('Annuler la modification')}</button>}
          <button type="button" disabled={loading} onClick={() => setRefreshVersion((version) => version + 1)}>
            {text('Actualiser')}
          </button>
        </div>
      </form>
      {conversionQuoteId && conversionMode === 'invoice' && (
        <form onSubmit={convertQuote} style={{ ...cardStyle, display: 'grid', gap: 10 }}>
          <h3 style={{ margin: 0 }}>{text('Transformer le devis en facture à contrôler')}</h3>
          <p style={{ margin: 0, color: '#64748B', fontSize: 13 }}>
            {text('La conversion enregistre votre confirmation et référence d’acceptation; conservez la preuve client dans vos procédures documentaires.')}
          </p>
          <label style={{ display: 'grid', gap: 4 }}>{text('Référence ou note d’acceptation documentée')}
            <input required minLength={3} maxLength={500} value={acceptanceNote}
              onChange={(event) => setAcceptanceNote(event.target.value)} />
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input type="checkbox" required checked={acceptanceConfirmed}
              onChange={(event) => setAcceptanceConfirmed(event.target.checked)} />
            {text('Je confirme que le client a accepté ce devis.')}
          </label>
          <label style={{ display: 'grid', gap: 4 }}>{text('Date d’échéance (facultative)')}
            <input type="date" value={conversionDueDate}
              onChange={(event) => setConversionDueDate(event.target.value)} />
          </label>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="submit" disabled={saving || !acceptanceConfirmed || acceptanceNote.trim().length < 3}>
              {saving ? text('Conversion…') : text('Créer la facture à contrôler')}
            </button>
            <button type="button" disabled={saving} onClick={() => {
              setConversionQuoteId(null);
              setAcceptanceConfirmed(false);
              setAcceptanceNote('');
              setConversionDueDate('');
            }}>{text('Annuler')}</button>
          </div>
        </form>
      )}
      {conversionQuoteId && conversionMode === 'order' && (() => {
        const quote = quotes.find((item) => item.id === conversionQuoteId);
        if (!quote) return null;
        return (
          <form onSubmit={convertQuoteToOrder} style={{ ...cardStyle, display: 'grid', gap: 10 }}>
            <h3 style={{ margin: 0 }}>{text('Transformer le devis en commande client')}</h3>
            <p style={{ margin: 0, color: '#64748B', fontSize: 13 }}>
              {text('Associez manuellement chaque ligne à un article du catalogue; le devis ne permet pas de déduire ces références.')}
            </p>
            {quote.items.map((item) => (
              <label key={item.position} style={{ display: 'grid', gap: 4 }}>
                {item.description} — {text('quantité')} <bdi dir="ltr">{item.quantity}</bdi>
                <select required value={orderItemMappings[item.position] ?? ''}
                  onChange={(event) => setOrderItemMappings((current) => ({
                    ...current,
                    [item.position]: event.target.value,
                  }))}>
                  <option value="">{text('Sélectionner un article')}</option>
                  {materials.map((material) => (
                    <option key={material.id} value={material.id}>
                      {material.sku} — {material.name} ({material.unitCode})
                    </option>
                  ))}
                </select>
              </label>
            ))}
            <label style={{ display: 'grid', gap: 4 }}>{text('Référence ou note d’acceptation documentée')}
              <input required minLength={3} maxLength={500} value={acceptanceNote}
                onChange={(event) => setAcceptanceNote(event.target.value)} />
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input type="checkbox" required checked={acceptanceConfirmed}
                onChange={(event) => setAcceptanceConfirmed(event.target.checked)} />
              {text('Je confirme que le client a accepté ce devis.')}
            </label>
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="submit" disabled={saving || !acceptanceConfirmed || acceptanceNote.trim().length < 3
                || quote.items.some(({ position }) => !orderItemMappings[position])}>
                {saving ? text('Conversion…') : text('Créer la commande client')}
              </button>
              <button type="button" disabled={saving} onClick={() => {
                setConversionQuoteId(null);
                setAcceptanceConfirmed(false);
                setAcceptanceNote('');
                setOrderItemMappings({});
              }}>{text('Annuler')}</button>
            </div>
          </form>
        );
      })()}
      <div style={{ ...cardStyle, overflowX: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <h3 style={{ marginTop: 0 }}>{text('Pipeline des devis')}</h3>
          <div role="group" aria-label={text('Affichage des devis')}>
            <button type="button" aria-pressed={viewMode === 'pipeline'} onClick={() => setViewMode('pipeline')}>{text('Pipeline')}</button>{' '}
            <button type="button" aria-pressed={viewMode === 'list'} onClick={() => setViewMode('list')}>{text('Liste')}</button>
          </div>
        </div>
        {viewMode === 'pipeline' ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12 }}>
            {([
              ['draft', 'Brouillons', 'Devis non comptabilisés'],
              ['converted', 'Convertis', 'Factures créées à contrôler'],
              ['ordered', 'Commandes créées', 'Devis acceptés et liés à une commande client'],
            ] as const).map(([stage, label, description]) => (
              <section key={stage} aria-labelledby={`sales-quotes-stage-${stage}`}
                style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 8, padding: 12 }}>
                <h4 id={`sales-quotes-stage-${stage}`} style={{ margin: '0 0 4px' }}>
                  {text(label)} ({pipeline[stage].length})
                </h4>
                <p style={{ margin: '0 0 10px', color: '#64748B', fontSize: 12 }}>{text(description)}</p>
                <div style={{ display: 'grid', gap: 8 }}>
                  {pipeline[stage].map((quote) => (
                    <article key={quote.id} style={{ background: '#FFFFFF', border: '1px solid #CBD5E1', borderRadius: 7, padding: 10 }}>
                      <strong>{quote.quoteNumber}</strong>
                      <div>{quote.customer.name}</div>
                      <div><bdi dir="ltr">{quote.totalAmount.toLocaleString('fr-FR', { minimumFractionDigits: 3, maximumFractionDigits: 3 })} {quote.currencyCode}</bdi></div>
                      <small><bdi dir="ltr">{new Date(quote.createdAt).toLocaleDateString('fr-FR')}</bdi></small>
                      {quote.status === 'DRAFT' ? (
                        <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                          <button type="button" disabled={saving || loading} onClick={() => editQuote(quote)}>{text('Modifier')}</button>
                          <button type="button" disabled={saving || loading} onClick={() => {
                            setEditingQuoteId(null);
                            setConversionQuoteId(quote.id);
                            setConversionMode('invoice');
                            setAcceptanceConfirmed(false);
                            setAcceptanceNote('');
                            setConversionDueDate('');
                            setError('');
                            setNotice('');
                          }}>{text('Convertir en facture')}</button>
                          <button type="button" disabled={saving || loading || materials.length === 0} onClick={() => {
                            setEditingQuoteId(null);
                            setConversionQuoteId(quote.id);
                            setConversionMode('order');
                            setAcceptanceConfirmed(false);
                            setAcceptanceNote('');
                            setOrderItemMappings({});
                            setError('');
                            setNotice('');
                          }}>{text('Convertir en commande')}</button>
                        </div>
                      ) : quote.status === 'ORDERED' ? (
                        <small style={{ display: 'block', marginTop: 6 }}>
                          {text('Commande')} <bdi dir="ltr">{quote.orderConversion?.salesOrder.orderNumber ?? 'indisponible'}</bdi> — {text('acceptation enregistrée')}
                        </small>
                      ) : (
                        <small style={{ display: 'block', marginTop: 6 }}>
                          {text('Facture')} <bdi dir="ltr">{quote.conversion?.invoice.invoiceNumber ?? 'indisponible'}</bdi> — {text('à contrôler')}
                        </small>
                      )}
                    </article>
                  ))}
                  {pipeline[stage].length === 0 && <p style={{ color: '#64748B' }}>{text('Aucun devis dans cette étape.')}</p>}
                </div>
              </section>
            ))}
          </div>
        ) : (
          <>
        {quotes.length === 0
          ? <p>{loading ? text('Chargement…') : text('Aucun devis brouillon.')}</p>
          : <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 13 }}>
            <thead><tr><th>{text('Devis')}</th><th>{text('Client')}</th><th>{text('Créé par / le')}</th><th>{text('Lignes')}</th><th>{text('Total')}</th><th>{text('État')}</th><th>{text('Action')}</th></tr></thead>
            <tbody>{quotes.map((quote) => (
              <tr key={quote.id} style={{ borderTop: '1px solid #E2E8F0' }}>
                <td>{quote.quoteNumber}</td>
                <td>{quote.customer.name}</td>
                <td>{quote.createdByUsername} / <bdi dir="ltr">{new Date(quote.createdAt).toLocaleDateString('fr-FR')}</bdi></td>
                <td><bdi dir="ltr">{quote.items.length}</bdi></td>
                <td><bdi dir="ltr">{quote.totalAmount.toLocaleString('fr-FR', { minimumFractionDigits: 3, maximumFractionDigits: 3 })} {quote.currencyCode}</bdi></td>
                <td>{quote.status === 'CONVERTED'
                  ? <>{text('Converti — facture')} <bdi dir="ltr">{quote.conversion?.invoice.invoiceNumber ?? 'indisponible'}</bdi> ({text(quote.conversion?.invoice.status ?? 'état inconnu')})</>
                  : quote.status === 'ORDERED'
                    ? <>{text('Commande')} <bdi dir="ltr">{quote.orderConversion?.salesOrder.orderNumber ?? 'indisponible'}</bdi></>
                    : text('Brouillon non comptabilisé')}</td>
                <td>{quote.status === 'DRAFT' ? <>
                  <button type="button" disabled={saving || loading} onClick={() => editQuote(quote)}>{text('Modifier')}</button>{' '}
                  <button type="button" disabled={saving || loading} onClick={() => {
                    setEditingQuoteId(null);
                    setConversionQuoteId(quote.id);
                    setConversionMode('invoice');
                    setAcceptanceConfirmed(false);
                    setAcceptanceNote('');
                    setConversionDueDate('');
                    setError('');
                    setNotice('');
                  }}>{text('Convertir en facture')}</button>
                  <button type="button" disabled={saving || loading || materials.length === 0} onClick={() => {
                    setEditingQuoteId(null);
                    setConversionQuoteId(quote.id);
                    setConversionMode('order');
                    setAcceptanceConfirmed(false);
                    setAcceptanceNote('');
                    setOrderItemMappings({});
                    setError('');
                    setNotice('');
                  }}>{text('Convertir en commande')}</button>
                </> : text('Terminé')}</td>
              </tr>
            ))}</tbody>
          </table>}
          </>
        )}
      </div>
    </section>
  );
}
