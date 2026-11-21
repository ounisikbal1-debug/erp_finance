import React, { useEffect, useState } from 'react';
import { FINANCIAL_ACCOUNT_CATEGORIES, type FinancialAccountCategory } from '../application/modules/advanced-finance/financial-categories';
import CustomsTariffImportPanel from './CustomsTariffImportPanel';
import CountryTaxRulesPanel from './CountryTaxRulesPanel';

interface CountryConfiguration {
  id: string;
  code: string;
  name: string;
  currencyCode: string;
  currencySymbol: string;
  stampDuty: number | null;
  corporateTax: number | null;
  salesReceivableAccountCode: string | null;
  salesRevenueAccountCode: string | null;
  salesVatAccountCode: string | null;
  salesStampDutyAccountCode: string | null;
  stockAssetAccountCode: string | null;
  stockAdjustmentAccountCode: string | null;
  productionWipAccountCode: string | null;
  productionLaborAccountCode: string | null;
  productionOverheadAccountCode: string | null;
  purchaseExpenseAccountCode: string | null;
  purchaseVatAccountCode: string | null;
  realizedFxGainAccountCode: string | null;
  realizedFxLossAccountCode: string | null;
  unrealizedFxGainAccountCode: string | null;
  unrealizedFxLossAccountCode: string | null;
  isDefault: boolean;
  payrollConfig: Record<string, number> | null;
  taxRates: Array<{ code: string; name: string; rate: number; isDefault: boolean; purchaseVatRecoverable: boolean }>;
  taxBrackets: Array<{ order: number; minAmount: number; maxAmount: number | null; rate: number }>;
  accounts: ChartAccount[];
}

interface ChartAccount {
  code: string;
  description: string;
  classNumber: number;
  type: string;
  financialCategory: FinancialAccountCategory | null;
  parentCode: string | null;
  isPostingAllowed: boolean;
}

interface CountrySummary {
  code: string;
  name: string;
}

interface CountryRubrique {
  id: string;
  code: string;
  label: string;
  category: string;
  defaultAmount: number;
}

interface RegulatoryRevision {
  id: string;
  configType: string;
  version: number;
  effectiveFrom: string;
  effectiveTo: string | null;
  source: string;
  status: string;
  snapshot: string;
  createdBy: string;
  reviewer: string | null;
  reviewNote: string | null;
  approvedBy: string | null;
  approvalNote: string | null;
  periodClosedAt: string | null;
  periodClosedBy: string | null;
  periodClosureNote: string | null;
  retroactiveConfirmed: boolean;
}

const PAYROLL_FIELDS = [
  'employeeCnssRate',
  'employerCnssRate',
  'employerWorkAccidentRate',
  'foprolosRate',
  'cssRate',
  'profExpensesRate',
  'profExpensesMaxCap',
  'headOfFamilyDeduction',
  'childDeduction',
  'parentDeduction',
] as const;

const emptyCountry = {
  code: '',
  name: '',
  currencyCode: '',
  currencySymbol: '',
  stampDuty: '',
  corporateTax: '',
};

