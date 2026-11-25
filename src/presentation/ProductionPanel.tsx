import React, { useEffect, useMemo, useState } from 'react';
import { calculateIndicativeUnitMargin } from '../application/modules/production/cost-summary';

interface ProductionMaterial {
  id: string;
  sku: string;
  name: string;
  quantity: number;
  unitCode: string;
  unitPrice: number;
  costPrice: number;
}

interface ProductionConsumption {
  materialId: string;
  quantity: number;
  warehouseId: string | null;
  warehouse: Pick<ProductionWarehouse, 'id' | 'code' | 'name'> | null;
  material: Pick<ProductionMaterial, 'id' | 'sku' | 'name' | 'unitCode'>;
}

interface ProductionWarehouse {
  id: string;
  code: string;
  name: string;
  stocks: Array<{ quantity: number; material: Pick<ProductionMaterial, 'id' | 'sku' | 'name' | 'unitCode'> }>;
}

interface ProductionOrder {
  id: string;
  orderNumber: string;
  description: string | null;
  outputQuantity: number;
  laborCost: number;
  overheadCost: number;
  scrapQuantity: number;
  scrapReason: string | null;
  status: string;
  createdAt: string;
  postedAt: string | null;
  cancelledAt: string | null;
  cancelledByUsername: string | null;
  cancellationReason: string | null;
  warehouseId: string | null;
  warehouse: Pick<ProductionWarehouse, 'id' | 'code' | 'name'> | null;
  outputMaterial: Pick<ProductionMaterial, 'id' | 'sku' | 'name' | 'unitCode'>;
  consumptions: ProductionConsumption[];
}

interface ProductionData {
  materials: ProductionMaterial[];
  orders: ProductionOrder[];
  warehouses: ProductionWarehouse[];
  currencyCode: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isValidQuantity(value: unknown, unitCode?: string, allowZero = false): value is number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0
    || value > 2_147_483_647 || (!allowZero && value === 0)) return false;
  const milliUnits = Math.round(value * 1000);
  return Math.abs(value * 1000 - milliUnits) <= 1e-7
    && (!unitCode || !['EA', 'BOX', 'PACK'].includes(unitCode.toUpperCase()) || milliUnits % 1000 === 0);
}

function isMaterialReference(value: unknown): value is Pick<ProductionMaterial, 'id' | 'sku' | 'name' | 'unitCode'> {
  return isRecord(value)
    && typeof value.id === 'string'
    && typeof value.sku === 'string'
    && typeof value.name === 'string'
    && typeof value.unitCode === 'string';
}

function isMaterial(value: unknown): value is ProductionMaterial {
  return isRecord(value)
    && typeof value.id === 'string'
    && typeof value.sku === 'string'
    && typeof value.name === 'string'
    && typeof value.unitCode === 'string'
    && typeof value.unitPrice === 'number'
    && Number.isFinite(value.unitPrice)
    && value.unitPrice >= 0
    && typeof value.costPrice === 'number'
    && Number.isFinite(value.costPrice)
    && value.costPrice >= 0
    && isValidQuantity(value.quantity, value.unitCode, true);
}

function isConsumption(value: unknown): value is ProductionConsumption {
  return isRecord(value)
    && typeof value.materialId === 'string'
    && typeof value.quantity === 'number'
    && isValidQuantity(value.quantity, isMaterialReference(value.material) ? value.material.unitCode : undefined)
    && (value.warehouseId === null || typeof value.warehouseId === 'string')
    && (value.warehouse === null || (isRecord(value.warehouse)
      && typeof value.warehouse.id === 'string'
      && typeof value.warehouse.code === 'string'
      && typeof value.warehouse.name === 'string'))
    && isMaterialReference(value.material);
}

