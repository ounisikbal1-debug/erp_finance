import React, { useEffect, useState } from 'react';
import { exportToCSV } from './exportUtils';
import { toConsolidationReportRows } from './consolidation-report-export';

interface ConsolidationEntity {
  id: string;
  code: string;
  name: string;
  country: { code: string; currencyCode: string };
}

interface ConsolidationMember {
  id: string;
  entityId: string;
  ownershipPercentage: number;
  consolidationMethod: string;
  entity: ConsolidationEntity;
  accountMappings: Array<{
    id: string;
    localAccountCode: string;
    groupAccountCode: string;
    groupAccountDescription: string | null;
  }>;
  fxRates: Array<{ id: string; period: string; rate: number; rateDate: string; source: string }>;
}

interface ConsolidationAdjustment {
  id: string;
  period: string;
  description: string;
  debitAccountCode: string;
  creditAccountCode: string;
  amount: number;
  status: string;
}

interface EliminationConfirmation {
  id: string;
  period: string;
  confirmedByUserId: string;
  confirmedAt: string;
}

interface ConsolidationRun {
  id: string;
  period: string;
  status: string;
  reportingCurrencyCode: string;
  diagnostics: string[];
  createdAt: string;
  lines: Array<{ id: string; groupAccountCode: string; debit: number; credit: number; lineType: string }>;
}

interface ConsolidationGroup {
  id: string;
  name: string;
  reportingCurrencyCode: string;
  eliminationPolicy: string;
  entities: ConsolidationMember[];
  adjustments: ConsolidationAdjustment[];
  eliminationConfirmations: EliminationConfirmation[];
  runs: ConsolidationRun[];
}