function toJson(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

async function readResponse(response: Response): Promise<unknown> {
  const payload: unknown = await response.json();
  if (!response.ok) {
    const message = payload && typeof payload === 'object' && 'error' in payload && typeof payload.error === 'string'
      ? payload.error
      : `La requête a échoué (${response.status}).`;
    throw new Error(message);
  }
  return payload;
}

function parseJson(text: string, label: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Le JSON de ${label} est invalide.`);
  }
}

function sortChartAccounts(accounts: readonly ChartAccount[]): ChartAccount[] {
  const byCode = new Map(accounts.map((account) => [account.code, account]));
  return [...accounts].sort((a, b) => a.classNumber - b.classNumber
    || chartAccountDepth(a, byCode) - chartAccountDepth(b, byCode)
    || a.code.localeCompare(b.code));
}

function chartAccountDepth(account: ChartAccount, accountsByCode: ReadonlyMap<string, ChartAccount>): number {
  let depth = 0;
  let parentCode = account.parentCode;
  while (parentCode && depth < accountsByCode.size) {
    depth += 1;
    parentCode = accountsByCode.get(parentCode)?.parentCode ?? null;
  }
  return depth;
}

function accountClassPresentation(classNumber: number) {
  if (classNumber === 3) {
    return { label: 'Actif · classe 3', background: '#F0FDFA', border: '#99F6E4', color: '#115E59' };
  }
  if (classNumber === 6) {
    return { label: 'Charge · classe 6', background: '#FFF7ED', border: '#FDBA74', color: '#9A3412' };
  }
  return { label: `Classe ${classNumber}`, background: '#F8FAFC', border: '#CBD5E1', color: '#334155' };
}

export default function CountryConfigurationPanel({
  accessToken,
  isAdmin,
}: {
  accessToken: string | null;
  isAdmin: boolean;
}) {
  const [countries, setCountries] = useState<CountrySummary[]>([]);
  const [country, setCountry] = useState<CountryConfiguration | null>(null);
  const [selectedCode, setSelectedCode] = useState('TN');
  const [profile, setProfile] = useState({
    name: '',
    currencyCode: '',
    currencySymbol: '',
    stampDuty: '',
    corporateTax: '',
    salesReceivableAccountCode: '',
    salesRevenueAccountCode: '',
    salesVatAccountCode: '',
    salesStampDutyAccountCode: '',
    stockAssetAccountCode: '',
    stockAdjustmentAccountCode: '',
    productionWipAccountCode: '',
    productionLaborAccountCode: '',
    productionOverheadAccountCode: '',
    purchaseExpenseAccountCode: '',
    purchaseVatAccountCode: '',
    realizedFxGainAccountCode: '',
    realizedFxLossAccountCode: '',
    unrealizedFxGainAccountCode: '',
    unrealizedFxLossAccountCode: '',
  });
  const [editableTaxRates, setEditableTaxRates] = useState<Array<{
    code: string;
    name: string;
    rate: number;
    isDefault: boolean;
    purchaseVatRecoverable: boolean;
  }>>([]);
  const [editableTaxBrackets, setEditableTaxBrackets] = useState<Array<{
    order: number;
    minAmount: number;
    maxAmount: number | null;
    rate: number;
  }>>([]);
  const [taxRates, setTaxRates] = useState('[]');
  const [taxBrackets, setTaxBrackets] = useState('[]');
  const [payrollConfig, setPayrollConfig] = useState('{}');
  const [accounts, setAccounts] = useState('[]');
  const [rubriques, setRubriques] = useState('[]');
  const [revisions, setRevisions] = useState<RegulatoryRevision[]>([]);
  const [revisionDraft, setRevisionDraft] = useState({
    configType: 'PROFILE',
    effectiveFrom: new Date().toISOString().slice(0, 10),
    effectiveTo: '',
    source: '',
    supersedesRevisionId: '',
    closureNote: '',
    retroactiveConfirmed: false,
  });
  const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({});
  const [newCountry, setNewCountry] = useState(emptyCountry);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const headers = () => ({
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
  });

  const loadCountries = async (preferredCode = selectedCode) => {
    const payload = await readResponse(await fetch('/api/admin/countries', { headers: headers() }));
    if (!Array.isArray(payload)) throw new Error('La liste des pays reçue est invalide.');
    const list = payload as CountrySummary[];
    setCountries(list);
    const nextCode = list.some((item) => item.code === preferredCode)
      ? preferredCode
      : list.some((item) => item.code === 'TN') ? 'TN' : list[0]?.code ?? '';
    setSelectedCode(nextCode);
    if (nextCode) await loadCountry(nextCode);
  };

  const loadCountry = async (code: string) => {
    const payload = await readResponse(await fetch(`/api/admin/countries/${encodeURIComponent(code)}`, {
      headers: headers(),
    }));
    if (!payload || typeof payload !== 'object' || !('code' in payload)) {
      throw new Error('La configuration du pays reçue est invalide.');
    }
    const data = payload as CountryConfiguration;
    setCountry(data);
    setProfile({
      name: data.name,
      currencyCode: data.currencyCode,
      currencySymbol: data.currencySymbol,
      stampDuty: data.stampDuty === null ? '' : String(data.stampDuty),
      corporateTax: data.corporateTax === null ? '' : String(data.corporateTax),
      salesReceivableAccountCode: data.salesReceivableAccountCode ?? '',
      salesRevenueAccountCode: data.salesRevenueAccountCode ?? '',
      salesVatAccountCode: data.salesVatAccountCode ?? '',
      salesStampDutyAccountCode: data.salesStampDutyAccountCode ?? '',
      stockAssetAccountCode: data.stockAssetAccountCode ?? '',
      stockAdjustmentAccountCode: data.stockAdjustmentAccountCode ?? '',
      productionWipAccountCode: data.productionWipAccountCode ?? '',
      productionLaborAccountCode: data.productionLaborAccountCode ?? '',
      productionOverheadAccountCode: data.productionOverheadAccountCode ?? '',
      purchaseExpenseAccountCode: data.purchaseExpenseAccountCode ?? '',
      purchaseVatAccountCode: data.purchaseVatAccountCode ?? '',
      realizedFxGainAccountCode: data.realizedFxGainAccountCode ?? '',
      realizedFxLossAccountCode: data.realizedFxLossAccountCode ?? '',
      unrealizedFxGainAccountCode: data.unrealizedFxGainAccountCode ?? '',
      unrealizedFxLossAccountCode: data.unrealizedFxLossAccountCode ?? '',
    });
    setEditableTaxRates(Array.isArray(data.taxRates) ? data.taxRates : []);
    setEditableTaxBrackets(Array.isArray(data.taxBrackets) ? data.taxBrackets : []);
    setTaxRates(toJson(data.taxRates));
    setTaxBrackets(toJson(data.taxBrackets));
    setPayrollConfig(toJson(data.payrollConfig ?? {}));
    setAccounts(toJson(data.accounts.map(({ code, description, classNumber, type, financialCategory, parentCode, isPostingAllowed }) => ({
      code,
      description,
      classNumber,
      type,
      financialCategory,
      parentCode,
      isPostingAllowed,
    }))));
    const rubriquePayload = await readResponse(await fetch(
      `/api/hr/rubriques?countryCode=${encodeURIComponent(data.code)}`,
      { headers: headers() },
    ));
    if (!Array.isArray(rubriquePayload)) throw new Error('La liste de rubriques reçue est invalide.');
    setRubriques(toJson((rubriquePayload as CountryRubrique[]).map(({ code, label, category, defaultAmount }) => ({
      code,
      label,
      category,
      defaultAmount,
    }))));
    const revisionPayload = await readResponse(await fetch(
      `/api/admin/countries/${encodeURIComponent(data.code)}/revisions`,
      { headers: headers() },
    ));
    if (!Array.isArray(revisionPayload)) throw new Error('La liste des versions réglementaires reçue est invalide.');
    setRevisions(revisionPayload as RegulatoryRevision[]);
  };

  useEffect(() => {
    let active = true;
    if (!accessToken || !isAdmin) return () => { active = false; };
    setIsLoading(true);
    setError('');
    loadCountries('TN')
      .catch((cause: unknown) => {
        if (active) setError(cause instanceof Error ? cause.message : 'Impossible de charger les pays.');
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });
    return () => { active = false; };
  }, [accessToken, isAdmin]);

  const save = async (label: string, url: string, body: unknown) => {
    if (!accessToken || !country || isSaving) return;
    setIsSaving(true);
    setError('');
    setMessage('');
    try {
      await readResponse(await fetch(url, {
        method: 'PUT',
        headers: headers(),
        body: JSON.stringify(body),
      }));
      await loadCountry(country.code);
      setMessage(`${label} enregistré pour ${country.code}.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : `Échec de l’enregistrement de ${label}.`);
    } finally {
      setIsSaving(false);
    }
  };

  const createCountry = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!accessToken || isSaving) return;
    setIsSaving(true);
    setError('');
    setMessage('');
    try {
      const body = {
        code: newCountry.code,
        name: newCountry.name,
        currencyCode: newCountry.currencyCode,
        currencySymbol: newCountry.currencySymbol,
        stampDuty: newCountry.stampDuty.trim() ? Number(newCountry.stampDuty) : null,
        corporateTax: newCountry.corporateTax.trim() ? Number(newCountry.corporateTax) : null,
      };
      await readResponse(await fetch('/api/admin/countries', {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify(body),
      }));
      const code = newCountry.code.trim().toUpperCase();
      setNewCountry(emptyCountry);
      await loadCountries(code);
      setMessage(`Profil ${code} créé sans paramètres réglementaires prédéfinis.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Impossible de créer le profil pays.');
    } finally {
      setIsSaving(false);
    }
  };

  const createRevision = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!accessToken || !country || isSaving) return;
    setIsSaving(true);
    setError('');
    setMessage('');
    try {
      await readResponse(await fetch(`/api/admin/countries/${encodeURIComponent(country.code)}/revisions`, {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({
          ...revisionDraft,
          effectiveTo: revisionDraft.effectiveTo || null,
          ...(revisionDraft.supersedesRevisionId ? {} : { closureNote: '' }),
        }),
      }));
      setRevisionDraft((previous) => ({
        ...previous,
        source: '',
        supersedesRevisionId: '',
        closureNote: '',
        retroactiveConfirmed: false,
      }));
      await loadCountry(country.code);
      setMessage(`Version ${revisionDraft.configType} créée en brouillon pour ${country.code}.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Impossible de créer la version réglementaire.');
    } finally {
      setIsSaving(false);
    }
  };

  const updateRevisionStatus = async (revision: RegulatoryRevision, status: string) => {
    if (!accessToken || !country || isSaving) return;
    setIsSaving(true);
    setError('');
    setMessage('');
    try {
      await readResponse(await fetch(
        `/api/admin/countries/${encodeURIComponent(country.code)}/revisions/${encodeURIComponent(revision.id)}/status`,
        {
          method: 'PUT',
          headers: headers(),
          body: JSON.stringify({ status, note: reviewNotes[revision.id] ?? '' }),
        },
      ));
      await loadCountry(country.code);
      setMessage(`Statut de la version ${revision.configType} v${revision.version} mis à jour.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Impossible de modifier le statut.');
    } finally {
      setIsSaving(false);
    }
  };

  const inputStyle: React.CSSProperties = {
    width: '100%',
    boxSizing: 'border-box',
    padding: '8px',
    border: '1px solid #CBD5E1',
    borderRadius: '6px',
  };
  const areaStyle: React.CSSProperties = {
    ...inputStyle,
    minHeight: '180px',
    fontFamily: 'monospace',
    fontSize: '0.8rem',
  };
  const cardStyle: React.CSSProperties = {
    background: '#FFFFFF',
    border: '1px solid #E2E8F0',
    borderRadius: '10px',
    padding: '1rem',
    marginTop: '1rem',
  };
  const saveButtonStyle: React.CSSProperties = {
    background: isSaving ? '#94A3B8' : '#2563EB',
    color: '#FFFFFF',
    border: 0,
    borderRadius: '6px',
    padding: '8px 12px',
    fontWeight: 700,
    cursor: isSaving ? 'wait' : 'pointer',
  };
  const accountsByCode = new Map((country?.accounts ?? []).map((account) => [account.code, account]));
  const orderedCountryAccounts = sortChartAccounts(country?.accounts ?? []);

  if (!isAdmin) {
    return <div role="alert" style={{ ...cardStyle, color: '#991B1B' }}>Cette configuration est réservée aux administrateurs.</div>;
  }

  return (
    <section style={{ background: '#F8FAFC', borderRadius: '12px', padding: '1.2rem' }}>
      <header>
        <h1 style={{ margin: '0 0 6px', color: '#0F172A' }}>Configuration réglementaire par pays</h1>
        <p style={{ color: '#475569', fontSize: '0.86rem' }}>
          La Tunisie reste la référence. Les valeurs sont éditables mais ne sont pas certifiées conformes; saisissez uniquement des paramètres confirmés par une source compétente.
        </p>
      </header>

      {error && <div role="alert" style={{ ...cardStyle, color: '#991B1B', borderColor: '#FCA5A5' }}>{error}</div>}
      {message && <div role="status" style={{ ...cardStyle, color: '#166534', borderColor: '#86EFAC' }}>{message}</div>}
      {isLoading && <div role="status" style={cardStyle}>Chargement des profils pays…</div>}

      <div style={cardStyle}>
        <label style={{ display: 'block', fontWeight: 700, marginBottom: 6 }} htmlFor="country-select">Pays configuré</label>
        <select
          id="country-select"
          value={selectedCode}
          onChange={(event) => {
            setSelectedCode(event.target.value);
            setError('');
            setMessage('');
            loadCountry(event.target.value).catch((cause: unknown) => setError(cause instanceof Error ? cause.message : 'Chargement impossible.'));
          }}
          style={{ ...inputStyle, maxWidth: '420px' }}
          disabled={isLoading || isSaving}
        >
          {countries.map((item) => <option key={item.code} value={item.code}>{item.code} — {item.name}</option>)}
        </select>
        {country && (
          <div style={{ color: '#64748B', marginTop: 6, fontSize: '0.8rem' }}>
            {country.isDefault ? 'Pays de référence par défaut' : 'Profil pays distinct'} — devise {country.currencyCode}.
          </div>
        )}
      </div>

      {country && (
        <>
          {isAdmin && (
            <CustomsTariffImportPanel accessToken={accessToken} countryCode={country.code} />
          )}
          <CountryTaxRulesPanel accessToken={accessToken} countryCode={country.code} />
          <div style={cardStyle}>
            <h2 style={{ marginTop: 0 }}>Identité et paramètres du profil</h2>
            <p style={{ color: '#64748B', fontSize: '0.82rem' }}>
              Les taux et montants réglementaires laissés vides restent non configurés; les opérations qui en dépendent sont bloquées jusqu’à validation et saisie par un expert. Les comptes sont configurables par pays et vérifiés dans le plan comptable au moment de la comptabilisation. Cette saisie ne certifie pas la conformité locale.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
              {([
                ['name', 'Nom du pays', 'text'],
                ['currencyCode', 'Code devise', 'text'],
                ['currencySymbol', 'Symbole devise', 'text'],
                ['stampDuty', 'Droit de timbre (valeur saisie)', 'number'],
                ['corporateTax', 'Taux IS (%)', 'number'],
                ['salesReceivableAccountCode', 'Compte clients ventes', 'text'],
                ['salesRevenueAccountCode', 'Compte produits ventes', 'text'],
                ['salesVatAccountCode', 'Compte TVA collectée', 'text'],
                ['salesStampDutyAccountCode', 'Compte droit de timbre', 'text'],
                ['stockAssetAccountCode', 'Compte de stock (actif)', 'text'],
                ['stockAdjustmentAccountCode', 'Compte d’ajustement de stock (charge)', 'text'],
                ['productionWipAccountCode', 'Compte production en cours (actif)', 'text'],
                ['productionLaborAccountCode', 'Compte de contrepartie main-d’œuvre (charge)', 'text'],
                ['productionOverheadAccountCode', 'Compte de contrepartie frais indirects (charge)', 'text'],
                ['purchaseExpenseAccountCode', 'Compte de charges achats', 'text'],
                ['purchaseVatAccountCode', 'Compte TVA déductible achats', 'text'],
                ['realizedFxGainAccountCode', 'Compte gains de change réalisés', 'text'],
                ['realizedFxLossAccountCode', 'Compte pertes de change réalisées', 'text'],
                ['unrealizedFxGainAccountCode', 'Compte gains de change non réalisés', 'text'],
                ['unrealizedFxLossAccountCode', 'Compte pertes de change non réalisées', 'text'],
              ] as const).map(([field, label, type]) => (
                <label key={field} style={{ display: 'grid', gap: 5, fontSize: '0.82rem', fontWeight: 700 }}>
                  {label}
                  <input
                    type={type}
                    step={type === 'number' ? '0.001' : undefined}
                    value={profile[field]}
                    onChange={(event) => setProfile((previous) => ({ ...previous, [field]: event.target.value }))}
                    style={inputStyle}
                  />
                </label>
              ))}
            </div>
            <button type="button" disabled={isSaving} style={{ ...saveButtonStyle, marginTop: 12 }} onClick={() => {
              const stampDuty = profile.stampDuty.trim() ? Number(profile.stampDuty) : null;
              const corporateTax = profile.corporateTax.trim() ? Number(profile.corporateTax) : null;
              if ((stampDuty !== null && !Number.isFinite(stampDuty)) || (corporateTax !== null && !Number.isFinite(corporateTax))) {
                setError('Les paramètres numériques doivent être des valeurs finies ou rester non configurés.');
                return;
              }
              void save('Profil', `/api/admin/countries/${encodeURIComponent(country.code)}`, {
                name: profile.name,
                currencyCode: profile.currencyCode,
                currencySymbol: profile.currencySymbol,
                stampDuty,
                corporateTax,
                salesReceivableAccountCode: profile.salesReceivableAccountCode.trim() || null,
                salesRevenueAccountCode: profile.salesRevenueAccountCode.trim() || null,
                salesVatAccountCode: profile.salesVatAccountCode.trim() || null,
                salesStampDutyAccountCode: profile.salesStampDutyAccountCode.trim() || null,
                stockAssetAccountCode: profile.stockAssetAccountCode.trim() || null,
                stockAdjustmentAccountCode: profile.stockAdjustmentAccountCode.trim() || null,
                productionWipAccountCode: profile.productionWipAccountCode.trim() || null,
                productionLaborAccountCode: profile.productionLaborAccountCode.trim() || null,
                productionOverheadAccountCode: profile.productionOverheadAccountCode.trim() || null,
                purchaseExpenseAccountCode: profile.purchaseExpenseAccountCode.trim() || null,
                purchaseVatAccountCode: profile.purchaseVatAccountCode.trim() || null,
                realizedFxGainAccountCode: profile.realizedFxGainAccountCode.trim() || null,
                realizedFxLossAccountCode: profile.realizedFxLossAccountCode.trim() || null,
                unrealizedFxGainAccountCode: profile.unrealizedFxGainAccountCode.trim() || null,
                unrealizedFxLossAccountCode: profile.unrealizedFxLossAccountCode.trim() || null,
              });
            }}>Enregistrer le profil</button>
          </div>

          <div style={cardStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <h2 style={{ margin: 0 }}>Taux fiscaux (TVA, Retenues & Taxes modifiables)</h2>
              <button
                type="button"
                onClick={() => {
                  setEditableTaxRates((prev) => [
                    ...prev,
                    { code: `TAX_${prev.length + 1}`, name: 'Nouvelle Taxe', rate: 19.0, isDefault: false, purchaseVatRecoverable: true },
                  ]);
                }}
                style={{ background: '#2563EB', color: '#FFF', border: 'none', padding: '6px 12px', borderRadius: 6, fontSize: '0.8rem', cursor: 'pointer', fontWeight: 600 }}
              >
                + Ajouter une taxe
              </button>
            </div>
            <p style={{ color: '#64748B', fontSize: '0.82rem' }}>
              Modifiez directement les taux applicables pour ce pays (Tunisie, France, Algérie, Maroc, etc.). Les valeurs sont enregistrées et prises en compte par la facturation et les déclarations.
            </p>
            <div style={{ overflowX: 'auto', marginBottom: 12 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                <thead>
                  <tr style={{ background: '#F8FAFC', borderBottom: '2px solid #E2E8F0', textAlign: 'left', color: '#475569' }}>
                    <th style={{ padding: '8px' }}>Code</th>
                    <th style={{ padding: '8px' }}>Désignation de la Taxe</th>
                    <th style={{ padding: '8px' }}>Taux (%)</th>
                    <th style={{ padding: '8px', textAlign: 'center' }}>TVA Déductible</th>
                    <th style={{ padding: '8px', textAlign: 'center' }}>Par Défaut</th>
                    <th style={{ padding: '8px', textAlign: 'center' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {editableTaxRates.map((tr, idx) => (
                    <tr key={idx} style={{ borderBottom: '1px solid #E2E8F0' }}>
                      <td style={{ padding: '6px 8px' }}>
                        <input
                          type="text"
                          value={tr.code}
                          onChange={(e) => {
                            const val = e.target.value;
                            setEditableTaxRates((prev) => prev.map((r, i) => i === idx ? { ...r, code: val } : r));
                          }}
                          style={{ width: '100px', padding: '5px 8px', border: '1px solid #CBD5E1', borderRadius: 5, fontSize: '0.82rem' }}
                        />
                      </td>
                      <td style={{ padding: '6px 8px' }}>
                        <input
                          type="text"
                          value={tr.name}
                          onChange={(e) => {
                            const val = e.target.value;
                            setEditableTaxRates((prev) => prev.map((r, i) => i === idx ? { ...r, name: val } : r));
                          }}
                          style={{ width: '100%', minWidth: '160px', padding: '5px 8px', border: '1px solid #CBD5E1', borderRadius: 5, fontSize: '0.82rem' }}
                        />
                      </td>
                      <td style={{ padding: '6px 8px' }}>
                        <input
                          type="number"
                          step="0.1"
                          value={tr.rate}
                          onChange={(e) => {
                            const val = parseFloat(e.target.value) || 0;
                            setEditableTaxRates((prev) => prev.map((r, i) => i === idx ? { ...r, rate: val } : r));
                          }}
                          style={{ width: '80px', padding: '5px 8px', border: '1px solid #CBD5E1', borderRadius: 5, fontSize: '0.82rem', fontWeight: 650 }}
                        />
                      </td>
                      <td style={{ padding: '6px 8px', textAlign: 'center' }}>
                        <input
                          type="checkbox"
                          checked={tr.purchaseVatRecoverable}
                          onChange={(e) => {
                            const val = e.target.checked;
                            setEditableTaxRates((prev) => prev.map((r, i) => i === idx ? { ...r, purchaseVatRecoverable: val } : r));
                          }}
                        />
                      </td>
                      <td style={{ padding: '6px 8px', textAlign: 'center' }}>
                        <input
                          type="checkbox"
                          checked={tr.isDefault}
                          onChange={(e) => {
                            const val = e.target.checked;
                            setEditableTaxRates((prev) => prev.map((r, i) => i === idx ? { ...r, isDefault: val } : r));
                          }}
                        />
                      </td>
                      <td style={{ padding: '6px 8px', textAlign: 'center' }}>
                        <button
                          type="button"
                          onClick={() => setEditableTaxRates((prev) => prev.filter((_, i) => i !== idx))}
                          style={{ background: '#FEE2E2', color: '#DC2626', border: '1px solid #FCA5A5', padding: '4px 8px', borderRadius: 4, cursor: 'pointer', fontSize: '0.75rem' }}
                        >
                          ✕
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <button
              type="button"
              disabled={isSaving}
              style={{ ...saveButtonStyle, marginTop: 4 }}
              onClick={() => {
                void save('Taux fiscaux', `/api/admin/countries/${encodeURIComponent(country.code)}/tax-rates`, {
                  rates: editableTaxRates,
                });
              }}
            >
              Enregistrer les taux fiscaux
            </button>
          </div>

          <div style={cardStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <h2 style={{ margin: 0 }}>Barème de l’Impôt (IRPP / Tranches fiscales progressives)</h2>
              <button
                type="button"
                onClick={() => {
                  setEditableTaxBrackets((prev) => [
                    ...prev,
                    { order: prev.length + 1, minAmount: prev.length > 0 ? (prev[prev.length - 1].maxAmount ?? 50000) : 0, maxAmount: null, rate: 35.0 },
                  ]);
                }}
                style={{ background: '#0D9488', color: '#FFF', border: 'none', padding: '6px 12px', borderRadius: 6, fontSize: '0.8rem', cursor: 'pointer', fontWeight: 600 }}
              >
                + Ajouter une tranche
              </button>
            </div>
            <p style={{ color: '#64748B', fontSize: '0.82rem' }}>
              Tranches de l’impôt progressif sur le revenu (IRPP tunisien à 8 tranches ou barème d’un autre pays). Modifiez directement les seuils et taux.
            </p>
            <div style={{ overflowX: 'auto', marginBottom: 12 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                <thead>
                  <tr style={{ background: '#F8FAFC', borderBottom: '2px solid #E2E8F0', textAlign: 'left', color: '#475569' }}>
                    <th style={{ padding: '8px' }}>N°</th>
                    <th style={{ padding: '8px' }}>Revenu Min ({country.currencySymbol || 'DT'})</th>
                    <th style={{ padding: '8px' }}>Revenu Max ({country.currencySymbol || 'DT'})</th>
                    <th style={{ padding: '8px' }}>Taux d’imposition (%)</th>
                    <th style={{ padding: '8px', textAlign: 'center' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {editableTaxBrackets.map((br, idx) => (
                    <tr key={idx} style={{ borderBottom: '1px solid #E2E8F0' }}>
                      <td style={{ padding: '6px 8px', fontWeight: 700 }}>
                        Tranche {br.order || idx + 1}
                      </td>
                      <td style={{ padding: '6px 8px' }}>
                        <input
                          type="number"
                          step="100"
                          value={br.minAmount}
                          onChange={(e) => {
                            const val = parseFloat(e.target.value) || 0;
                            setEditableTaxBrackets((prev) => prev.map((b, i) => i === idx ? { ...b, minAmount: val } : b));
                          }}
                          style={{ width: '130px', padding: '5px 8px', border: '1px solid #CBD5E1', borderRadius: 5, fontSize: '0.82rem' }}
                        />
                      </td>
                      <td style={{ padding: '6px 8px' }}>
                        <input
                          type="number"
                          step="100"
                          placeholder="Illimité (dernière tranche)"
                          value={br.maxAmount === null ? '' : br.maxAmount}
                          onChange={(e) => {
                            const val = e.target.value === '' ? null : (parseFloat(e.target.value) || 0);
                            setEditableTaxBrackets((prev) => prev.map((b, i) => i === idx ? { ...b, maxAmount: val } : b));
                          }}
                          style={{ width: '130px', padding: '5px 8px', border: '1px solid #CBD5E1', borderRadius: 5, fontSize: '0.82rem' }}
                        />
                      </td>
                      <td style={{ padding: '6px 8px' }}>
                        <input
                          type="number"
                          step="0.5"
                          value={br.rate}
                          onChange={(e) => {
                            const val = parseFloat(e.target.value) || 0;
                            setEditableTaxBrackets((prev) => prev.map((b, i) => i === idx ? { ...b, rate: val } : b));
                          }}
                          style={{ width: '85px', padding: '5px 8px', border: '1px solid #CBD5E1', borderRadius: 5, fontSize: '0.82rem', fontWeight: 650 }}
                        />
                      </td>
                      <td style={{ padding: '6px 8px', textAlign: 'center' }}>
                        <button
                          type="button"
                          onClick={() => setEditableTaxBrackets((prev) => prev.filter((_, i) => i !== idx))}
                          style={{ background: '#FEE2E2', color: '#DC2626', border: '1px solid #FCA5A5', padding: '4px 8px', borderRadius: 4, cursor: 'pointer', fontSize: '0.75rem' }}
                        >
                          ✕
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <button
              type="button"
              disabled={isSaving}
              style={{ ...saveButtonStyle, marginTop: 4 }}
              onClick={() => {
                void save('Barème', `/api/admin/countries/${encodeURIComponent(country.code)}/tax-brackets`, {
                  brackets: editableTaxBrackets,
                });
              }}
            >
              Enregistrer le barème IRPP
            </button>
          </div>

          <div style={cardStyle}>
            <h2 style={{ marginTop: 0 }}>Plan comptable du pays</h2>
            <p style={{ color: '#64748B', fontSize: '0.82rem' }}>
              Les comptes transmis sont ajoutés ou mis à jour sans suppression des autres comptes. La hiérarchie utilise `parentCode` et `isPostingAllowed`; les parents doivent être non comptabilisables et de même classe/type. Pour activer les ratios, attribuez explicitement `financialCategory` à chaque compte comptabilisable; les catégories doivent correspondre à leur type. Aucune catégorie n’est déduite des numéros de compte. Valeurs disponibles : {Object.keys(FINANCIAL_ACCOUNT_CATEGORIES).join(', ')}. Les groupements de démonstration du stock ne constituent pas une validation du plan local.
            </p>
            {country.accounts.length > 0 && (
              <ul role="tree" aria-label="Hiérarchie des comptes" style={{ display: 'grid', gap: 6, listStyle: 'none', margin: '0 0 12px', padding: 0 }}>
                {orderedCountryAccounts.map((account) => {
                  const palette = accountClassPresentation(account.classNumber);
                  const depth = chartAccountDepth(account, accountsByCode);
                  return (
                    <li
                      key={account.code}
                      role="treeitem"
                      aria-level={depth + 1}
                      style={{
                        marginLeft: depth * 16,
                        padding: '7px 10px',
                        border: `1px solid ${palette.border}`,
                        borderRadius: 7,
                        background: palette.background,
                        color: palette.color,
                      }}
                    >
                      <strong>{account.code}</strong> · {account.description}
                      <span style={{ marginLeft: 8, fontSize: '0.72rem', fontWeight: 700 }}>{palette.label}</span>
                      {account.financialCategory && (
                        <span style={{ marginLeft: 8, fontSize: '0.72rem' }}>
                          {FINANCIAL_ACCOUNT_CATEGORIES[account.financialCategory].label}
                        </span>
                      )}
                      {account.parentCode && <span style={{ marginLeft: 8, fontSize: '0.72rem' }}>Sous-compte de {account.parentCode}</span>}
                      {!account.isPostingAllowed && <span style={{ marginLeft: 8, fontSize: '0.72rem', fontWeight: 700 }}>Regroupement non comptabilisable</span>}
                    </li>
                  );
                })}
              </ul>
            )}
            <textarea aria-label="Plan comptable JSON" value={accounts} onChange={(event) => setAccounts(event.target.value)} style={areaStyle} />
            <button type="button" disabled={isSaving} style={{ ...saveButtonStyle, marginTop: 8 }} onClick={() => {
              try {
                void save('Plan comptable', `/api/admin/countries/${encodeURIComponent(country.code)}/accounts`, {
                  accounts: parseJson(accounts, 'plan comptable'),
                });
              } catch (cause) { setError(cause instanceof Error ? cause.message : 'JSON invalide.'); }
            }}>Ajouter / mettre à jour les comptes</button>
          </div>

          <div style={cardStyle}>
            <h2 style={{ marginTop: 0 }}>Rubriques de paie du pays</h2>
            <p style={{ color: '#64748B', fontSize: '0.82rem' }}>
              Configuration distincte par pays. Pour TN, les anciennes rubriques globales restent visibles afin de préserver les usages. Les valeurs sont ajoutées ou mises à jour sans supprimer les rubriques existantes. Ce paramétrage ne valide pas leur traitement légal.
            </p>
            <textarea aria-label="Rubriques de paie JSON" value={rubriques} onChange={(event) => setRubriques(event.target.value)} style={areaStyle} />
            <button type="button" disabled={isSaving} style={{ ...saveButtonStyle, marginTop: 8 }} onClick={() => {
              try {
                void save('Rubriques de paie', `/api/hr/rubriques/${encodeURIComponent(country.code)}`, {
                  rubriques: parseJson(rubriques, 'rubriques de paie'),
                });
              } catch (cause) { setError(cause instanceof Error ? cause.message : 'JSON invalide.'); }
            }}>Ajouter / mettre à jour les rubriques</button>
          </div>

          <div style={cardStyle}>
            <h2 style={{ marginTop: 0 }}>Versions, sources et période d’effet</h2>
            <p style={{ color: '#9A3412', background: '#FFF7ED', padding: 10, borderRadius: 6, fontSize: '0.82rem' }}>
              Chaque version conserve un instantané des paramètres actuels. Une nouvelle règle officielle peut clôturer la période d’une version antérieure et créer sa successeure; la source et la justification sont obligatoires. Les statuts ne certifient pas la conformité et n’activent pas les calculs réglementaires.
            </p>
            <form onSubmit={createRevision} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10 }}>
              <label style={{ display: 'grid', gap: 5, fontSize: '0.82rem', fontWeight: 700 }}>
                Domaine
                <select value={revisionDraft.configType} onChange={(event) => setRevisionDraft((previous) => ({ ...previous, configType: event.target.value }))} style={inputStyle}>
                  <option value="PROFILE">Profil général</option>
                  <option value="TAX">Fiscalité</option>
                  <option value="PAYROLL">Paie</option>
                  <option value="ACCOUNTING">Comptabilité</option>
                </select>
              </label>
              <label style={{ display: 'grid', gap: 5, fontSize: '0.82rem', fontWeight: 700 }}>
                Début d’effet
                <input required type="date" value={revisionDraft.effectiveFrom} onChange={(event) => setRevisionDraft((previous) => ({ ...previous, effectiveFrom: event.target.value }))} style={inputStyle} />
              </label>
              <label style={{ display: 'grid', gap: 5, fontSize: '0.82rem', fontWeight: 700 }}>
                Fin d’effet (facultative)
                <input type="date" value={revisionDraft.effectiveTo} onChange={(event) => setRevisionDraft((previous) => ({ ...previous, effectiveTo: event.target.value }))} style={inputStyle} />
              </label>
              <label style={{ display: 'grid', gap: 5, fontSize: '0.82rem', fontWeight: 700 }}>
                Source / référence officielle
                <input required maxLength={500} value={revisionDraft.source} onChange={(event) => setRevisionDraft((previous) => ({ ...previous, source: event.target.value }))} style={inputStyle} />
              </label>
              <label style={{ display: 'grid', gap: 5, fontSize: '0.82rem', fontWeight: 700 }}>
                Remplacer une version (facultatif)
                <select
                  value={revisionDraft.supersedesRevisionId}
                  onChange={(event) => setRevisionDraft((previous) => ({ ...previous, supersedesRevisionId: event.target.value }))}
                  style={inputStyle}
                >
                  <option value="">Aucune — conflit refusé si chevauchement</option>
                  {revisions.filter((item) => item.configType === revisionDraft.configType
                    && item.status !== 'REJECTED'
                    && item.effectiveFrom.slice(0, 10) < revisionDraft.effectiveFrom
                    && (!item.effectiveTo || revisionDraft.effectiveFrom <= item.effectiveTo.slice(0, 10)))
                    .map((item) => (
                      <option key={item.id} value={item.id}>
                        v{item.version} ({item.effectiveFrom.slice(0, 10)} — {item.effectiveTo?.slice(0, 10) ?? 'sans fin'})
                      </option>
                    ))}
                </select>
              </label>
              {revisionDraft.supersedesRevisionId && (
                <label style={{ display: 'grid', gap: 5, fontSize: '0.82rem', fontWeight: 700 }}>
                  Justification de clôture
                  <input
                    required
                    minLength={3}
                    maxLength={500}
                    value={revisionDraft.closureNote}
                    onChange={(event) => setRevisionDraft((previous) => ({ ...previous, closureNote: event.target.value }))}
                    style={inputStyle}
                  />
                </label>
              )}
              {revisionDraft.effectiveFrom < new Date().toISOString().slice(0, 10) && (
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.82rem', fontWeight: 700 }}>
                  <input
                    type="checkbox"
                    checked={revisionDraft.retroactiveConfirmed}
                    onChange={(event) => setRevisionDraft((previous) => ({ ...previous, retroactiveConfirmed: event.target.checked }))}
                  />
                  Je confirme la date d’effet rétroactive indiquée par la source officielle.
                </label>
              )}
              <button type="submit" disabled={isSaving} style={{ ...saveButtonStyle, alignSelf: 'end' }}>
                {revisionDraft.supersedesRevisionId ? 'Clôturer et créer la version suivante' : 'Capturer une version brouillon'}
              </button>
            </form>
            {revisions.length === 0 ? (
              <p style={{ color: '#64748B' }}>Aucune version tracée pour ce pays.</p>
            ) : revisions.map((revision) => {
              const nextStatus: Record<string, string> = {
                DRAFT: 'IN_REVIEW',
                IN_REVIEW: 'REVIEWED',
                REVIEWED: 'APPROVED',
              };
              const next = nextStatus[revision.status];
              return (
                <div key={revision.id} style={{ borderTop: '1px solid #E2E8F0', padding: '12px 0' }}>
                  <strong>
                    {revision.configType} v{revision.version} — {revision.status}
                    {revision.status === 'APPROVED' && ' (approbation interne, non certifiée)'}
                    {revision.status === 'REVIEWED' && ' (revue interne)'}
                  </strong>
                  <div style={{ color: '#475569', fontSize: '0.82rem', marginTop: 4 }}>
                    Effet : {revision.effectiveFrom.slice(0, 10)}{revision.effectiveTo ? ` au ${revision.effectiveTo.slice(0, 10)}` : ' sans date de fin'} · Source : {revision.source} · Créée par {revision.createdBy}
                    {revision.reviewer && <> · Revue par {revision.reviewer} : {revision.reviewNote}</>}
                    {revision.approvedBy && <> · Approbation interne par {revision.approvedBy} : {revision.approvalNote}</>}
                    {revision.periodClosedAt && <> · Période clôturée le {revision.periodClosedAt.slice(0, 10)} par {revision.periodClosedBy} : {revision.periodClosureNote}</>}
                    {revision.retroactiveConfirmed && <> · Date d’effet rétroactive explicitement confirmée</>}
                  </div>
                  {next && (
                    <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                      <input
                        aria-label={`Note de revue ${revision.configType} v${revision.version}`}
                        placeholder="Note de revue interne (ne vaut pas certification juridique)"
                        value={reviewNotes[revision.id] ?? ''}
                        onChange={(event) => setReviewNotes((previous) => ({ ...previous, [revision.id]: event.target.value }))}
                        style={{ ...inputStyle, maxWidth: 380 }}
                      />
                      <button type="button" disabled={isSaving} style={saveButtonStyle} onClick={() => void updateRevisionStatus(revision, next)}>
                        Marquer : {next} (workflow interne)
                      </button>
                      {revision.status === 'IN_REVIEW' && (
                        <button type="button" disabled={isSaving} style={{ ...saveButtonStyle, background: '#B91C1C' }} onClick={() => void updateRevisionStatus(revision, 'REJECTED')}>
                          Rejeter
                        </button>
                      )}
                    </div>
                  )}
                  <details style={{ marginTop: 8 }}>
                    <summary style={{ cursor: 'pointer', color: '#2563EB' }}>Voir l’instantané enregistré</summary>
                    <pre style={{ overflowX: 'auto', background: '#F1F5F9', padding: 10, borderRadius: 6, fontSize: '0.75rem' }}>{JSON.stringify(JSON.parse(revision.snapshot), null, 2)}</pre>
                  </details>
                </div>
              );
            })}
          </div>
        </>
      )}

      <form onSubmit={createCountry} style={cardStyle}>
        <h2 style={{ marginTop: 0 }}>Ajouter une juridiction</h2>
        <p style={{ color: '#64748B', fontSize: '0.82rem' }}>Aucun paramètre fiscal ou réglementaire n’est créé automatiquement. Laissez les valeurs générales vides tant qu’elles ne sont pas validées; les opérations qui en dépendent resteront bloquées.</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
          {([
            ['code', 'Code pays', 'text'],
            ['name', 'Nom', 'text'],
            ['currencyCode', 'Code devise', 'text'],
            ['currencySymbol', 'Symbole devise', 'text'],
            ['stampDuty', 'Droit de timbre', 'number'],
            ['corporateTax', 'Taux IS (%)', 'number'],
          ] as const).map(([field, label, type]) => (
            <label key={field} style={{ display: 'grid', gap: 5, fontSize: '0.82rem', fontWeight: 700 }}>
              {label}
              <input
                type={type}
                step={type === 'number' ? '0.001' : undefined}
                required={field !== 'stampDuty' && field !== 'corporateTax'}
                value={newCountry[field]}
                onChange={(event) => setNewCountry((previous) => ({ ...previous, [field]: event.target.value }))}
                style={inputStyle}
              />
            </label>
          ))}
        </div>
        <button type="submit" disabled={isSaving} style={{ ...saveButtonStyle, marginTop: 12 }}>Créer le profil pays</button>
      </form>
    </section>
  );
}