function isOrder(value: unknown): value is ProductionOrder {
  return isRecord(value)
    && typeof value.id === 'string'
    && typeof value.orderNumber === 'string'
    && (value.description === null || typeof value.description === 'string')
    && typeof value.outputQuantity === 'number'
    && isValidQuantity(value.outputQuantity, isMaterialReference(value.outputMaterial) ? value.outputMaterial.unitCode : undefined)
    && typeof value.laborCost === 'number'
    && Number.isFinite(value.laborCost)
    && value.laborCost >= 0
    && typeof value.overheadCost === 'number'
    && Number.isFinite(value.overheadCost)
    && value.overheadCost >= 0
    && typeof value.scrapQuantity === 'number'
    && isValidQuantity(value.scrapQuantity, isMaterialReference(value.outputMaterial) ? value.outputMaterial.unitCode : undefined, true)
    && (value.scrapReason === null || typeof value.scrapReason === 'string')
    && typeof value.status === 'string'
    && typeof value.createdAt === 'string'
    && (value.postedAt === null || typeof value.postedAt === 'string')
    && (value.cancelledAt === null || typeof value.cancelledAt === 'string')
    && (value.cancelledByUsername === null || typeof value.cancelledByUsername === 'string')
    && (value.cancellationReason === null || typeof value.cancellationReason === 'string')
    && (value.warehouseId === null || typeof value.warehouseId === 'string')
    && (value.warehouse === null || (isRecord(value.warehouse)
      && typeof value.warehouse.id === 'string'
      && typeof value.warehouse.code === 'string'
      && typeof value.warehouse.name === 'string'))
    && isMaterialReference(value.outputMaterial)
    && Array.isArray(value.consumptions)
    && value.consumptions.every(isConsumption);
}

function isWarehouse(value: unknown): value is ProductionWarehouse {
  return isRecord(value)
    && typeof value.id === 'string'
    && typeof value.code === 'string'
    && typeof value.name === 'string'
    && Array.isArray(value.stocks)
    && value.stocks.every((stock) => isRecord(stock)
      && typeof stock.quantity === 'number'
      && isValidQuantity(stock.quantity, isMaterialReference(stock.material) ? stock.material.unitCode : undefined, true)
      && isMaterialReference(stock.material));
}

function isProductionData(value: unknown): value is ProductionData {
  if (!isRecord(value)) return false;
  const data = value;
  return Array.isArray(data.materials)
    && data.materials.every(isMaterial)
    && Array.isArray(data.orders)
    && data.orders.every(isOrder)
    && Array.isArray(data.warehouses)
    && data.warehouses.every(isWarehouse)
    && typeof data.currencyCode === 'string';
}

function displayDate(value: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString('fr-FR');
}