const cardStyle: React.CSSProperties = {
  background: '#FFFFFF',
  border: '1px solid #E2E8F0',
  borderRadius: 12,
  padding: '16px 18px',
  boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isGroup(value: unknown): value is ConsolidationGroup {
  return isRecord(value)
    && typeof value.id === 'string'
    && typeof value.name === 'string'
    && typeof value.reportingCurrencyCode === 'string'
    && typeof value.eliminationPolicy === 'string'
    && Array.isArray(value.entities)
    && Array.isArray(value.adjustments)
    && Array.isArray(value.eliminationConfirmations)
    && Array.isArray(value.runs);
}

function isGroupOption(value: unknown): value is { id: string; name: string } {
  return isRecord(value) && typeof value.id === 'string' && typeof value.name === 'string';
}

function errorText(value: unknown): string {
  return isRecord(value) && typeof value.error === 'string' ? value.error : 'Le service de consolidation est indisponible.';
}

function formatAmount(value: number, currencyCode: string): string {
  return `${value.toLocaleString('fr-FR', { minimumFractionDigits: 3, maximumFractionDigits: 3 })} ${currencyCode}`;
}

async function request(path: string, accessToken: string, init?: RequestInit): Promise<unknown> {
  const response = await fetch(`/api/consolidation${path}`, {
    ...init,
    headers: {
      ...(init?.headers ?? {}),
      Authorization: `Bearer ${accessToken}`,
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
    },
  });
  const payload: unknown = await response.json();
  if (!response.ok) throw new Error(errorText(payload));
  return payload;
}

export default function ConsolidationPanel({
  accessToken,
  entityId,
  activeGroupId = null,
}: {
  accessToken: string | null;
  entityId: string | null;
  activeGroupId?: string | null;
}) {
  const [entities, setEntities] = useState<ConsolidationEntity[]>([]);
  const [groups, setGroups] = useState<Array<{ id: string; name: string }>>([]);
  const [group, setGroup] = useState<ConsolidationGroup | null>(null);
  const [selectedGroupId, setSelectedGroupId] = useState('');
  const [groupName, setGroupName] = useState('');
  const [reportingCurrency, setReportingCurrency] = useState('');
  const [memberEntityId, setMemberEntityId] = useState('');
  const [ownershipPercentage, setOwnershipPercentage] = useState('100');
  const [consolidationMethod, setConsolidationMethod] = useState('FULL');
  const [policy, setPolicy] = useState('UNCONFIGURED');
  const [eliminationPeriod, setEliminationPeriod] = useState(new Date().toISOString().slice(0, 7));
  const [mappingEntityId, setMappingEntityId] = useState('');
  const [localAccountCode, setLocalAccountCode] = useState('');
  const [groupAccountCode, setGroupAccountCode] = useState('');
  const [groupAccountDescription, setGroupAccountDescription] = useState('');
  const [fxEntityId, setFxEntityId] = useState('');
  const [fxPeriod, setFxPeriod] = useState(new Date().toISOString().slice(0, 7));
  const [fxRate, setFxRate] = useState('');
  const [fxRateDate, setFxRateDate] = useState('');
  const [fxSource, setFxSource] = useState('');
  const [adjustmentPeriod, setAdjustmentPeriod] = useState(new Date().toISOString().slice(0, 7));
  const [adjustmentDescription, setAdjustmentDescription] = useState('');
  const [adjustmentDebit, setAdjustmentDebit] = useState('');
  const [adjustmentCredit, setAdjustmentCredit] = useState('');
  const [adjustmentAmount, setAdjustmentAmount] = useState('');
  const [runPeriod, setRunPeriod] = useState(new Date().toISOString().slice(0, 7));
  const [run, setRun] = useState<ConsolidationRun | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [refreshVersion, setRefreshVersion] = useState(0);

  const refresh = () => setRefreshVersion((value) => value + 1);

  useEffect(() => {
    if (!accessToken || !entityId) {
      setError(!accessToken
        ? 'Session API indisponible. Reconnectez-vous pour charger la consolidation.'
        : 'Aucune société authentifiée n’est associée à cette session.');
      return;
    }
    const controller = new AbortController();
    const load = async () => {
      setLoading(true);
      setError('');
      try {
        const [entityPayload, groupPayload] = await Promise.all([
          request('/entities', accessToken, { signal: controller.signal }),
          request('/groups', accessToken, { signal: controller.signal }),
        ]);
        if (!Array.isArray(entityPayload) || !Array.isArray(groupPayload)) throw new Error('La réponse des groupes est invalide.');
        if (controller.signal.aborted) return;
        if (!groupPayload.every(isGroupOption)) throw new Error('La réponse des groupes contient une entrée invalide.');
        const availableGroups = groupPayload.filter(isGroupOption);
        setEntities(entityPayload as ConsolidationEntity[]);
        setGroups(availableGroups);
        if (activeGroupId && !availableGroups.some((item) => item.id === activeGroupId)) {
          throw new Error('Le groupe consolidé sélectionné n’appartient pas à la société active.');
        }
        setSelectedGroupId((current) => activeGroupId
          ?? (availableGroups.some((item) => item.id === current)
            ? current
            : (typeof availableGroups[0]?.id === 'string' ? availableGroups[0].id : '')));
      } catch (requestError) {
        if (!controller.signal.aborted) setError(requestError instanceof Error ? requestError.message : 'Chargement de consolidation impossible.');
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };
    void load();
    return () => controller.abort();
  }, [accessToken, activeGroupId, entityId, refreshVersion]);

  useEffect(() => {
    if (!accessToken || !selectedGroupId) {
      setGroup(null);
      setRun(null);
      return;
    }
    const controller = new AbortController();
    const load = async () => {
      try {
        const payload = await request(`/groups/${encodeURIComponent(selectedGroupId)}`, accessToken, { signal: controller.signal });
        if (!isGroup(payload)) throw new Error('La réponse du groupe de consolidation est invalide.');
        if (!controller.signal.aborted) {
          setGroup(payload);
          setPolicy(payload.eliminationPolicy);
          setMemberEntityId((current) => payload.entities.some((member) => member.entityId === current)
            ? current
            : '');
          setRun(payload.runs[0] ?? null);
        }
      } catch (requestError) {
        if (!controller.signal.aborted) setError(requestError instanceof Error ? requestError.message : 'Lecture du groupe impossible.');
      }
    };
    void load();
    return () => controller.abort();
  }, [accessToken, selectedGroupId, refreshVersion]);

  const perform = async (operation: () => Promise<unknown>, success: string) => {
    if (saving) return;
    setSaving(true);
    setError('');
    setNotice('');
    try {
      await operation();
      setNotice(success);
      refresh();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'L’opération de consolidation a échoué.');
    } finally {
      setSaving(false);
    }
  };

  const createGroup = (event: React.FormEvent) => {
    event.preventDefault();
    if (!accessToken) return;
    void perform(async () => {
      const payload = await request('/groups', accessToken, {
        method: 'POST',
        body: JSON.stringify({ name: groupName, reportingCurrencyCode: reportingCurrency }),
      });
      if (!isRecord(payload) || typeof payload.id !== 'string') throw new Error('La réponse du groupe créé est invalide.');
      setGroupName('');
      setSelectedGroupId(payload.id);
    }, 'Groupe de consolidation créé; il est encore incomplet tant que périmètre, mappings et éliminations ne sont pas confirmés.');
  };

  const addMember = (event: React.FormEvent) => {
    event.preventDefault();
    if (!accessToken || !selectedGroupId) return;
    void perform(() => request(`/groups/${encodeURIComponent(selectedGroupId)}/entities`, accessToken, {
      method: 'POST',
      body: JSON.stringify({
        entityId: memberEntityId,
        ownershipPercentage: Number(ownershipPercentage),
        consolidationMethod,
      }),
    }), 'Société ajoutée au périmètre de consolidation.');
  };

  const savePolicy = (event: React.FormEvent) => {
    event.preventDefault();
    if (!accessToken || !selectedGroupId) return;
    void perform(() => request(`/groups/${encodeURIComponent(selectedGroupId)}/elimination-policy`, accessToken, {
      method: 'PUT',
      body: JSON.stringify({ policy, ...(policy === 'NO_ELIMINATIONS_CONFIRMED' ? { period: eliminationPeriod } : {}) }),
    }), policy === 'NO_ELIMINATIONS_CONFIRMED'
      ? `Absence d’éliminations confirmée explicitement pour ${eliminationPeriod}.`
      : 'Mode des ajustements manuels enregistré.');
  };

  const saveAccountMapping = (event: React.FormEvent) => {
    event.preventDefault();
    if (!accessToken || !group || !mappingEntityId) return;
    const member = group.entities.find((item) => item.entityId === mappingEntityId);
    if (!member) return;
    const mappings = [
      ...member.accountMappings.filter((item) => item.localAccountCode !== localAccountCode.trim()),
      {
        localAccountCode: localAccountCode.trim(),
        groupAccountCode: groupAccountCode.trim(),
        groupAccountDescription: groupAccountDescription.trim() || null,
      },
    ];
    void perform(() => request(`/groups/${encodeURIComponent(group.id)}/entities/${encodeURIComponent(mappingEntityId)}/account-mappings`, accessToken, {
      method: 'PUT',
      body: JSON.stringify({ mappings }),
    }), 'Mapping comptable enregistré.');
    setLocalAccountCode('');
    setGroupAccountCode('');
    setGroupAccountDescription('');
  };

  const saveFxRate = (event: React.FormEvent) => {
    event.preventDefault();
    if (!accessToken || !group || !fxEntityId) return;
    void perform(() => request(`/groups/${encodeURIComponent(group.id)}/entities/${encodeURIComponent(fxEntityId)}/fx-rate`, accessToken, {
      method: 'PUT',
      body: JSON.stringify({
        period: fxPeriod,
        rate: Number(fxRate),
        rateDate: fxRateDate,
        source: fxSource,
      }),
    }), 'Taux de conversion daté et sourcé enregistré.');
  };

  const createAdjustment = (event: React.FormEvent) => {
    event.preventDefault();
    if (!accessToken || !group) return;
    void perform(async () => {
      await request(`/groups/${encodeURIComponent(group.id)}/adjustments`, accessToken, {
        method: 'POST',
        body: JSON.stringify({
          period: adjustmentPeriod,
          description: adjustmentDescription,
          debitAccountCode: adjustmentDebit,
          creditAccountCode: adjustmentCredit,
          amount: Number(adjustmentAmount),
        }),
      });
      setAdjustmentDescription('');
      setAdjustmentAmount('');
    }, 'Ajustement d’élimination créé en brouillon; il doit être approuvé avant le calcul.');
  };

  const approveAdjustment = (adjustmentId: string) => {
    if (!accessToken) return;
    void perform(() => request(`/adjustments/${encodeURIComponent(adjustmentId)}/approve`, accessToken, {
      method: 'POST',
      body: JSON.stringify({}),
    }), 'Ajustement approuvé.');
  };

  const runConsolidation = (event: React.FormEvent) => {
    event.preventDefault();
    if (!accessToken || !group) return;
    void perform(async () => {
      const payload = await request(`/groups/${encodeURIComponent(group.id)}/runs`, accessToken, {
        method: 'POST',
        body: JSON.stringify({ period: runPeriod }),
      });
      if (!isRecord(payload) || !Array.isArray(payload.diagnostics) || !Array.isArray(payload.lines)) {
        throw new Error('La réponse du calcul de consolidation est invalide.');
      }
      setRun(payload as unknown as ConsolidationRun);
    }, 'Calcul de consolidation terminé; consultez le statut et les diagnostics ci-dessous.');
  };

  const exportRun = () => {
    if (!run || !group) return;
    exportToCSV(`Consolidation_${group.name}_${run.period}`, [
      { header: 'Période', key: 'period' },
      { header: 'Devise', key: 'currency' },
      { header: 'Statut', key: 'status' },
      { header: 'Type de ligne', key: 'lineType' },
      { header: 'Compte groupe', key: 'groupAccountCode' },
      { header: 'Débit', key: 'debit' },
      { header: 'Crédit', key: 'credit' },
      { header: 'Diagnostic', key: 'diagnostic' },
    ], toConsolidationReportRows(run), {
      moduleName: 'Consolidation de groupe',
      companyName: group.name,
      currency: run.reportingCurrencyCode,
      customDate: run.period,
    });
  };

  const availableEntities = entities.filter((entity) => entity.id !== entityId
    && !group?.entities.some((member) => member.entityId === entity.id));
  const mappingMember = group?.entities.find((member) => member.entityId === mappingEntityId);
  const fxMember = group?.entities.find((member) => member.entityId === fxEntityId);

  return (
    <section style={{ display: 'grid', gap: 14, color: '#0F172A' }}>
      <header style={{ ...cardStyle, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ margin: 0 }}>Consolidation multi-entités</h2>
          <p style={{ margin: '6px 0 0', color: '#64748B', fontSize: 13 }}>
            Écritures POSTED vérifiées individuellement avant agrégation; aucun taux, compte ou retraitement n’est inventé.
          </p>
        </div>
        {groups.length > 0 && (
          <label style={{ display: 'grid', gap: 4 }}>Groupe
            <select
              value={selectedGroupId}
              disabled={Boolean(activeGroupId)}
              onChange={(event) => setSelectedGroupId(event.target.value)}
            >
              {groups.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          </label>
        )}
      </header>

      {error && <div role="alert" style={{ ...cardStyle, background: '#FEF2F2', color: '#991B1B', borderColor: '#FCA5A5' }}>{error}</div>}
      {notice && <div role="status" style={{ ...cardStyle, background: '#F0FDF4', color: '#166534', borderColor: '#86EFAC' }}>{notice}</div>}
      {loading && <div role="status">Chargement des données de groupe…</div>}
      <div role="note" style={{ ...cardStyle, background: '#FFFBEB', color: '#92400E', borderColor: '#FCD34D', fontSize: 13 }}>
        Méthode proportionnelle : quote-part mécanique selon la participation saisie, arrondie au millime par ligne avant conversion. Cette hypothèse de calcul n’est pas une certification comptable. Les intérêts minoritaires, goodwill, méthodes equity et automatisation de transactions intercompagnies ne sont pas calculés.
      </div>

      {!activeGroupId && (
        <form onSubmit={createGroup} style={{ ...cardStyle, display: 'grid', gap: 10 }}>
          <h3 style={{ margin: 0 }}>Créer un groupe</h3>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'end' }}>
            <label style={{ display: 'grid', gap: 4 }}>Nom
              <input required maxLength={100} value={groupName} onChange={(event) => setGroupName(event.target.value)} />
            </label>
            <label style={{ display: 'grid', gap: 4 }}>Devise de reporting
              <input required maxLength={3} pattern="[A-Za-z]{3}" value={reportingCurrency} onChange={(event) => setReportingCurrency(event.target.value.toUpperCase())} />
            </label>
            <button type="submit" disabled={saving || !accessToken}>Créer le groupe</button>
          </div>
        </form>
      )}

      {group && (
        <>
          <section style={{ ...cardStyle, display: 'grid', gap: 12 }}>
            <div>
              <h3 style={{ margin: 0 }}>{group.name} · devise de reporting {group.reportingCurrencyCode}</h3>
              <p style={{ margin: '5px 0 0', color: '#64748B', fontSize: 13 }}>Le calcul sera bloqué tant que les comptes, taux requis et le traitement des éliminations ne sont pas explicitement configurés.</p>
            </div>
            <form onSubmit={addMember} style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'end' }}>
              <label style={{ display: 'grid', gap: 4 }}>Ajouter une société
                <select required value={memberEntityId} onChange={(event) => setMemberEntityId(event.target.value)}>
                  <option value="">Choisir une société</option>
                  {availableEntities.map((entity) => <option key={entity.id} value={entity.id}>{entity.code} · {entity.name} · {entity.country.currencyCode}</option>)}
                </select>
              </label>
              <label style={{ display: 'grid', gap: 4 }}>Participation (%)
                <input required type="number" min="0.001" max="100" step="0.001" value={ownershipPercentage} onChange={(event) => setOwnershipPercentage(event.target.value)} />
              </label>
              <label style={{ display: 'grid', gap: 4 }}>Méthode
                <select value={consolidationMethod} onChange={(event) => setConsolidationMethod(event.target.value)}>
                  <option value="FULL">Intégration globale (100 % des soldes)</option>
                  <option value="PROPORTIONAL">Quote-part proportionnelle</option>
                </select>
              </label>
              <button type="submit" disabled={saving || !memberEntityId}>Ajouter</button>
            </form>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead><tr style={{ textAlign: 'left', borderBottom: '2px solid #E2E8F0' }}>
                  <th style={{ padding: 8 }}>Société</th><th style={{ padding: 8 }}>Pays</th><th style={{ padding: 8 }}>Devise locale</th><th style={{ padding: 8 }}>Participation</th><th style={{ padding: 8 }}>Méthode</th><th style={{ padding: 8 }}>Mappings</th>
                </tr></thead>
                <tbody>{group.entities.map((member) => (
                  <tr key={member.id} style={{ borderBottom: '1px solid #E2E8F0' }}>
                    <td style={{ padding: 8 }}>{member.entity.code} · {member.entity.name}</td>
                    <td style={{ padding: 8 }}>{member.entity.country.code}</td>
                    <td style={{ padding: 8 }}>{member.entity.country.currencyCode}</td>
                    <td style={{ padding: 8 }}>{member.ownershipPercentage}%</td>
                    <td style={{ padding: 8 }}>{member.consolidationMethod === 'PROPORTIONAL' ? 'Quote-part proportionnelle' : 'Intégration globale'}</td>
                    <td style={{ padding: 8 }}>{member.accountMappings.length} compte(s)</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          </section>

          <section style={{ ...cardStyle, display: 'grid', gap: 12 }}>
            <h3 style={{ margin: 0 }}>Mapping des comptes groupe</h3>
            <form onSubmit={saveAccountMapping} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10, alignItems: 'end' }}>
              <label style={{ display: 'grid', gap: 4 }}>Société
                <select required value={mappingEntityId} onChange={(event) => setMappingEntityId(event.target.value)}>
                  <option value="">Choisir une société</option>
                  {group.entities.map((member) => <option key={member.id} value={member.entityId}>{member.entity.code} · {member.entity.name}</option>)}
                </select>
              </label>
              <label style={{ display: 'grid', gap: 4 }}>Compte local comptabilisable
                <input required maxLength={50} value={localAccountCode} onChange={(event) => setLocalAccountCode(event.target.value)} />
              </label>
              <label style={{ display: 'grid', gap: 4 }}>Compte groupe
                <input required maxLength={50} value={groupAccountCode} onChange={(event) => setGroupAccountCode(event.target.value)} />
              </label>
              <label style={{ display: 'grid', gap: 4 }}>Libellé groupe (facultatif)
                <input maxLength={150} value={groupAccountDescription} onChange={(event) => setGroupAccountDescription(event.target.value)} />
              </label>
              <button type="submit" disabled={saving || !mappingEntityId}>Enregistrer le mapping</button>
            </form>
            {mappingMember && (
              <ul style={{ margin: 0, paddingLeft: 20 }}>
                {mappingMember.accountMappings.map((mapping) => (
                  <li key={mapping.id}>{mapping.localAccountCode} → {mapping.groupAccountCode}{mapping.groupAccountDescription ? ` · ${mapping.groupAccountDescription}` : ''}</li>
                ))}
                {mappingMember.accountMappings.length === 0 && <li>Aucun compte mappé pour cette société.</li>}
              </ul>
            )}
          </section>

          {group.entities.some((member) => member.entity.country.currencyCode !== group.reportingCurrencyCode) && (
            <form onSubmit={saveFxRate} style={{ ...cardStyle, display: 'grid', gap: 10 }}>
              <h3 style={{ margin: 0 }}>Taux de conversion requis</h3>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'end' }}>
                <label style={{ display: 'grid', gap: 4 }}>Société étrangère
                  <select required value={fxEntityId} onChange={(event) => setFxEntityId(event.target.value)}>
                    <option value="">Choisir une société</option>
                    {group.entities.filter((member) => member.entity.country.currencyCode !== group.reportingCurrencyCode)
                      .map((member) => <option key={member.id} value={member.entityId}>{member.entity.code} · {member.entity.country.currencyCode}</option>)}
                  </select>
                </label>
                <label style={{ display: 'grid', gap: 4 }}>Période
                  <input required type="month" value={fxPeriod} onChange={(event) => setFxPeriod(event.target.value)} />
                </label>
                <label style={{ display: 'grid', gap: 4 }}>Taux (devise locale → reporting)
                  <input required type="number" min="0.000001" step="any" value={fxRate} onChange={(event) => setFxRate(event.target.value)} />
                </label>
                <label style={{ display: 'grid', gap: 4 }}>Date du taux
                  <input required type="date" value={fxRateDate} onChange={(event) => setFxRateDate(event.target.value)} />
                </label>
                <label style={{ display: 'grid', gap: 4 }}>Source
                  <input required maxLength={120} value={fxSource} onChange={(event) => setFxSource(event.target.value)} />
                </label>
                <button type="submit" disabled={saving || !fxEntityId}>Enregistrer le taux</button>
              </div>
              {fxMember?.fxRates.map((rate) => <p key={rate.id} style={{ margin: 0 }}>{rate.period} · {rate.rate} · {rate.rateDate.slice(0, 10)} · {rate.source}</p>)}
            </form>
          )}

          <form onSubmit={savePolicy} style={{ ...cardStyle, display: 'grid', gap: 10 }}>
            <h3 style={{ margin: 0 }}>Politique d’élimination intercompagnie</h3>
            <p style={{ margin: 0, color: '#64748B', fontSize: 13 }}>Aucune transaction réciproque ne peut être déduite des données actuelles. L’absence d’éliminations doit être confirmée période par période; sinon, choisissez les ajustements manuels approuvés.</p>
            {policy === 'NO_ELIMINATIONS_CONFIRMED' && (
              <p role="status" style={{ margin: 0 }}>
                Période {eliminationPeriod} : {group.eliminationConfirmations.some((item) => item.period === eliminationPeriod)
                  ? 'absence d’éliminations confirmée'
                  : 'confirmation requise'}
              </p>
            )}
            <div style={{ display: 'flex', gap: 10, alignItems: 'end', flexWrap: 'wrap' }}>
              <label style={{ display: 'grid', gap: 4 }}>Politique
                <select value={policy} onChange={(event) => setPolicy(event.target.value)}>
                  <option value="UNCONFIGURED">Non configurée</option>
                  <option value="NO_ELIMINATIONS_CONFIRMED">Aucune élimination requise (confirmation explicite)</option>
                  <option value="MANUAL_ADJUSTMENTS">Ajustements manuels à préparer par période</option>
                </select>
              </label>
              {policy === 'NO_ELIMINATIONS_CONFIRMED' && (
                <label style={{ display: 'grid', gap: 4 }}>Période confirmée
                  <input required type="month" value={eliminationPeriod} onChange={(event) => setEliminationPeriod(event.target.value)} />
                </label>
              )}
              <button type="submit" disabled={saving || policy === 'UNCONFIGURED'}>Enregistrer la politique</button>
            </div>
          </form>

          {group.eliminationPolicy === 'MANUAL_ADJUSTMENTS' && (
            <section style={{ ...cardStyle, display: 'grid', gap: 12 }}>
              <h3 style={{ margin: 0 }}>Ajustements d’élimination de la période</h3>
              <form onSubmit={createAdjustment} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10, alignItems: 'end' }}>
                <label style={{ display: 'grid', gap: 4 }}>Période<input required type="month" value={adjustmentPeriod} onChange={(event) => setAdjustmentPeriod(event.target.value)} /></label>
                <label style={{ display: 'grid', gap: 4 }}>Libellé<input required maxLength={250} value={adjustmentDescription} onChange={(event) => setAdjustmentDescription(event.target.value)} /></label>
                <label style={{ display: 'grid', gap: 4 }}>Compte débité groupe<input required maxLength={50} value={adjustmentDebit} onChange={(event) => setAdjustmentDebit(event.target.value)} /></label>
                <label style={{ display: 'grid', gap: 4 }}>Compte crédité groupe<input required maxLength={50} value={adjustmentCredit} onChange={(event) => setAdjustmentCredit(event.target.value)} /></label>
                <label style={{ display: 'grid', gap: 4 }}>Montant ({group.reportingCurrencyCode})<input required type="number" min="0.001" step="0.001" value={adjustmentAmount} onChange={(event) => setAdjustmentAmount(event.target.value)} /></label>
                <button type="submit" disabled={saving}>Créer en brouillon</button>
              </form>
              {group.adjustments.filter((item) => item.period === adjustmentPeriod).map((adjustment) => (
                <div key={adjustment.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', borderTop: '1px solid #E2E8F0', paddingTop: 8 }}>
                  <span>{adjustment.description} · {adjustment.debitAccountCode} / {adjustment.creditAccountCode} · {formatAmount(adjustment.amount, group.reportingCurrencyCode)} · {adjustment.status}</span>
                  {adjustment.status === 'DRAFT' && <button type="button" disabled={saving} onClick={() => approveAdjustment(adjustment.id)}>Approuver</button>}
                </div>
              ))}
            </section>
          )}

          <form onSubmit={runConsolidation} style={{ ...cardStyle, display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'end' }}>
            <label style={{ display: 'grid', gap: 4 }}>Période à calculer
              <input required type="month" value={runPeriod} onChange={(event) => setRunPeriod(event.target.value)} />
            </label>
            <button type="submit" disabled={saving}>Calculer et enregistrer</button>
          </form>

          {run && (
            <section style={{ ...cardStyle, display: 'grid', gap: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <h3 style={{ margin: 0 }}>Résultat enregistré · {run.period} · {run.status === 'READY' ? 'Prêt (non certifié)' : 'Bloqué'} · {run.reportingCurrencyCode}</h3>
                <button type="button" onClick={exportRun}>Exporter le rapport CSV</button>
              </div>
              {run.diagnostics.map((diagnostic) => <p key={diagnostic} role="alert" style={{ margin: 0, color: '#92400E' }}>{diagnostic}</p>)}
              {run.lines.length > 0 && (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead><tr style={{ textAlign: 'left', borderBottom: '2px solid #E2E8F0' }}>
                      <th style={{ padding: 8 }}>Compte groupe</th><th style={{ padding: 8 }}>Type</th><th style={{ padding: 8, textAlign: 'right' }}>Débit</th><th style={{ padding: 8, textAlign: 'right' }}>Crédit</th>
                    </tr></thead>
                    <tbody>{run.lines.map((line) => (
                      <tr key={line.id} style={{ borderBottom: '1px solid #E2E8F0' }}>
                        <td style={{ padding: 8 }}>{line.groupAccountCode}</td><td style={{ padding: 8 }}>{line.lineType === 'ELIMINATION' ? 'Ajustement manuel' : 'Agrégation'}</td>
                        <td style={{ padding: 8, textAlign: 'right' }}>{formatAmount(line.debit, run.reportingCurrencyCode)}</td><td style={{ padding: 8, textAlign: 'right' }}>{formatAmount(line.credit, run.reportingCurrencyCode)}</td>
                      </tr>
                    ))}</tbody>
                  </table>
                </div>
              )}
            </section>
          )}
        </>
      )}
    </section>
  );
}