export default function ProductionPanel({
  accessToken,
  entityId,
}: {
  accessToken: string | null;
  entityId: string | null;
}) {
  const [data, setData] = useState<ProductionData | null>(null);
  const [orderNumber, setOrderNumber] = useState('');
  const [description, setDescription] = useState('');
  const [outputMaterialId, setOutputMaterialId] = useState('');
  const [warehouseId, setWarehouseId] = useState('');
  const [outputQuantity, setOutputQuantity] = useState('1');
  const [laborCost, setLaborCost] = useState('0');
  const [overheadCost, setOverheadCost] = useState('0');
  const [scrapQuantity, setScrapQuantity] = useState('0');
  const [scrapReason, setScrapReason] = useState('');
  const [consumptions, setConsumptions] = useState<Array<{ materialId: string; quantity: string; warehouseId: string }>>([
    { materialId: '', quantity: '1', warehouseId: '' },
  ]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [activeOrderId, setActiveOrderId] = useState<string | null>(null);
  const [cancellationReasons, setCancellationReasons] = useState<Record<string, string>>({});
  const [refreshVersion, setRefreshVersion] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setData(null);
    setError('');
    if (!accessToken || !entityId) {
      setLoading(false);
      setError(!accessToken
        ? 'Session API indisponible. Reconnectez-vous pour charger les ordres de fabrication.'
        : 'Aucune société authentifiée n’est associée à cette session.');
      return () => controller.abort();
    }

    const loadData = async () => {
      setLoading(true);
      try {
        const response = await fetch('/api/production/data', {
          headers: { Authorization: `Bearer ${accessToken}` },
          signal: controller.signal,
        });
        const payload: unknown = await response.json();
        if (!response.ok) {
          const message = payload && typeof payload === 'object' && 'error' in payload
            && typeof payload.error === 'string'
            ? payload.error
            : 'Impossible de charger les ordres de fabrication.';
          throw new Error(message);
        }
        if (!isProductionData(payload)) throw new Error('La réponse de production est invalide.');
        if (!controller.signal.aborted) {
          const nextOutputMaterialId = outputMaterialId && payload.materials.some((item) => item.id === outputMaterialId)
            ? outputMaterialId
            : payload.materials[0]?.id ?? '';
          const nextWarehouseId = warehouseId && payload.warehouses.some((item) => item.id === warehouseId)
            ? warehouseId
            : payload.warehouses[0]?.id ?? '';
          setData(payload);
          setOutputMaterialId(nextOutputMaterialId);
          setWarehouseId(nextWarehouseId);
          setConsumptions((current) => current.map((line, index) => ({
            ...line,
            warehouseId: line.warehouseId && payload.warehouses.some((item) => item.id === line.warehouseId)
              ? line.warehouseId
              : nextWarehouseId,
            materialId: line.materialId
              && line.materialId !== nextOutputMaterialId
              && payload.materials.some((item) => item.id === line.materialId)
              ? line.materialId
              : payload.materials.find((item) => item.id !== nextOutputMaterialId
                && current.every((otherLine, otherIndex) => otherIndex === index || otherLine.materialId !== item.id))?.id ?? '',
          })));
        }
      } catch (requestError) {
        if (!controller.signal.aborted) {
          setError(requestError instanceof Error ? requestError.message : 'Le module production est indisponible.');
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };

    void loadData();
    return () => controller.abort();
  }, [accessToken, entityId, refreshVersion]);

  const usableMaterials = useMemo(
    () => data?.materials ?? [],
    [data],
  );
  const availableConsumables = (lineIndex: number) => usableMaterials.filter((material) =>
    material.id !== outputMaterialId
      && consumptions.every((line, index) => index === lineIndex || line.materialId !== material.id));
  const warehouseQuantity = (materialId: string, sourceWarehouseId: string) => data?.warehouses
    .find((warehouse) => warehouse.id === sourceWarehouseId)?.stocks
    .find((stock) => stock.material.id === materialId)?.quantity ?? 0;

  const updateConsumption = (index: number, patch: Partial<{ materialId: string; quantity: string; warehouseId: string }>) => {
    setConsumptions((current) => current.map((line, lineIndex) => lineIndex === index
      ? { ...line, ...patch }
      : line));
  };

  const refresh = () => setRefreshVersion((version) => version + 1);

  const submitOrder = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!accessToken || saving || !data) return;
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const response = await fetch('/api/production/orders', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          orderNumber,
          description,
          outputMaterialId,
          warehouseId,
          outputQuantity: Number(outputQuantity),
          laborCost: Number(laborCost),
          overheadCost: Number(overheadCost),
          scrapQuantity: Number(scrapQuantity),
          scrapReason,
          consumptions: consumptions.map((line) => ({
            materialId: line.materialId,
            quantity: Number(line.quantity),
            warehouseId: line.warehouseId || warehouseId,
          })),
        }),
      });
      const payload: unknown = await response.json();
      if (!response.ok) {
        const message = payload && typeof payload === 'object' && 'error' in payload
          && typeof payload.error === 'string'
          ? payload.error
          : 'L’ordre de fabrication n’a pas pu être enregistré.';
        throw new Error(message);
      }
      setOrderNumber('');
      setDescription('');
      setOutputQuantity('1');
      setLaborCost('0');
      setOverheadCost('0');
      setScrapQuantity('0');
      setScrapReason('');
      setConsumptions([{ materialId: '', quantity: '1', warehouseId }]);
      setNotice('Ordre enregistré en brouillon. Le stock ne changera qu’après confirmation.');
      refresh();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Erreur lors de l’enregistrement de l’ordre.');
    } finally {
      setSaving(false);
    }
  };

  const postOrder = async (order: ProductionOrder) => {
    if (!accessToken || activeOrderId) return;
    setActiveOrderId(order.id);
    setError('');
    setNotice('');
    try {
      const response = await fetch(`/api/production/orders/${encodeURIComponent(order.id)}/post`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({}),
      });
      const payload: unknown = await response.json();
      if (!response.ok) {
        const message = payload && typeof payload === 'object' && 'error' in payload
          && typeof payload.error === 'string'
          ? payload.error
          : 'L’ordre de fabrication n’a pas pu être confirmé.';
        throw new Error(message);
      }
      setNotice(`Ordre ${order.orderNumber} confirmé; les consommations et la production ont été appliquées au stock.`);
      refresh();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Erreur lors de la confirmation de l’ordre.');
    } finally {
      setActiveOrderId(null);
    }
  };

  const cancelOrder = async (order: ProductionOrder) => {
    const reason = cancellationReasons[order.id]?.trim() ?? '';
    if (!accessToken || activeOrderId || reason.length < 5) return;
    setActiveOrderId(order.id);
    setError('');
    setNotice('');
    try {
      const response = await fetch(`/api/production/orders/${encodeURIComponent(order.id)}/cancel`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ reason }),
      });
      const payload: unknown = await response.json();
      if (!response.ok) {
        const message = payload && typeof payload === 'object' && 'error' in payload
          && typeof payload.error === 'string'
          ? payload.error
          : 'L’ordre de fabrication n’a pas pu être annulé.';
        throw new Error(message);
      }
      setCancellationReasons((current) => ({ ...current, [order.id]: '' }));
      setNotice(`Ordre ${order.orderNumber} annulé. Aucun mouvement de stock n’a été appliqué.`);
      refresh();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Erreur lors de l’annulation de l’ordre.');
    } finally {
      setActiveOrderId(null);
    }
  };

  const inputStyle: React.CSSProperties = {
    width: '100%',
    minHeight: 38,
    padding: '8px 10px',
    border: '1px solid #CBD5E1',
    borderRadius: 6,
    background: '#FFFFFF',
    color: '#0F172A',
    boxSizing: 'border-box',
  };

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <header>
        <h2 style={{ margin: '0 0 6px', color: '#0F172A' }}>Ordres de fabrication</h2>
        <p style={{ margin: 0, color: '#475569' }}>
          Saisissez les matières, dépôts d’approvisionnement, coûts directs/indirects et rebuts. La confirmation poste tous les mouvements et coûts dans une transaction.
        </p>
      </header>

      <div role="note" style={{ background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 8, color: '#92400E', padding: '10px 12px' }}>
        La confirmation applique les consommations et la production dans une transaction unique, met à jour le coût unitaire moyen pondéré des produits,
        et comptabilise le transfert avec les comptes configurés (311, 33). Les groupements de comptes de démonstration ne certifient pas le plan local;
        les brouillons peuvent être annulés avec motif et audit; les ordres comptabilisés ne peuvent pas être annulés depuis ce parcours.
      </div>
      <section aria-labelledby="production-cost-summary-title" style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 10, padding: 14 }}>
        <h3 id="production-cost-summary-title" style={{ margin: '0 0 6px' }}>Écart unitaire indicatif</h3>
        <p style={{ margin: '0 0 10px', color: '#64748B', fontSize: 13 }}>
          Prix de vente saisi moins coût unitaire moyen enregistré. Pour les produits fabriqués, le coût moyen inclut les consommations, la main-d’Å“uvre et les frais indirects saisis dans les ordres confirmés; ce n’est pas une marge comptable complète.
        </p>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead><tr style={{ textAlign: 'left', borderBottom: '2px solid #E2E8F0' }}>
              <th style={{ padding: 8 }}>Article</th>
              <th style={{ padding: 8, textAlign: 'right' }}>Prix saisi</th>
              <th style={{ padding: 8, textAlign: 'right' }}>Coût moyen</th>
              <th style={{ padding: 8, textAlign: 'right' }}>Écart / unité</th>
            </tr></thead>
            <tbody>{(data?.materials ?? []).map((material) => {
              const margin = calculateIndicativeUnitMargin(material.unitPrice, material.costPrice);
              return (
                <tr key={material.id} style={{ borderTop: '1px solid #E2E8F0' }}>
                  <td style={{ padding: 8 }}>{material.sku} — {material.name} ({material.unitCode})</td>
                  <td style={{ padding: 8, textAlign: 'right' }}>{material.unitPrice.toLocaleString('fr-FR', { minimumFractionDigits: 3, maximumFractionDigits: 3 })} {data?.currencyCode}</td>
                  <td style={{ padding: 8, textAlign: 'right' }}>{material.costPrice.toLocaleString('fr-FR', { minimumFractionDigits: 3, maximumFractionDigits: 3 })} {data?.currencyCode}</td>
                  <td style={{ padding: 8, textAlign: 'right' }}>{margin === null ? 'Indisponible' : `${margin.toLocaleString('fr-FR', { minimumFractionDigits: 3, maximumFractionDigits: 3 })} ${data?.currencyCode}`}</td>
                </tr>
              );
            })}</tbody>
          </table>
        </div>
      </section>
      {error && <div role="alert" style={{ color: '#991B1B', background: '#FEF2F2', padding: 10, borderRadius: 6 }}>{error}</div>}
      {notice && <div role="status" style={{ color: '#166534', background: '#F0FDF4', padding: 10, borderRadius: 6 }}>{notice}</div>}

      <form onSubmit={submitOrder} style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 10, padding: 16 }}>
        <h3 style={{ marginTop: 0 }}>Nouvel ordre brouillon</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 12 }}>
          <label>
            N° d’ordre
            <input required maxLength={50} value={orderNumber} onChange={(event) => setOrderNumber(event.target.value)} style={inputStyle} />
          </label>
          <label>
            Article produit
            <select required value={outputMaterialId} onChange={(event) => setOutputMaterialId(event.target.value)} style={inputStyle}>
              <option value="">Sélectionner un article</option>
              {usableMaterials.map((material) => (
                <option key={material.id} value={material.id}>{material.sku} — {material.name}</option>
              ))}
            </select>
          </label>
          <label>
            Dépôt de production
            <select required value={warehouseId} onChange={(event) => setWarehouseId(event.target.value)} style={inputStyle}>
              <option value="">Sélectionner un dépôt</option>
              {data?.warehouses.map((warehouse) => (
                <option key={warehouse.id} value={warehouse.id}>{warehouse.code} — {warehouse.name}</option>
              ))}
            </select>
          </label>
          <label>
            Quantité produite (bonne production)
            <input required type="number" min="0.001" step={['EA', 'BOX', 'PACK'].includes(data?.materials.find((material) => material.id === outputMaterialId)?.unitCode ?? '') ? '1' : '0.001'} value={outputQuantity} onChange={(event) => setOutputQuantity(event.target.value)} style={inputStyle} />
          </label>
          <label>
              Main-d’Å“uvre ({data?.currencyCode ?? '—'})
              <input required type="number" min="0" step="0.001" value={laborCost} onChange={(event) => setLaborCost(event.target.value)} style={inputStyle} />
            </label>
            <label>
              Frais indirects ({data?.currencyCode ?? '—'})
              <input required type="number" min="0" step="0.001" value={overheadCost} onChange={(event) => setOverheadCost(event.target.value)} style={inputStyle} />
            </label>
            <label>
              Quantité rebutée
              <input required type="number" min="0" step={['EA', 'BOX', 'PACK'].includes(data?.materials.find((material) => material.id === outputMaterialId)?.unitCode ?? '') ? '1' : '0.001'} value={scrapQuantity} onChange={(event) => setScrapQuantity(event.target.value)} style={inputStyle} />
            </label>
            {Number(scrapQuantity) > 0 && (
              <label>
                Motif du rebut
                <input required minLength={5} maxLength={500} value={scrapReason} onChange={(event) => setScrapReason(event.target.value)} style={inputStyle} />
              </label>
            )}
            <label>
            Description
            <input maxLength={500} value={description} onChange={(event) => setDescription(event.target.value)} style={inputStyle} />
          </label>
        </div>

        <div style={{ marginTop: 16 }}>
          <h4 style={{ margin: '0 0 8px' }}>Consommations prévues</h4>
          {consumptions.map((line, index) => (
            <div key={index} style={{ display: 'grid', gridTemplateColumns: 'minmax(190px, 2fr) minmax(150px, 1.3fr) minmax(110px, 1fr) auto', gap: 8, marginBottom: 8 }}>
              <label>
                <span style={{ display: 'block', marginBottom: 4 }}>Matière {index + 1}</span>
                <select
                  required
                  value={line.materialId}
                  onChange={(event) => updateConsumption(index, { materialId: event.target.value })}
                  style={inputStyle}
                >
                  <option value="">Sélectionner une matière</option>
                  {availableConsumables(index).map((material) => (
                    <option key={material.id} value={material.id}>
                      {material.sku} — {material.name} (total : {material.quantity})
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span style={{ display: 'block', marginBottom: 4 }}>Dépôt matière</span>
                <select
                  required
                  value={line.warehouseId}
                  onChange={(event) => updateConsumption(index, { warehouseId: event.target.value })}
                  style={inputStyle}
                >
                  <option value="">Sélectionner un dépôt</option>
                  {data?.warehouses.map((warehouse) => (
                    <option key={warehouse.id} value={warehouse.id}>
                      {warehouse.code} — {warehouse.name} ({line.materialId ? warehouseQuantity(line.materialId, warehouse.id) : 0})
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span style={{ display: 'block', marginBottom: 4 }}>Quantité</span>
                <input required type="number" min="0.001" step={['EA', 'BOX', 'PACK'].includes(data?.materials.find((material) => material.id === line.materialId)?.unitCode ?? '') ? '1' : '0.001'} value={line.quantity} onChange={(event) => updateConsumption(index, { quantity: event.target.value })} style={inputStyle} />
              </label>
              <button
                type="button"
                disabled={consumptions.length === 1}
                onClick={() => setConsumptions((current) => current.filter((_, lineIndex) => lineIndex !== index))}
                style={{ alignSelf: 'end', minHeight: 38 }}
              >
                Retirer
              </button>
            </div>
          ))}
          <button
            type="button"
            disabled={!usableMaterials.some((material) => material.id !== outputMaterialId
              && consumptions.every((line) => line.materialId !== material.id))}
            onClick={() => setConsumptions((current) => [...current, { materialId: '', quantity: '1', warehouseId }])}
          >
            Ajouter une matière
          </button>
        </div>
        <button type="submit" disabled={saving || loading || usableMaterials.length < 2 || !warehouseId} style={{ marginTop: 14, padding: '9px 14px' }}>
          {saving ? 'Enregistrement…' : 'Enregistrer en brouillon'}
        </button>
        {!loading && data?.materials.length === 0 && (
          <p role="status" style={{ color: '#92400E', marginBottom: 0 }}>
            Au moins deux articles distincts doivent être enregistrés pour cette société (produit et matière consommée). Créez-les d’abord dans le module Stocks.
          </p>
        )}
        {!loading && data?.warehouses.length === 0 && (
          <p role="status" style={{ color: '#92400E', marginBottom: 0 }}>
            Créez un dépôt dans le module Stocks avant d’enregistrer un ordre de fabrication.
          </p>
        )}
      </form>

      <section style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 10, padding: 16, overflowX: 'auto' }}>
        <h3 style={{ marginTop: 0 }}>Historique des ordres</h3>
        {loading && <p role="status">Chargement des données persistées…</p>}
        {!loading && data && data.orders.length === 0 && <p>Aucun ordre de fabrication enregistré pour cette société.</p>}
        {!loading && data && data.orders.length > 0 && (
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 1100, textAlign: 'left', fontSize: '0.86rem' }}>
            <thead>
              <tr style={{ background: '#F8FAFC' }}>
                <th style={{ padding: 9 }}>Ordre</th>
                <th style={{ padding: 9 }}>Créé le</th>
                <th style={{ padding: 9 }}>Produit</th>
                <th style={{ padding: 9 }}>Dépôt</th>
                <th style={{ padding: 9 }}>Coûts et rebuts</th>
                <th style={{ padding: 9 }}>Consommations</th>
                <th style={{ padding: 9 }}>Statut</th>
                <th style={{ padding: 9 }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {data.orders.map((order) => (
                <tr key={order.id} style={{ borderTop: '1px solid #E2E8F0' }}>
                  <td style={{ padding: 9 }}>
                    <strong>{order.orderNumber}</strong>
                    {order.description && <div style={{ color: '#64748B' }}>{order.description}</div>}
                  </td>
                  <td style={{ padding: 9 }}>{displayDate(order.createdAt)}</td>
                  <td style={{ padding: 9 }}>{order.outputMaterial.sku} — {order.outputMaterial.name}<br />Bonne production : {order.outputQuantity}</td>
                  <td style={{ padding: 9 }}>{order.warehouse ? `${order.warehouse.code} — ${order.warehouse.name}` : 'Non précisé (ancien ordre)'}</td>
                  <td style={{ padding: 9 }}>
                    Main-d’Å“uvre : {order.laborCost} {data.currencyCode}<br />
                    Frais indirects : {order.overheadCost} {data.currencyCode}<br />
                    Rebut : {order.scrapQuantity}{order.scrapReason ? <><br />Motif : {order.scrapReason}</> : ''}
                  </td>
                  <td style={{ padding: 9 }}>
                    {order.consumptions.map((line) => (
                      <div key={line.materialId}>
                        {line.material.sku} — {line.material.name}: {line.quantity}
                        {line.warehouse ? ` · ${line.warehouse.code}` : ''}
                      </div>
                    ))}
                  </td>
                  <td style={{ padding: 9 }}>
                    {order.status === 'POSTED'
                      ? `Confirmé (${displayDate(order.postedAt)})`
                      : order.status === 'CANCELLED'
                        ? <>Annulé ({displayDate(order.cancelledAt)})<br />Par : {order.cancelledByUsername ?? '—'}<br />Motif : {order.cancellationReason ?? '—'}</>
                        : 'Brouillon'}
                  </td>
                  <td style={{ padding: 9 }}>
                    {order.status === 'DRAFT' ? (
                      <div style={{ display: 'grid', gap: 6 }}>
                        <button type="button" disabled={activeOrderId !== null} onClick={() => void postOrder(order)}>
                          {activeOrderId === order.id ? 'Traitement…' : 'Confirmer'}
                        </button>
                        <textarea
                          required
                          maxLength={500}
                          aria-label={`Motif d’annulation de ${order.orderNumber}`}
                          placeholder="Motif d’annulation (5 à 500 caractères)"
                          value={cancellationReasons[order.id] ?? ''}
                          onChange={(event) => setCancellationReasons((current) => ({
                            ...current,
                            [order.id]: event.target.value,
                          }))}
                          style={{ ...inputStyle, minHeight: 62 }}
                        />
                        <button
                          type="button"
                          disabled={activeOrderId !== null || (cancellationReasons[order.id]?.trim().length ?? 0) < 5}
                          onClick={() => void cancelOrder(order)}
                        >
                          Annuler le brouillon
                        </button>
                      </div>
                    ) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
